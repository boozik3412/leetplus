import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO,
  CURRENT187_CONNECTION_NEGATIVE_SCENARIOS,
  CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
  isVerifiedCurrent187ConnectionProbeReceipt,
  verifySyntheticCurrent187ConnectionProbeEnvelope,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
  runCurrent187ConnectionProbeMatrix,
  runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly,
} from "./identity-mail-cluster-connection-probe-runner-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_SIGNER_STATUS,
  createCurrent187ConnectionProbeSignerAuthorityForTestOnly,
  loadCurrent187ConnectionProbeSignerAuthority,
  signCurrent187ConnectionProbeRunnerReceipt,
  signCurrent187ConnectionProbeRunnerReceiptForTestOnly,
} from "./identity-mail-cluster-connection-probe-signer-current187.mjs";
import { CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND } from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import { CURRENT187_POSTGRES_SESSION_RECEIPT_KIND } from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const RELEASE_SHA = "a".repeat(40);
const CLUSTER_DIGEST = digest("cluster");
const UNIVERSE_DIGEST = digest("universe");

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function session(purpose) {
  return {
    applicationNameDigest: digest(purpose + ":application"),
    authorization: false,
    backendIdentityDigest: digest(purpose + ":backend"),
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: CLUSTER_DIGEST,
    databaseUniverseDigest: UNIVERSE_DIGEST,
    kind: CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
    positiveProbeDigest: digest(purpose + ":positive"),
    postgresSessionReceiptDigest: digest(purpose + ":session-receipt"),
    purpose,
    releaseSha: RELEASE_SHA,
    secretReferenceDigest: digest(purpose + ":secret-reference"),
    sourceDatabaseIoPerformed: true,
    syntheticOnly: true,
    transportTlsObserved: true,
  };
}

function service(purpose, index) {
  const postgresSessionReceipt = session(purpose);
  return {
    allowedOperationsDigest: digest(purpose + ":operations"),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceipt: {
      authorization: false,
      canMutate: false,
      canSend: false,
      clusterIdentityDigest: CLUSTER_DIGEST,
      databaseUniverseDigest: UNIVERSE_DIGEST,
      endpointTlsPeerReceiptDigest: digest(purpose + ":tls-receipt"),
      kind: CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
      postgresSessionReceiptDigest:
        postgresSessionReceipt.postgresSessionReceiptDigest,
      purpose,
      releaseSha: RELEASE_SHA,
      sourceNetworkIoPerformed: true,
      syntheticOnly: true,
      tlsCaVerified: true,
      tlsHostnameVerified: true,
    },
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(purpose + ":hba-rule"),
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
      challengeDigest: digest(purpose + ":" + scenario + ":challenge"),
      clientCertificatePem: null,
      clientCertificateSha256: null,
      clientPrivateKeyPem: null,
      clientPrivateKeySha256: null,
      connectionString:
        "postgresql://" +
        (scenario === "WRONG_ROLE" ? "wrong-" + index : "allowed-" + index) +
        ":not-a-secret@localhost:5432/" +
        (scenario === "WRONG_DATABASE" ? "missing_" + index : "db_" + index) +
        "?sslmode=" +
        (scenario === "PLAINTEXT_TRANSPORT" ? "disable" : "verify-full"),
      scenario,
      serverName:
        scenario === "PLAINTEXT_TRANSPORT"
          ? null
          : scenario === "WRONG_HOSTNAME"
            ? "wrong.invalid"
            : "localhost",
    })),
    poolerMappingDigest: digest(purpose + ":pooler-mapping"),
    poolMode: index === 0 ? "TRANSACTION" : "SESSION",
    postgresSessionReceipt,
    purpose,
    tlsMode: "VERIFY_FULL",
  };
}

function runnerInput() {
  const hbaReloadReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: CLUSTER_DIGEST,
    databaseUniverseDigest: UNIVERSE_DIGEST,
    hbaReloadReceiptDigest: digest("hba-receipt"),
    releaseSha: RELEASE_SHA,
    reloadEpochDigest: digest("reload-epoch"),
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
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(service),
  };
}

async function runnerReceipt() {
  return runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly(
    runnerInput(),
    {
      attemptRejectedConnection: async ({ scenario }) => ({
        connected: false,
        errorCode: "EXPECTED_" + scenario,
        observedOutcome:
          CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario],
      }),
      now: () => new Date().toISOString(),
    },
    {
      environment: "ci",
      explicitConfirmation:
        CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
    },
  );
}

function timeline() {
  const now = Date.now();
  return {
    keyId: "current187-connection-probe-test-1",
    notAfter: new Date(now + 60 * 60 * 1_000).toISOString(),
    notBefore: new Date(now - 60 * 60 * 1_000).toISOString(),
  };
}

function expectCode(code) {
  return (error) =>
    error?.safeContractError === true &&
    error.code === code &&
    error.reasonCode === code;
}

test("test signer turns an exact branded R1 receipt into a verifiable J5 envelope", async () => {
  const authority =
    createCurrent187ConnectionProbeSignerAuthorityForTestOnly(timeline());
  const receipt = await runnerReceipt();
  const envelope = await signCurrent187ConnectionProbeRunnerReceiptForTestOnly(
    authority,
    receipt,
  );
  const verified = verifySyntheticCurrent187ConnectionProbeEnvelope(
    envelope,
    { [authority.keyId]: authority.root },
    {
      databaseName: "leetplus_ci",
      endpointHost: "127.0.0.1",
      environment: "ci",
      explicitConfirmation: CURRENT187_CONNECTION_PROBE_SYNTHETIC_CONFIRMATION,
      nodeEnv: "test",
    },
    envelope.payload.issuedAt,
  );

  assert.equal(isVerifiedCurrent187ConnectionProbeReceipt(verified), true);
  assert.equal(
    envelope.payload.probeTranscriptDigest,
    receipt.probeTranscriptDigest,
  );
  assert.equal(envelope.payload.operationId, receipt.operationId);
  assert.equal(envelope.payload.nonce, receipt.nonce);
  assert.equal(
    envelope.payload.hostControlChallengeDigest,
    receipt.hostControlChallengeDigest,
  );
  assert.equal(authority.authority.canConnectDatabase, false);
  assert.equal(authority.authority.canDeploy, false);
  assert.equal(authority.authority.canMutate, false);
  assert.equal(authority.authority.canSend, false);
  assert.equal(authority.authority.sharedBetaAccess, false);
  assert.doesNotMatch(
    JSON.stringify({ authority, envelope, verified }),
    /not-a-secret|postgresql:\/\/|BEGIN PRIVATE KEY/iu,
  );
});

test("signer rejects cloned receipts and keeps production and test authorities disjoint", async () => {
  const authority =
    createCurrent187ConnectionProbeSignerAuthorityForTestOnly(timeline());
  const receipt = await runnerReceipt();
  await assert.rejects(
    signCurrent187ConnectionProbeRunnerReceiptForTestOnly(authority, {
      ...receipt,
    }),
    expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_RUNNER_RECEIPT_INVALID"),
  );
  await assert.rejects(
    signCurrent187ConnectionProbeRunnerReceipt(authority, receipt),
    expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID"),
  );
  await assert.rejects(
    runCurrent187ConnectionProbeMatrix(runnerInput()),
    expectCode("CURRENT187_CONNECTION_PROBE_RUNNER_INPUT_INVALID"),
  );
});

test("file signer pins canonical external Ed25519 bytes and detects drift", async () => {
  const parent = resolve(REPOSITORY_ROOT, "..");
  const rootPath = await mkdtemp(join(parent, "lp-j5-signer-"));
  const privateKeyPath = join(rootPath, "signer-private.pk8");
  const publicKeyPath = join(rootPath, "signer-public.spki");
  const pair = generateKeyPairSync("ed25519");
  const privateBytes = Buffer.from(
    pair.privateKey.export({ format: "der", type: "pkcs8" }),
  );
  const publicBytes = Buffer.from(
    pair.publicKey.export({ format: "der", type: "spki" }),
  );
  try {
    await writeFile(privateKeyPath, privateBytes, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(publicKeyPath, publicBytes, {
      flag: "wx",
      mode: 0o644,
    });
    await assert.rejects(
      loadCurrent187ConnectionProbeSignerAuthority({
        expectedPublicKeySha256: "0".repeat(64),
        ...timeline(),
        privateKeyPath,
        publicKeyPath,
      }),
      expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID"),
    );
    const authority = await loadCurrent187ConnectionProbeSignerAuthority({
      expectedPublicKeySha256: sha256(publicBytes),
      ...timeline(),
      privateKeyPath,
      publicKeyPath,
    });
    assert.equal(authority.status, CURRENT187_CONNECTION_PROBE_SIGNER_STATUS);
    assert.equal(authority.publicKeyFingerprint, sha256(publicBytes));
    assert.equal(Object.hasOwn(authority, "privateKeyPath"), false);

    const replacement = generateKeyPairSync("ed25519");
    await writeFile(
      privateKeyPath,
      Buffer.from(
        replacement.privateKey.export({ format: "der", type: "pkcs8" }),
      ),
    );
    await assert.rejects(
      signCurrent187ConnectionProbeRunnerReceipt(
        authority,
        await runnerReceipt(),
      ),
      (error) =>
        error?.safeContractError === true &&
        new Set([
          "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_STALE",
          "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
        ]).has(error.code),
    );
  } finally {
    await unlink(privateKeyPath).catch(() => undefined);
    await unlink(publicKeyPath).catch(() => undefined);
    await rmdir(rootPath).catch(() => undefined);
  }
});

test("production signer rejects repository key files", async () => {
  const privateKeyPath = join(REPOSITORY_ROOT, "j5-private-forbidden.pk8");
  const publicKeyPath = join(REPOSITORY_ROOT, "j5-public-forbidden.spki");
  const pair = generateKeyPairSync("ed25519");
  const privateBytes = Buffer.from(
    pair.privateKey.export({ format: "der", type: "pkcs8" }),
  );
  const publicBytes = Buffer.from(
    pair.publicKey.export({ format: "der", type: "spki" }),
  );
  try {
    await writeFile(privateKeyPath, privateBytes, {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(publicKeyPath, publicBytes, {
      flag: "wx",
      mode: 0o644,
    });
    await assert.rejects(
      loadCurrent187ConnectionProbeSignerAuthority({
        expectedPublicKeySha256: "0".repeat(64),
        ...timeline(),
        privateKeyPath,
        publicKeyPath,
      }),
      expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID"),
    );
  } finally {
    await rm(privateKeyPath, { force: true });
    await rm(publicKeyPath, { force: true });
  }
});

test("authority inputs and inactive roots fail closed without invoking accessors", async () => {
  let accessorCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "keyId", {
    enumerable: true,
    get() {
      accessorCalls += 1;
      return "current187-connection-probe-test-1";
    },
  });
  await assert.rejects(
    Promise.resolve().then(() =>
      createCurrent187ConnectionProbeSignerAuthorityForTestOnly(accessor),
    ),
    expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID"),
  );
  assert.equal(accessorCalls, 0);
  await assert.rejects(
    Promise.resolve().then(() =>
      createCurrent187ConnectionProbeSignerAuthorityForTestOnly(
        new Proxy(timeline(), {}),
      ),
    ),
    expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID"),
  );

  const now = Date.now();
  const futureAuthority =
    createCurrent187ConnectionProbeSignerAuthorityForTestOnly({
      keyId: "current187-connection-probe-test-1",
      notAfter: new Date(now + 2 * 60 * 60 * 1_000).toISOString(),
      notBefore: new Date(now + 60 * 60 * 1_000).toISOString(),
    });
  await assert.rejects(
    signCurrent187ConnectionProbeRunnerReceiptForTestOnly(
      futureAuthority,
      await runnerReceipt(),
    ),
    expectCode("CURRENT187_CONNECTION_PROBE_SIGNER_ROOT_INACTIVE"),
  );
});

test("signer source is isolated from database, network, process, env, tenant, invite, and provider authority", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "identity-mail-cluster-connection-probe-signer-current187.mjs",
    ),
    "utf8",
  );
  for (const forbidden of [
    /process\.env/u,
    /node:child_process/u,
    /node:(?:net|tls|http|https)/u,
    /from\s+["']pg["']/u,
    /Prisma/u,
    /\bfetch\s*\(/u,
    /Tenant|UserInvite|Langame|Telegram|SMTP/iu,
    /canConnectDatabase:\s*true/u,
    /canDeploy:\s*true/u,
    /canMutate:\s*true/u,
    /canSend:\s*true/u,
    /sharedBetaAccess:\s*true/u,
    /testAccessAuthorized:\s*true/u,
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

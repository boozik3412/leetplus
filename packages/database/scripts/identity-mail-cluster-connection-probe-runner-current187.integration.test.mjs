import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TLSSocket, createSecureContext } from "node:tls";
import { promisify } from "node:util";

import { CURRENT187_CONNECTION_NEGATIVE_SCENARIOS } from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
  isVerifiedCurrent187ConnectionProbeRunnerReceipt,
  runSyntheticCurrent187ConnectionProbeMatrixWithActualNetworkForTestOnly,
} from "./identity-mail-cluster-connection-probe-runner-current187.mjs";
import { CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND } from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import { CURRENT187_POSTGRES_SESSION_RECEIPT_KIND } from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const execFileAsync = promisify(execFile);
const CONFIRMATION =
  "run-current187-negative-connection-probe-protocol-integration-e2e";
const enabled =
  process.env.IDENTITY_MAIL_CONNECTION_PROBE_RUNNER_CURRENT187_E2E_CONFIRM ===
  CONFIRMATION;

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function releaseSha() {
  const value = process.env.CI_RELEASE_SHA;
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value)
    ? value
    : "a".repeat(40);
}

function opensslExecutable() {
  if (process.platform !== "win32") return "openssl";
  return "C:\\Program Files\\Git\\usr\\bin\\openssl.exe";
}

async function runOpenSsl(root, args) {
  await execFileAsync(opensslExecutable(), args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1_024,
    timeout: 20_000,
    windowsHide: true,
  });
}

async function createCertificates(root) {
  await writeFile(
    join(root, "server.ext"),
    [
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      "subjectAltName=DNS:localhost",
      "",
    ].join("\n"),
    { encoding: "utf8", flag: "wx" },
  );
  for (const [keyName, commonName] of [
    ["ca", "LeetPlus CURRENT187 Probe CA"],
    ["wrong-ca", "LeetPlus CURRENT187 Wrong Probe CA"],
  ]) {
    await runOpenSsl(root, [
      "genpkey",
      "-algorithm",
      "RSA",
      "-pkeyopt",
      "rsa_keygen_bits:2048",
      "-out",
      `${keyName}.key`,
    ]);
    await runOpenSsl(root, [
      "req",
      "-x509",
      "-new",
      "-key",
      `${keyName}.key`,
      "-sha256",
      "-days",
      "2",
      "-subj",
      `/CN=${commonName}`,
      "-out",
      `${keyName}.crt`,
    ]);
  }
  await runOpenSsl(root, [
    "genpkey",
    "-algorithm",
    "RSA",
    "-pkeyopt",
    "rsa_keygen_bits:2048",
    "-out",
    "server.key",
  ]);
  await runOpenSsl(root, [
    "req",
    "-new",
    "-key",
    "server.key",
    "-subj",
    "/CN=localhost",
    "-out",
    "server.csr",
  ]);
  await runOpenSsl(root, [
    "x509",
    "-req",
    "-in",
    "server.csr",
    "-CA",
    "ca.crt",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-days",
    "2",
    "-sha256",
    "-extfile",
    "server.ext",
    "-out",
    "server.crt",
  ]);
  const [ca, wrongCa, certificate, key] = await Promise.all([
    readFile(join(root, "ca.crt"), "utf8"),
    readFile(join(root, "wrong-ca.crt"), "utf8"),
    readFile(join(root, "server.crt"), "utf8"),
    readFile(join(root, "server.key")),
  ]);
  return {
    ca: ca.replaceAll("\r\n", "\n"),
    secureContext: createSecureContext({
      cert: certificate.replaceAll("\r\n", "\n"),
      key,
      maxVersion: "TLSv1.3",
      minVersion: "TLSv1.2",
    }),
    wrongCa: wrongCa.replaceAll("\r\n", "\n"),
  };
}

function postgresErrorPacket(code, message) {
  const body = Buffer.from(`SFATAL\0C${code}\0M${message}\0\0`, "utf8");
  const packet = Buffer.allocUnsafe(body.length + 5);
  packet[0] = 0x45;
  packet.writeInt32BE(body.length + 4, 1);
  body.copy(packet, 5);
  return packet;
}

function startupParameters(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 8) return null;
  const length = packet.readInt32BE(0);
  if (length !== packet.length || packet.readInt32BE(4) !== 196_608)
    return null;
  const fields = packet.subarray(8, -1).toString("utf8").split("\0");
  const entries = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    entries.push([fields[index], fields[index + 1]]);
  }
  return Object.fromEntries(entries);
}

async function startPostgresRejectionHarness(secureContext) {
  const sockets = new Set();
  const counters = { plaintext: 0, sslRequests: 0, tlsStartups: 0 };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.once("error", () => {});
    socket.once("data", (request) => {
      const sslRequest =
        Buffer.isBuffer(request) &&
        request.length === 8 &&
        request.readInt32BE(0) === 8 &&
        request.readInt32BE(4) === 80_877_103;
      if (!sslRequest) {
        counters.plaintext += 1;
        socket.end(
          postgresErrorPacket("28000", "TLS is required by this fixture"),
        );
        return;
      }
      counters.sslRequests += 1;
      socket.write(Buffer.from([0x53]), () => {
        const secureSocket = new TLSSocket(socket, {
          isServer: true,
          requestCert: false,
          secureContext,
        });
        sockets.add(secureSocket);
        secureSocket.once("close", () => sockets.delete(secureSocket));
        secureSocket.once("error", () => {});
        secureSocket.once("data", (startup) => {
          const parameters = startupParameters(startup);
          if (!parameters) {
            secureSocket.destroy();
            return;
          }
          counters.tlsStartups += 1;
          const wrongDatabase = parameters.database?.startsWith("missing_");
          secureSocket.end(
            postgresErrorPacket(
              wrongDatabase ? "3D000" : "28P01",
              wrongDatabase
                ? "database does not exist"
                : "password authentication failed",
            ),
          );
        });
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    counters,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
    port: address.port,
  };
}

function sessionReceipt(purpose) {
  return {
    applicationNameDigest: digest(`${purpose}:application`),
    authorization: false,
    backendIdentityDigest: digest(`${purpose}:backend`),
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: digest("integration-cluster"),
    databaseUniverseDigest: digest("integration-universe"),
    kind: CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
    positiveProbeDigest: digest(`${purpose}:positive`),
    postgresSessionReceiptDigest: digest(`${purpose}:j1`),
    purpose,
    releaseSha: releaseSha(),
    secretReferenceDigest: digest(`${purpose}:secret-ref`),
    sourceDatabaseIoPerformed: true,
    syntheticOnly: true,
    transportTlsObserved: true,
  };
}

function service(purpose, index, certificates, port) {
  const session = sessionReceipt(purpose);
  return {
    allowedOperationsDigest: digest(`${purpose}:operations`),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceipt: {
      authorization: false,
      canMutate: false,
      canSend: false,
      clusterIdentityDigest: digest("integration-cluster"),
      databaseUniverseDigest: digest("integration-universe"),
      endpointTlsPeerReceiptDigest: digest(`${purpose}:j2`),
      kind: CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
      postgresSessionReceiptDigest: session.postgresSessionReceiptDigest,
      purpose,
      releaseSha: releaseSha(),
      sourceNetworkIoPerformed: true,
      syntheticOnly: true,
      tlsCaVerified: true,
      tlsHostnameVerified: true,
    },
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
            ? certificates.wrongCa
            : certificates.ca,
      challengeDigest: digest(`${purpose}:${scenario}:challenge`),
      connectionString: `postgresql://${
        scenario === "WRONG_ROLE"
          ? `wrong_role_${index}`
          : `allowed_role_${index}`
      }:fixture-password@127.0.0.1:${port}/${
        scenario === "WRONG_DATABASE" ? `missing_${index}` : `allowed_${index}`
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
    postgresSessionReceipt: session,
    purpose,
    tlsMode: "VERIFY_FULL",
  };
}

function runnerInput(certificates, port) {
  const hbaReloadReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: digest("integration-cluster"),
    databaseUniverseDigest: digest("integration-universe"),
    hbaReloadReceiptDigest: digest("integration-j3"),
    releaseSha: releaseSha(),
    reloadEpochDigest: digest("integration-reload-epoch"),
    syntheticOnly: true,
  };
  return {
    clusterIdentityDigest: digest("integration-cluster"),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: digest("integration-universe"),
    environment: "ci",
    hbaReloadReceipt,
    hostControlChallengeDigest: digest("integration-host-control"),
    nonce: digest("integration-nonce"),
    operationId: "11111111-1111-4111-8111-111111111111",
    pgbouncerReceipt: {
      authorization: false,
      canMutate: false,
      canSend: false,
      clusterIdentityDigest: digest("integration-cluster"),
      databaseUniverseDigest: digest("integration-universe"),
      hbaReloadReceiptDigest: hbaReloadReceipt.hbaReloadReceiptDigest,
      pgbouncerReceiptDigest: digest("integration-j4"),
      releaseSha: releaseSha(),
      syntheticOnly: true,
      transactionPoolModeObserved: true,
      userCollapseAbsentObserved: true,
    },
    probeRunnerArtifactDigest: digest("integration-runner-artifact"),
    releaseSha: releaseSha(),
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(
      (purpose, index) => service(purpose, index, certificates, port),
    ),
  };
}

test(
  "actual PostgreSQL wire/TLS fixture rejects all 20 negative connections and emits no secrets",
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const root = await mkdtemp(
      join(tmpdir(), "leetplus-current187-probe-runner-"),
    );
    let harness;
    try {
      const certificates = await createCertificates(root);
      harness = await startPostgresRejectionHarness(certificates.secureContext);
      const receipt =
        await runSyntheticCurrent187ConnectionProbeMatrixWithActualNetworkForTestOnly(
          runnerInput(certificates, harness.port),
          {
            environment: "ci",
            explicitConfirmation:
              CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
            nodeEnv: "test",
          },
        );
      assert.equal(
        isVerifiedCurrent187ConnectionProbeRunnerReceipt(receipt),
        true,
      );
      assert.equal(receipt.actualNetworkNegativeProbeCount, 20);
      assert.equal(receipt.controlPolicyNegativeProbeCount, 12);
      assert.equal(receipt.negativeProbeCount, 32);
      assert.equal(harness.counters.plaintext, 4);
      assert.equal(harness.counters.sslRequests, 16);
      assert.equal(harness.counters.tlsStartups, 8);
      assert.equal(
        new Set(
          receipt.services.flatMap((entry) =>
            entry.negativeProbes.map((probe) => probe.evidenceDigest),
          ),
        ).size,
        32,
      );
      const serializedReceipt = JSON.stringify(receipt);
      for (const secretFragment of [
        "fixture-password",
        "wrong_role_",
        "allowed_0",
        "missing_0",
        "BEGIN CERTIFICATE",
        "127.0.0.1",
        "localhost",
        "wrong.invalid",
      ]) {
        assert.equal(
          serializedReceipt.includes(secretFragment),
          false,
          `receipt leaked ${secretFragment}`,
        );
      }
      assert.equal(receipt.authorization, false);
      assert.equal(receipt.canMutate, false);
      assert.equal(receipt.canSend, false);
      assert.equal(receipt.productionRuntimeAttested, false);
      assert.equal(receipt.sharedBetaAccess, false);
      assert.equal(receipt.testAccessAuthorized, false);
    } finally {
      if (harness) await harness.close();
      await rm(root, { force: true, recursive: true });
    }
  },
);

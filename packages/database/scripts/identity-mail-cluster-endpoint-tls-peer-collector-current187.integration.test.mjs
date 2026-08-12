import assert from "node:assert/strict";
import { X509Certificate, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TLSSocket, createSecureContext } from "node:tls";
import test from "node:test";

import {
  CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION,
  collectSyntheticCurrent187EndpointTlsPeerEvidenceForTestOnly,
  isVerifiedCurrent187EndpointTlsPeerReceipt,
} from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";

const execFileAsync = promisify(execFile);
const CONFIRMATION =
  "run-current187-endpoint-tls-peer-protocol-integration-e2e";
const enabled =
  process.env.IDENTITY_MAIL_ENDPOINT_TLS_PEER_CURRENT187_E2E_CONFIRM ===
  CONFIRMATION;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function opensslExecutable() {
  if (process.platform !== "win32") return "openssl";
  return "C:\\Program Files\\Git\\usr\\bin\\openssl.exe";
}

async function runOpenSsl(root, args) {
  await execFileAsync(opensslExecutable(), args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024,
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
  await runOpenSsl(root, [
    "genpkey",
    "-algorithm",
    "RSA",
    "-pkeyopt",
    "rsa_keygen_bits:2048",
    "-out",
    "ca.key",
  ]);
  await runOpenSsl(root, [
    "req",
    "-x509",
    "-new",
    "-key",
    "ca.key",
    "-sha256",
    "-days",
    "2",
    "-subj",
    "/CN=LeetPlus CURRENT187 J2 Test CA",
    "-out",
    "ca.crt",
  ]);
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
  await runOpenSsl(root, [
    "genpkey",
    "-algorithm",
    "RSA",
    "-pkeyopt",
    "rsa_keygen_bits:2048",
    "-out",
    "wrong-ca.key",
  ]);
  await runOpenSsl(root, [
    "req",
    "-x509",
    "-new",
    "-key",
    "wrong-ca.key",
    "-sha256",
    "-days",
    "2",
    "-subj",
    "/CN=LeetPlus CURRENT187 Wrong Test CA",
    "-out",
    "wrong-ca.crt",
  ]);

  const [caCertificatePem, serverCertificatePem, serverKey, wrongCaPem] =
    await Promise.all([
      readFile(join(root, "ca.crt"), "utf8"),
      readFile(join(root, "server.crt"), "utf8"),
      readFile(join(root, "server.key")),
      readFile(join(root, "wrong-ca.crt"), "utf8"),
    ]);
  const normalizedCa = caCertificatePem.replaceAll("\r\n", "\n");
  const normalizedServer = serverCertificatePem.replaceAll("\r\n", "\n");
  const normalizedWrongCa = wrongCaPem.replaceAll("\r\n", "\n");
  const certificate = new X509Certificate(normalizedServer);
  const spki = certificate.publicKey.export({ format: "der", type: "spki" });
  return {
    caCertificatePem: normalizedCa,
    expectedLeafCertificateSha256: sha256(certificate.raw),
    expectedLeafSpkiSha256: sha256(spki),
    secureContext: createSecureContext({
      cert: normalizedServer,
      key: serverKey,
      maxVersion: "TLSv1.3",
      minVersion: "TLSv1.2",
    }),
    wrongCaPem: normalizedWrongCa,
  };
}

async function startPostgresTlsNegotiationHarness(secureContext) {
  const sockets = new Set();
  let sslRequestCount = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.once("error", () => {});
    socket.once("data", (request) => {
      if (
        !Buffer.isBuffer(request) ||
        request.length !== 8 ||
        request.readInt32BE(0) !== 8 ||
        request.readInt32BE(4) !== 80_877_103
      ) {
        socket.destroy();
        return;
      }
      sslRequestCount += 1;
      socket.write(Buffer.from([0x53]), () => {
        const secureSocket = new TLSSocket(socket, {
          isServer: true,
          requestCert: false,
          secureContext,
        });
        sockets.add(secureSocket);
        secureSocket.once("close", () => sockets.delete(secureSocket));
        secureSocket.once("error", () => {});
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "::", ipv6Only: false, port: 0 }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
    port: address.port,
    sslRequestCount: () => sslRequestCount,
  };
}

async function resolvedLocalhostAddresses() {
  const rows = await lookup("localhost", { all: true, verbatim: true });
  const normalized = rows.map((row) => ({
    address: row.address.toLowerCase().replace(/^::ffff:/u, ""),
    family: row.family,
  }));
  const unique = [
    ...new Map(
      normalized.map((row) => [`${row.family}:${row.address}`, row]),
    ).values(),
  ];
  return unique.sort(
    (left, right) =>
      left.family - right.family || left.address.localeCompare(right.address),
  );
}

function collectorInput(certificates, port, expectedResolvedAddresses) {
  return {
    caCertificatePem: certificates.caCertificatePem,
    caCertificateSha256: sha256(
      Buffer.from(certificates.caCertificatePem, "utf8"),
    ),
    clusterIdentityDigest: sha256("current187-j2-ci-cluster"),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: sha256("current187-j2-ci-universe"),
    endpointClass: "POOLER",
    endpointHost: "localhost",
    endpointPort: port,
    environment: "ci",
    expectedLeafCertificateSha256: certificates.expectedLeafCertificateSha256,
    expectedLeafSpkiSha256: certificates.expectedLeafSpkiSha256,
    expectedResolvedAddresses,
    explicitConfirmation: CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION,
    handshakeTimeoutMs: 10_000,
    postgresSessionReceiptDigest: sha256("current187-j2-ci-j1-receipt"),
    purpose: "APPLICATION",
    releaseSha:
      typeof process.env.CI_RELEASE_SHA === "string" &&
      /^[a-f0-9]{40}$/u.test(process.env.CI_RELEASE_SHA)
        ? process.env.CI_RELEASE_SHA
        : "a".repeat(40),
    secretReferenceDigest: sha256("current187-j2-ci-secret-reference"),
    serverName: "localhost",
    verificationChallengeDigest: sha256("current187-j2-ci-challenge"),
  };
}

test(
  "CURRENT187-J2 performs PostgreSQL SSLRequest and verifies the actual TLS peer fail closed",
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lp-current187-j2-"));
    let harness;
    try {
      const certificates = await createCertificates(root);
      harness = await startPostgresTlsNegotiationHarness(
        certificates.secureContext,
      );
      const expectedResolvedAddresses = await resolvedLocalhostAddresses();
      const receipt =
        await collectSyntheticCurrent187EndpointTlsPeerEvidenceForTestOnly(
          collectorInput(certificates, harness.port, expectedResolvedAddresses),
        );
      assert.equal(isVerifiedCurrent187EndpointTlsPeerReceipt(receipt), true);
      assert.equal(receipt.sourceNetworkIoPerformed, true);
      assert.equal(receipt.postgresSslRequestAccepted, true);
      assert.equal(receipt.endpointIdentityObserved, true);
      assert.equal(receipt.tlsPeerIdentityObserved, true);
      assert.equal(receipt.tlsCaVerified, true);
      assert.equal(receipt.tlsHostnameVerified, true);
      assert.equal(receipt.endpointIdentityAttested, false);
      assert.equal(receipt.tlsPeerIdentityAttested, false);
      assert.equal(receipt.authorization, false);
      assert.equal(receipt.sharedBetaAccess, false);
      assert.equal(harness.sslRequestCount(), 1);

      const wrongCaInput = collectorInput(
        certificates,
        harness.port,
        expectedResolvedAddresses,
      );
      wrongCaInput.caCertificatePem = certificates.wrongCaPem;
      wrongCaInput.caCertificateSha256 = sha256(
        Buffer.from(certificates.wrongCaPem, "utf8"),
      );
      await assert.rejects(
        collectSyntheticCurrent187EndpointTlsPeerEvidenceForTestOnly(
          wrongCaInput,
        ),
        /collection failed closed/u,
      );
      assert.equal(harness.sslRequestCount(), 2);
    } finally {
      await harness?.close();
      await rm(root, { force: true, recursive: true });
    }
  },
);

export const IDENTITY_MAIL_ENDPOINT_TLS_PEER_CURRENT187_E2E_CONFIRM =
  CONFIRMATION;

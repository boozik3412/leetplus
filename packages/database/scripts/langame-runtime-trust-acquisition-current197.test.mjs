import assert from "node:assert/strict";
import {
  X509Certificate,
  createHash,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { execFile } from "node:child_process";
import { link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer as createTlsServer } from "node:tls";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import { LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_CONTRACT } from "./langame-initial-sync-runtime-provider-current194.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
} from "./langame-runtime-revoke-intent-current195.mjs";
import {
  LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT,
  LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_STATUS,
  LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_SYNTHETIC_CONFIRMATION,
  collectLangameRuntimeTrustAcquisitionCurrent197,
  collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly,
  collectSyntheticLangameRuntimeTrustAcquisitionCurrent197WithDefaultDependenciesForTestOnly,
  isVerifiedLangameRuntimeTrustAcquisitionCurrent197,
  isVerifiedProductionLangameRuntimeTrustAcquisitionCurrent197,
  isPublicLangameRuntimeTrustAcquisitionAddressCurrent197ForTestOnly,
} from "./langame-runtime-trust-acquisition-current197.mjs";
import {
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_ALGORITHM,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CURRENT195_MIGRATION_SHA256,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_PURPOSE,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_SYNTHETIC_CONFIRMATION,
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_TRUST_DOMAIN,
  langameRuntimeTrustEnrollmentCurrent196CandidateBundleDigest,
  langameRuntimeTrustEnrollmentCurrent196PayloadDigest,
  langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint,
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
const CA_PEM =
  "-----BEGIN CERTIFICATE-----\nVEVTVF9MQU5HQU1FX0NB\n-----END CERTIFICATE-----\n";
const E2E_CONFIRMATION =
  "run-langame-current197-actual-tls-handshake-on-loopback-ci";
const e2eEnabled =
  process.env.LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_E2E_CONFIRM ===
  E2E_CONFIRMATION;
const execFileAsync = promisify(execFile);

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

async function createTlsCertificates(root) {
  await writeFile(
    path.join(root, "server.ext"),
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
    "/CN=LeetPlus CURRENT197 Test CA",
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
    "/CN=LeetPlus CURRENT197 Wrong Test CA",
    "-out",
    "wrong-ca.crt",
  ]);
  const [caCertificatePem, serverCertificatePem, serverKey, wrongCaPem] =
    await Promise.all([
      readFile(path.join(root, "ca.crt"), "utf8"),
      readFile(path.join(root, "server.crt"), "utf8"),
      readFile(path.join(root, "server.key")),
      readFile(path.join(root, "wrong-ca.crt"), "utf8"),
    ]);
  const certificate = new X509Certificate(serverCertificatePem);
  return Object.freeze({
    caCertificatePem: caCertificatePem.replaceAll("\r\n", "\n"),
    leafCertificateSha256: sha256(certificate.raw),
    leafSpkiSha256: sha256(
      certificate.publicKey.export({ format: "der", type: "spki" }),
    ),
    leafValidFrom: new Date(certificate.validFrom).toISOString(),
    leafValidTo: new Date(certificate.validTo).toISOString(),
    serverCertificatePem: serverCertificatePem.replaceAll("\r\n", "\n"),
    serverKey,
    wrongCaPem: wrongCaPem.replaceAll("\r\n", "\n"),
  });
}

async function startTlsHarness(certificates) {
  const sockets = new Set();
  let tcpConnectionCount = 0;
  const server = createTlsServer(
    {
      cert: certificates.serverCertificatePem,
      key: certificates.serverKey,
      maxVersion: "TLSv1.3",
      minVersion: "TLSv1.2",
    },
    (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.once("error", () => {});
    },
  );
  server.on("connection", (socket) => {
    tcpConnectionCount += 1;
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.once("error", () => {});
  });
  server.on("tlsClientError", () => {});
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return Object.freeze({
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
    port: address.port,
    tcpConnectionCount: () => tcpConnectionCount,
  });
}

function publicKey(authority) {
  return authority.publicKey.export({ format: "pem", type: "spki" });
}

function candidateRoot(authority, keyId, purpose, trustDomain) {
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
  };
}

function verifiedProposal(attestationAuthority, revokeAuthority, options = {}) {
  const bootstrapAuthority = generateKeyPairSync("ed25519");
  const bootstrapSigningKeyId = "langame-current196-bootstrap-ci-1";
  const bootstrapPublicKeyPem = publicKey(bootstrapAuthority);
  const bootstrapPublicKeyFingerprint =
    langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(
      bootstrapPublicKeyPem,
    );
  const candidateBundle = {
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
      caCertificateSha256: sha256(
        Buffer.from(options.caCertificatePem ?? CA_PEM, "utf8"),
      ),
      endpointHost: "localhost",
      endpointPort: 44_443,
      expectedLeafCertificateSha256: "2".repeat(64),
      expectedLeafSpkiSha256: "3".repeat(64),
      leafNotAfter: "2026-11-13T00:00:00.000Z",
      leafNotBefore: "2026-08-12T00:00:00.000Z",
      minimumProtocol: "TLSv1.2",
      rejectUnauthorized: true,
      serverName: "localhost",
      ...options.tlsPeerPinset,
    },
  };
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
    issuedAt: options.issuedAt ?? "2026-08-13T09:59:00.000Z",
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
    validUntil: options.validUntil ?? "2026-08-13T10:04:00.000Z",
    verifierArtifactDigest: "c".repeat(64),
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
    },
  };
  return verifySyntheticLangameRuntimeTrustEnrollmentCurrent196(
    envelope,
    expected,
    roots,
    {
      databaseName: DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    options.now ?? NOW,
  );
}

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "lp-current197-"));
  t.after(async () => rm(root, { force: true, recursive: true }));
  const attestationAuthority = generateKeyPairSync("ed25519");
  const revokeAuthority = generateKeyPairSync("ed25519");
  const attestationPath = path.join(root, "attestation-public.pem");
  const revokePath = path.join(root, "revoke-public.pem");
  const caPath = path.join(root, "tls-ca.pem");
  await Promise.all([
    writeFile(attestationPath, publicKey(attestationAuthority), "utf8"),
    writeFile(revokePath, publicKey(revokeAuthority), "utf8"),
    writeFile(caPath, options.caCertificatePem ?? CA_PEM, "utf8"),
  ]);
  const input = {
    proposal: verifiedProposal(
      attestationAuthority,
      revokeAuthority,
      options.proposal,
    ),
    runtimeAttestationPublicKeyPath: attestationPath,
    runtimeRevokeIntentPublicKeyPath: revokePath,
    tlsCaCertificatePath: caPath,
  };
  return { attestationPath, caPath, input, revokePath, root };
}

function observation(overrides = {}) {
  return {
    authorizationError: null,
    authorized: true,
    cipherName: "TLS_AES_256_GCM_SHA384",
    leafCertificateSha256: "2".repeat(64),
    leafSpkiSha256: "3".repeat(64),
    leafValidFrom: "2026-08-12T00:00:00.000Z",
    leafValidTo: "2026-11-13T00:00:00.000Z",
    protocol: "TLSv1.3",
    remoteAddress: "127.0.0.1",
    remotePort: 44_443,
    serverName: "localhost",
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      async connectTlsPeer(input) {
        calls.push({ input, kind: "connectTlsPeer" });
        if (overrides.connectError) throw overrides.connectError;
        return overrides.observation ?? observation();
      },
      now() {
        calls.push({ kind: "now" });
        return overrides.now ?? NOW;
      },
      async resolveEndpoint(hostname) {
        calls.push({ hostname, kind: "resolveEndpoint" });
        if (overrides.resolveError) throw overrides.resolveError;
        return overrides.addresses ?? [{ address: "127.0.0.1", family: 4 }];
      },
    },
  };
}

const context = Object.freeze({
  databaseName: DATABASE,
  environment: "ci",
  explicitConfirmation:
    LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_SYNTHETIC_CONFIRMATION,
  hostname: "127.0.0.1",
});

function code(expected) {
  return (error) => error?.code === expected && error.safeContractError;
}

async function collect(value, dependencyOverrides = {}) {
  const dependency = dependencies(dependencyOverrides);
  const receipt =
    await collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      value.input,
      dependency.value,
      context,
    );
  return { ...dependency, receipt };
}

test("CURRENT197 reads exact public roots and returns deny-only TLS evidence", async (t) => {
  const value = await fixture(t);
  const { calls, receipt } = await collect(value);
  assert.equal(
    receipt.contract,
    LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT,
  );
  assert.equal(
    receipt.status,
    LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_STATUS,
  );
  assert.equal(receipt.protectedSourceFilesVerified, true);
  assert.equal(receipt.sourceNetworkIoPerformed, true);
  assert.equal(receipt.tlsHostnameVerified, true);
  assert.equal(receipt.tlsPeerObserved, true);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canEnrollProductionRoots, false);
  assert.equal(receipt.canConnectNetwork, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.productionExecutionAllowed, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(
    isVerifiedLangameRuntimeTrustAcquisitionCurrent197(receipt),
    true,
  );
  assert.equal(
    isVerifiedProductionLangameRuntimeTrustAcquisitionCurrent197(receipt),
    false,
  );
  assert.equal(
    isVerifiedLangameRuntimeTrustAcquisitionCurrent197({ ...receipt }),
    false,
  );
  assert.deepEqual(
    calls.map((entry) => entry.kind),
    ["now", "resolveEndpoint", "connectTlsPeer", "now"],
  );
  for (const forbidden of ["Path", "Pem", "resolvedAddresses", "proposal"]) {
    assert.equal(
      Object.keys(receipt).some((key) => key.includes(forbidden)),
      false,
      forbidden,
    );
  }
});

test("CURRENT197 production entry rejects synthetic proposal before filesystem or network", async (t) => {
  const value = await fixture(t);
  await assert.rejects(
    collectLangameRuntimeTrustAcquisitionCurrent197(value.input),
    code("CURRENT197_TRUST_ACQUISITION_PROPOSAL_INVALID"),
  );
});

test("CURRENT197 rejects cloned proposal and widened synthetic context", async (t) => {
  const value = await fixture(t);
  const dependency = dependencies();
  await assert.rejects(
    collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      { ...value.input, proposal: { ...value.input.proposal } },
      dependency.value,
      context,
    ),
    code("CURRENT197_TRUST_ACQUISITION_PROPOSAL_INVALID"),
  );
  for (const badContext of [
    { ...context, environment: "production" },
    { ...context, hostname: "ci.example.test" },
    { ...context, explicitConfirmation: "yes" },
  ]) {
    await assert.rejects(
      collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
        value.input,
        dependency.value,
        badContext,
      ),
      code("CURRENT197_TRUST_ACQUISITION_SYNTHETIC_DENIED"),
    );
  }
  assert.equal(dependency.calls.length, 0);
});

test("CURRENT197 rejects public-root substitution before DNS or TLS", async (t) => {
  const value = await fixture(t);
  const attacker = generateKeyPairSync("ed25519");
  await writeFile(value.attestationPath, publicKey(attacker), "utf8");
  const dependency = dependencies();
  await assert.rejects(
    collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      value.input,
      dependency.value,
      context,
    ),
    code("CURRENT197_TRUST_ACQUISITION_PUBLIC_KEY_INVALID"),
  );
  assert.deepEqual(
    dependency.calls.map((entry) => entry.kind),
    ["now"],
  );
});

test("CURRENT197 rejects hard-linked public evidence before DNS or TLS", async (t) => {
  const value = await fixture(t);
  await link(value.revokePath, path.join(value.root, "revoke-hardlink.pem"));
  const dependency = dependencies();
  await assert.rejects(
    collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      value.input,
      dependency.value,
      context,
    ),
    code("CURRENT197_TRUST_ACQUISITION_FILE_INVALID"),
  );
  assert.deepEqual(
    dependency.calls.map((entry) => entry.kind),
    ["now"],
  );
});

test("CURRENT197 rejects CA byte drift before DNS or TLS", async (t) => {
  const value = await fixture(t);
  await writeFile(value.caPath, `${CA_PEM}x`, "utf8");
  const dependency = dependencies();
  await assert.rejects(
    collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      value.input,
      dependency.value,
      context,
    ),
    code("CURRENT197_TRUST_ACQUISITION_CA_CERTIFICATE_INVALID"),
  );
  assert.deepEqual(
    dependency.calls.map((entry) => entry.kind),
    ["now"],
  );
});

test("CURRENT197 rejects DNS duplicates and invalid addresses before TLS", async (t) => {
  const value = await fixture(t);
  for (const addresses of [
    [
      { address: "127.0.0.1", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
    [{ address: "not-an-ip", family: 4 }],
  ]) {
    const dependency = dependencies({ addresses });
    await assert.rejects(
      collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
        value.input,
        dependency.value,
        context,
      ),
      code("CURRENT197_TRUST_ACQUISITION_DNS_INVALID"),
    );
    assert.equal(
      dependency.calls.some((entry) => entry.kind === "connectTlsPeer"),
      false,
    );
  }
});

test("CURRENT197 rejects non-public and alternate IPv4-mapped address forms", () => {
  for (const [address, family] of [
    ["0.0.0.0", 4],
    ["10.0.0.1", 4],
    ["100.127.255.255", 4],
    ["127.0.0.1", 4],
    ["169.254.1.1", 4],
    ["172.31.255.255", 4],
    ["192.0.2.1", 4],
    ["192.168.1.1", 4],
    ["198.19.255.255", 4],
    ["198.51.100.1", 4],
    ["203.0.113.1", 4],
    ["224.0.0.1", 4],
    ["255.255.255.255", 4],
    ["::", 6],
    ["::1", 6],
    ["::ffff:127.0.0.1", 6],
    ["0:0:0:0:0:ffff:7f00:1", 6],
    ["0:0:0:0:0:ffff:a00:1", 6],
    ["64:ff9b::7f00:1", 6],
    ["64:ff9b:1::7f00:1", 6],
    ["100::1", 6],
    ["2001:0:4136:e378:8000:63bf:3fff:fdd2", 6],
    ["2001:db8::1", 6],
    ["2002:7f00:1::", 6],
    ["fc00::1", 6],
    ["fdff::1", 6],
    ["fe80::1", 6],
    ["ff02::1", 6],
  ]) {
    assert.equal(
      isPublicLangameRuntimeTrustAcquisitionAddressCurrent197ForTestOnly(
        address,
        family,
      ),
      false,
      address,
    );
  }
  for (const [address, family] of [
    ["1.1.1.1", 4],
    ["8.8.8.8", 4],
    ["2606:4700:4700::1111", 6],
    ["2001:4860:4860::8888", 6],
  ]) {
    assert.equal(
      isPublicLangameRuntimeTrustAcquisitionAddressCurrent197ForTestOnly(
        address,
        family,
      ),
      true,
      address,
    );
  }
  assert.equal(
    isPublicLangameRuntimeTrustAcquisitionAddressCurrent197ForTestOnly(
      "::ffff:127.0.0.1",
      4,
    ),
    false,
  );
});

test("CURRENT197 rejects TLS authorization, hostname, certificate and protocol drift", async (t) => {
  const value = await fixture(t);
  for (const changed of [
    { authorizationError: "UNTRUSTED", authorized: false },
    { serverName: "other.example" },
    { leafCertificateSha256: "d".repeat(64) },
    { leafSpkiSha256: "d".repeat(64) },
    { protocol: "TLSv1.1" },
    { remoteAddress: "127.0.0.2" },
    { leafValidTo: "2026-11-12T00:00:00.000Z" },
  ]) {
    await assert.rejects(
      collect(value, { observation: observation(changed) }),
      code("CURRENT197_TRUST_ACQUISITION_TLS_PEER_INVALID"),
    );
  }
});

test("CURRENT197 rejects expired proposal before filesystem, DNS or TLS", async (t) => {
  const value = await fixture(t);
  const dependency = dependencies({ now: value.input.proposal.validUntil });
  await assert.rejects(
    collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      value.input,
      dependency.value,
      context,
    ),
    code("CURRENT197_TRUST_ACQUISITION_PROPOSAL_EXPIRED"),
  );
  assert.deepEqual(
    dependency.calls.map((entry) => entry.kind),
    ["now"],
  );
});

test("CURRENT197 rejects dependency accessors without invoking them", async (t) => {
  const value = await fixture(t);
  let calls = 0;
  const dependency = dependencies().value;
  Object.defineProperty(dependency, "now", {
    enumerable: true,
    get() {
      calls += 1;
      return () => NOW;
    },
  });
  await assert.rejects(
    collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
      value.input,
      dependency,
      context,
    ),
    code("CURRENT197_TRUST_ACQUISITION_DEPENDENCIES_INVALID"),
  );
  assert.equal(calls, 0);
});

test(
  "CURRENT197 performs an actual TLS-only handshake and rejects an unrelated CA",
  { skip: !e2eEnabled, timeout: 60_000 },
  async (t) => {
    const certificateRoot = await mkdtemp(
      path.join(tmpdir(), "lp-current197-tls-"),
    );
    let harness;
    try {
      const certificates = await createTlsCertificates(certificateRoot);
      harness = await startTlsHarness(certificates);
      const verificationNow = new Date();
      const issuedAt = verificationNow.toISOString();
      const validUntil = new Date(
        verificationNow.getTime() + 4 * 60_000,
      ).toISOString();
      const proposalOptions = {
        issuedAt,
        now: verificationNow.toISOString(),
        tlsPeerPinset: {
          endpointHost: "127.0.0.1",
          endpointPort: harness.port,
          expectedLeafCertificateSha256: certificates.leafCertificateSha256,
          expectedLeafSpkiSha256: certificates.leafSpkiSha256,
          leafNotAfter: certificates.leafValidTo,
          leafNotBefore: certificates.leafValidFrom,
        },
        validUntil,
      };
      const value = await fixture(t, {
        caCertificatePem: certificates.caCertificatePem,
        proposal: {
          ...proposalOptions,
          caCertificatePem: certificates.caCertificatePem,
        },
      });
      const receipt =
        await collectSyntheticLangameRuntimeTrustAcquisitionCurrent197WithDefaultDependenciesForTestOnly(
          value.input,
          context,
        );
      assert.equal(
        isVerifiedLangameRuntimeTrustAcquisitionCurrent197(receipt),
        true,
      );
      assert.equal(receipt.sourceNetworkIoPerformed, true);
      assert.equal(receipt.tlsHostnameVerified, true);
      assert.equal(receipt.tlsPeerObserved, true);
      assert.equal(receipt.authorization, false);
      assert.equal(receipt.productionExecutionAllowed, false);
      assert.equal(receipt.productionRootEnrolled, false);
      assert.equal(receipt.sharedBetaAccess, false);
      assert.equal(receipt.testAccessAuthorized, false);
      assert.equal(harness.tcpConnectionCount(), 1);

      const wrongCaValue = await fixture(t, {
        caCertificatePem: certificates.wrongCaPem,
        proposal: {
          ...proposalOptions,
          caCertificatePem: certificates.wrongCaPem,
        },
      });
      await assert.rejects(
        collectSyntheticLangameRuntimeTrustAcquisitionCurrent197WithDefaultDependenciesForTestOnly(
          wrongCaValue.input,
          context,
        ),
        code("CURRENT197_TRUST_ACQUISITION_COLLECTION_FAILED"),
      );
      assert.equal(harness.tcpConnectionCount(), 2);
    } finally {
      await harness?.close();
      await rm(certificateRoot, { force: true, recursive: true });
    }
  },
);

test("CURRENT197 source has no DB, HTTP, secret or signing authority", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL(
        "./langame-runtime-trust-acquisition-current197.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  for (const forbidden of [
    "process.env",
    "PrismaClient",
    "DATABASE_URL",
    "fetch(",
    "http.request",
    "privateKey",
    "createPrivateKey",
    "sign(",
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

import { X509Certificate, createHash, createPublicKey } from "node:crypto";
import { lookup } from "node:dns/promises";
import { lstat, open, realpath } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { connect as connectTls } from "node:tls";
import { types as utilTypes } from "node:util";
import { fileURLToPath } from "node:url";

import {
  LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT,
  isVerifiedLangameRuntimeTrustEnrollmentCurrent196,
  langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint,
} from "./langame-runtime-trust-enrollment-current196.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT =
  "LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_V1";
export const LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_STATUS =
  "PROTECTED_PUBLIC_ROOTS_AND_TLS_PEER_OBSERVED_DENY_ONLY";
export const LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_SYNTHETIC_CONFIRMATION =
  "collect-langame-current197-trust-evidence-on-loopback-ci";
export const LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONNECT_TIMEOUT_MS = 10_000;
export const LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_HANDSHAKE_TIMEOUT_MS = 15_000;

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const INPUT_KEYS = Object.freeze(
  [
    "proposal",
    "runtimeAttestationPublicKeyPath",
    "runtimeRevokeIntentPublicKeyPath",
    "tlsCaCertificatePath",
  ].sort(),
);
const CONTEXT_KEYS = Object.freeze(
  ["databaseName", "environment", "explicitConfirmation", "hostname"].sort(),
);
const DEPENDENCY_KEYS = Object.freeze(
  ["connectTlsPeer", "now", "resolveEndpoint"].sort(),
);
const OBSERVATION_KEYS = Object.freeze(
  [
    "authorizationError",
    "authorized",
    "cipherName",
    "leafCertificateSha256",
    "leafSpkiSha256",
    "leafValidFrom",
    "leafValidTo",
    "protocol",
    "remoteAddress",
    "remotePort",
    "serverName",
  ].sort(),
);
const ADDRESS_KEYS = Object.freeze(["address", "family"].sort());
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const PRODUCTION_HOST_SUFFIXES = Object.freeze([
  ".langame.ru",
  ".langamepro.ru",
]);
const MAX_PATH_BYTES = 4_096;
const MAX_PUBLIC_KEY_BYTES = 4_096;
const MAX_CA_CERTIFICATE_BYTES = 64 * 1_024;
const MAX_RESOLVED_ADDRESSES = 16;
const VERIFIED_RECEIPTS = new WeakSet();
const VERIFIED_PRODUCTION_RECEIPTS = new WeakSet();

export class LangameRuntimeTrustAcquisitionCurrent197Error extends Error {
  constructor(code) {
    super("CURRENT197 Langame runtime trust acquisition rejected the input.");
    this.name = "LangameRuntimeTrustAcquisitionCurrent197Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustAcquisitionCurrent197Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  let prototype;
  let descriptors;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
    prototype = invalid ? null : Object.getPrototypeOf(value);
    descriptors = invalid ? null : Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (invalid || (prototype !== Object.prototype && prototype !== null)) {
    fail(code);
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(code);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail(code);
  }
  const result = Object.create(null);
  for (const key of expectedKeys) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function exactDenseArray(value, maximum, code) {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    value.length < 1 ||
    value.length > maximum
  ) {
    fail(code);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key === "symbol") ||
    keys.length !== value.length + 1 ||
    !Object.hasOwn(descriptors, "length")
  ) {
    fail(code);
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value")) fail(code);
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

function canonicalIso(value, code) {
  if (typeof value !== "string") fail(code);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(code);
  }
  return Object.freeze({ epoch, value });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  return createHash("sha256")
    .update(
      `${LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT}\n${domain}\n`,
    )
    .update(canonicalStringify(value), "utf8")
    .digest("hex");
}

function normalizeProposal(value, syntheticOnly) {
  if (
    !isVerifiedLangameRuntimeTrustEnrollmentCurrent196(value) ||
    value.contract !== LANGAME_RUNTIME_TRUST_ENROLLMENT_CURRENT196_CONTRACT ||
    value.authorization !== false ||
    value.canEnrollProductionRoots !== false ||
    value.canConnectNetwork !== false ||
    value.canMutate !== false ||
    value.productionExecutionAllowed !== false ||
    value.testAccessAuthorized !== false ||
    value.sharedBetaAccess !== false ||
    value.tlsRejectUnauthorized !== true ||
    !SHA256_PATTERN.test(value.candidateBundleDigest) ||
    !SHA256_PATTERN.test(value.runtimeAttestationPublicKeyFingerprint) ||
    !SHA256_PATTERN.test(value.runtimeRevokeIntentPublicKeyFingerprint) ||
    !SHA256_PATTERN.test(value.tlsCaCertificateSha256) ||
    !SHA256_PATTERN.test(value.tlsLeafCertificateSha256) ||
    !SHA256_PATTERN.test(value.tlsLeafSpkiSha256) ||
    value.verificationMode !==
      (syntheticOnly ? "SYNTHETIC_CI" : "PINNED_PRODUCTION")
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_PROPOSAL_INVALID");
  }
  return value;
}

function normalizeInput(value, syntheticOnly) {
  const input = exactRecord(
    value,
    INPUT_KEYS,
    "CURRENT197_TRUST_ACQUISITION_INPUT_INVALID",
  );
  const proposal = normalizeProposal(input.proposal, syntheticOnly);
  for (const key of [
    "runtimeAttestationPublicKeyPath",
    "runtimeRevokeIntentPublicKeyPath",
    "tlsCaCertificatePath",
  ]) {
    if (
      typeof input[key] !== "string" ||
      !path.isAbsolute(input[key]) ||
      Buffer.byteLength(input[key], "utf8") > MAX_PATH_BYTES ||
      input[key].includes("\0")
    ) {
      fail("CURRENT197_TRUST_ACQUISITION_PATH_INVALID");
    }
  }
  const nativePaths = [
    input.runtimeAttestationPublicKeyPath,
    input.runtimeRevokeIntentPublicKeyPath,
    input.tlsCaCertificatePath,
  ].map((entry) => canonicalNativePath(entry));
  if (new Set(nativePaths).size !== nativePaths.length) {
    fail("CURRENT197_TRUST_ACQUISITION_PATH_INVALID");
  }
  if (
    !syntheticOnly &&
    !isAllowedProductionHostname(proposal.tlsEndpointHost)
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_ENDPOINT_DENIED");
  }
  return Object.freeze({ ...input, proposal });
}

function canonicalNativePath(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function pathInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function isAllowedProductionHostname(value) {
  return (
    typeof value === "string" &&
    isIP(value) === 0 &&
    PRODUCTION_HOST_SUFFIXES.some(
      (suffix) => value === suffix.slice(1) || value.endsWith(suffix),
    )
  );
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function fileIdentity(stat) {
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

async function inspectPath(sourcePath, maximumBytes, syntheticOnly) {
  let sourceStat;
  let resolvedPath;
  let resolvedStat;
  try {
    sourceStat = await lstat(sourcePath, { bigint: true });
    resolvedPath = await realpath(sourcePath);
    resolvedStat = await lstat(resolvedPath, { bigint: true });
  } catch {
    fail("CURRENT197_TRUST_ACQUISITION_FILE_INVALID");
  }
  if (
    sourceStat.isSymbolicLink() ||
    !sourceStat.isFile() ||
    !resolvedStat.isFile() ||
    sourceStat.nlink !== 1n ||
    resolvedStat.nlink !== 1n ||
    sourceStat.size < 1n ||
    sourceStat.size > BigInt(maximumBytes) ||
    resolvedStat.size !== sourceStat.size ||
    !sameIdentity(fileIdentity(sourceStat), fileIdentity(resolvedStat))
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_FILE_INVALID");
  }
  if (!syntheticOnly) {
    let repositoryRoot;
    let systemTempRoot;
    try {
      [repositoryRoot, systemTempRoot] = await Promise.all([
        realpath(REPOSITORY_ROOT),
        realpath(tmpdir()),
      ]);
    } catch {
      fail("CURRENT197_TRUST_ACQUISITION_FILE_LOCATION_DENIED");
    }
    const candidate = canonicalNativePath(resolvedPath);
    if (
      pathInside(candidate, canonicalNativePath(repositoryRoot)) ||
      pathInside(candidate, canonicalNativePath(systemTempRoot))
    ) {
      fail("CURRENT197_TRUST_ACQUISITION_FILE_LOCATION_DENIED");
    }
  }
  return Object.freeze({
    identity: fileIdentity(resolvedStat),
    resolvedPath,
    size: resolvedStat.size,
  });
}

async function readExactFile(sourcePath, maximumBytes, syntheticOnly) {
  const inspected = await inspectPath(sourcePath, maximumBytes, syntheticOnly);
  let handle;
  try {
    handle = await open(sourcePath, "r");
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.nlink !== 1n ||
      before.size !== inspected.size ||
      !sameIdentity(fileIdentity(before), inspected.identity)
    ) {
      fail("CURRENT197_TRUST_ACQUISITION_FILE_CHANGED");
    }
    const length = Number(before.size);
    const bytes = Buffer.alloc(length + 1);
    let offset = 0;
    while (offset < length) {
      const result = await handle.read(bytes, offset, length - offset, offset);
      if (result.bytesRead <= 0) {
        fail("CURRENT197_TRUST_ACQUISITION_FILE_CHANGED");
      }
      offset += result.bytesRead;
    }
    const overflow = await handle.read(bytes, length, 1, length);
    const after = await handle.stat({ bigint: true });
    const finalPath = await lstat(sourcePath, { bigint: true });
    if (
      overflow.bytesRead !== 0 ||
      after.nlink !== 1n ||
      after.size !== before.size ||
      !sameIdentity(fileIdentity(after), fileIdentity(before)) ||
      finalPath.isSymbolicLink() ||
      !finalPath.isFile() ||
      finalPath.nlink !== 1n ||
      finalPath.size !== before.size ||
      !sameIdentity(fileIdentity(finalPath), fileIdentity(before))
    ) {
      fail("CURRENT197_TRUST_ACQUISITION_FILE_CHANGED");
    }
    return Object.freeze({
      bytes: Buffer.from(bytes.subarray(0, length)),
      bytesSha256: sha256(bytes.subarray(0, length)),
      identity: inspected.identity,
    });
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT197_TRUST_ACQUISITION_FILE_INVALID");
  } finally {
    await handle?.close().catch(() => {});
  }
}

function normalizePublicKeyFile(file, expectedFingerprint) {
  let encoded;
  let key;
  let canonical;
  try {
    encoded = file.bytes.toString("utf8");
    if (
      !Buffer.from(encoded, "utf8").equals(file.bytes) ||
      encoded.includes("\0")
    ) {
      fail("CURRENT197_TRUST_ACQUISITION_PUBLIC_KEY_INVALID");
    }
    key = createPublicKey(encoded);
    canonical = key.export({ format: "pem", type: "spki" });
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT197_TRUST_ACQUISITION_PUBLIC_KEY_INVALID");
  }
  if (
    key.asymmetricKeyType !== "ed25519" ||
    canonical !== encoded ||
    langameRuntimeTrustEnrollmentCurrent196PublicKeyFingerprint(encoded) !==
      expectedFingerprint
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_PUBLIC_KEY_INVALID");
  }
  return Object.freeze({
    bytesSha256: file.bytesSha256,
    publicKeyFingerprint: expectedFingerprint,
  });
}

function normalizeCaFile(file, expectedDigest) {
  const encoded = file.bytes.toString("utf8");
  if (
    !Buffer.from(encoded, "utf8").equals(file.bytes) ||
    encoded.includes("\0") ||
    !encoded.startsWith("-----BEGIN CERTIFICATE-----\n") ||
    !encoded.endsWith("-----END CERTIFICATE-----\n") ||
    file.bytesSha256 !== expectedDigest
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_CA_CERTIFICATE_INVALID");
  }
  return Object.freeze({ bytesSha256: file.bytesSha256, encoded });
}

function canonicalIp(value) {
  if (typeof value !== "string") return null;
  const lowered = value.toLowerCase();
  if (lowered.startsWith("::ffff:") && isIP(lowered.slice(7)) === 4) {
    return lowered.slice(7);
  }
  return isIP(lowered) === 0 ? null : lowered;
}

function normalizeAddresses(value, syntheticOnly) {
  const code = "CURRENT197_TRUST_ACQUISITION_DNS_INVALID";
  const rows = [
    ...exactDenseArray(value, MAX_RESOLVED_ADDRESSES, code).map((entry) => {
      const row = exactRecord(entry, ADDRESS_KEYS, code);
      const address = canonicalIp(row.address);
      if (
        address === null ||
        (row.family !== 4 && row.family !== 6) ||
        isIP(address) !== row.family ||
        (!syntheticOnly && !isPublicAddress(address, row.family))
      ) {
        fail(code);
      }
      return Object.freeze({ address, family: row.family });
    }),
  ];
  rows.sort((left, right) =>
    left.family === right.family
      ? compareStrings(left.address, right.address)
      : left.family - right.family,
  );
  if (
    rows.some(
      (entry, index) =>
        index > 0 &&
        entry.family === rows[index - 1].family &&
        entry.address === rows[index - 1].address,
    )
  ) {
    fail(code);
  }
  return Object.freeze(rows);
}

function isPublicAddress(address, family) {
  if (family === 6) {
    return !(
      address === "::" ||
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      /^fe[89ab]/u.test(address) ||
      address.startsWith("ff") ||
      address.startsWith("2001:db8:")
    );
  }
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function minimumProtocolSatisfied(actual, minimum) {
  return (
    actual === "TLSv1.3" || (actual === "TLSv1.2" && minimum === "TLSv1.2")
  );
}

function normalizeObservation(value, proposal, selectedAddress, collectedAt) {
  const code = "CURRENT197_TRUST_ACQUISITION_TLS_PEER_INVALID";
  const row = exactRecord(value, OBSERVATION_KEYS, code);
  const leafValidFrom = canonicalIso(row.leafValidFrom, code);
  const leafValidTo = canonicalIso(row.leafValidTo, code);
  const remoteAddress = canonicalIp(row.remoteAddress);
  if (
    row.authorized !== true ||
    row.authorizationError !== null ||
    typeof row.cipherName !== "string" ||
    row.cipherName.length < 3 ||
    row.cipherName.length > 255 ||
    !minimumProtocolSatisfied(row.protocol, proposal.tlsMinimumProtocol) ||
    row.serverName !== proposal.tlsServerName ||
    remoteAddress !== selectedAddress.address ||
    row.remotePort !== proposal.tlsEndpointPort ||
    row.leafCertificateSha256 !== proposal.tlsLeafCertificateSha256 ||
    row.leafSpkiSha256 !== proposal.tlsLeafSpkiSha256 ||
    leafValidFrom.value !== proposal.tlsLeafNotBefore ||
    leafValidTo.value !== proposal.tlsLeafNotAfter ||
    collectedAt.epoch < leafValidFrom.epoch ||
    collectedAt.epoch >= leafValidTo.epoch
  ) {
    fail(code);
  }
  return Object.freeze({ ...row, remoteAddress });
}

function defaultDependencies() {
  return Object.freeze({
    connectTlsPeer(options) {
      return connectDefaultTlsPeer(options);
    },
    now() {
      return new Date().toISOString();
    },
    async resolveEndpoint(hostname) {
      return lookup(hostname, { all: true, verbatim: true });
    },
  });
}

function connectDefaultTlsPeer(options) {
  return new Promise((resolve, reject) => {
    const socket = connectTls({
      ca: options.caCertificatePem,
      family: options.family,
      host: options.address,
      minVersion: options.minimumProtocol,
      port: options.endpointPort,
      rejectUnauthorized: true,
      servername: options.serverName,
    });
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error("CURRENT197_TLS_HANDSHAKE_TIMEOUT"));
    }, LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_HANDSHAKE_TIMEOUT_MS);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    }
    socket.setTimeout(
      LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONNECT_TIMEOUT_MS,
      () => finish(new Error("CURRENT197_TLS_CONNECT_TIMEOUT")),
    );
    socket.once("error", (error) => finish(error));
    socket.once("secureConnect", () => {
      try {
        const peer = socket.getPeerCertificate(true);
        if (!peer?.raw) throw new Error("CURRENT197_TLS_PEER_MISSING");
        const certificate = new X509Certificate(Buffer.from(peer.raw));
        const leafSpki = Buffer.from(
          certificate.publicKey.export({ format: "der", type: "spki" }),
        );
        finish(null, {
          authorizationError: socket.authorized
            ? null
            : String(socket.authorizationError ?? "TLS_UNAUTHORIZED"),
          authorized: socket.authorized,
          cipherName: socket.getCipher()?.name ?? null,
          leafCertificateSha256: sha256(Buffer.from(peer.raw)),
          leafSpkiSha256: sha256(leafSpki),
          leafValidFrom: new Date(certificate.validFrom).toISOString(),
          leafValidTo: new Date(certificate.validTo).toISOString(),
          protocol: socket.getProtocol(),
          remoteAddress: socket.remoteAddress,
          remotePort: socket.remotePort,
          serverName: options.serverName,
        });
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function collectInternal(
  inputValue,
  dependencyValue,
  syntheticOnly,
  productionOrigin,
) {
  const input = normalizeInput(inputValue, syntheticOnly);
  const proposal = input.proposal;
  const dependencies = exactRecord(
    dependencyValue,
    DEPENDENCY_KEYS,
    "CURRENT197_TRUST_ACQUISITION_DEPENDENCIES_INVALID",
  );
  if (
    typeof dependencies.connectTlsPeer !== "function" ||
    typeof dependencies.now !== "function" ||
    typeof dependencies.resolveEndpoint !== "function"
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_DEPENDENCIES_INVALID");
  }

  let preflightAt;
  const proposalIssuedAt = canonicalIso(
    proposal.issuedAt,
    "CURRENT197_TRUST_ACQUISITION_PROPOSAL_INVALID",
  );
  const proposalValidUntil = canonicalIso(
    proposal.validUntil,
    "CURRENT197_TRUST_ACQUISITION_PROPOSAL_INVALID",
  );
  try {
    preflightAt = canonicalIso(
      dependencies.now(),
      "CURRENT197_TRUST_ACQUISITION_TIME_INVALID",
    );
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT197_TRUST_ACQUISITION_TIME_INVALID");
  }
  if (
    preflightAt.epoch < proposalIssuedAt.epoch ||
    preflightAt.epoch >= proposalValidUntil.epoch
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_PROPOSAL_EXPIRED");
  }

  const [attestationFile, revokeFile, caFile] = await Promise.all([
    readExactFile(
      input.runtimeAttestationPublicKeyPath,
      MAX_PUBLIC_KEY_BYTES,
      syntheticOnly,
    ),
    readExactFile(
      input.runtimeRevokeIntentPublicKeyPath,
      MAX_PUBLIC_KEY_BYTES,
      syntheticOnly,
    ),
    readExactFile(
      input.tlsCaCertificatePath,
      MAX_CA_CERTIFICATE_BYTES,
      syntheticOnly,
    ),
  ]);
  const attestationRoot = normalizePublicKeyFile(
    attestationFile,
    proposal.runtimeAttestationPublicKeyFingerprint,
  );
  const revokeRoot = normalizePublicKeyFile(
    revokeFile,
    proposal.runtimeRevokeIntentPublicKeyFingerprint,
  );
  const caCertificate = normalizeCaFile(
    caFile,
    proposal.tlsCaCertificateSha256,
  );
  if (
    attestationRoot.bytesSha256 === revokeRoot.bytesSha256 ||
    attestationRoot.publicKeyFingerprint === revokeRoot.publicKeyFingerprint ||
    sameIdentity(attestationFile.identity, revokeFile.identity) ||
    sameIdentity(attestationFile.identity, caFile.identity) ||
    sameIdentity(revokeFile.identity, caFile.identity) ||
    new Set([
      attestationFile.bytesSha256,
      revokeFile.bytesSha256,
      caFile.bytesSha256,
    ]).size !== 3
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_ROOT_SEPARATION_INVALID");
  }

  let addresses;
  let observation;
  let collectedAt;
  try {
    addresses = normalizeAddresses(
      await dependencies.resolveEndpoint(proposal.tlsEndpointHost),
      syntheticOnly,
    );
    const selectedAddress = addresses[0];
    observation = await dependencies.connectTlsPeer(
      Object.freeze({
        address: selectedAddress.address,
        caCertificatePem: caCertificate.encoded,
        endpointPort: proposal.tlsEndpointPort,
        family: selectedAddress.family,
        minimumProtocol: proposal.tlsMinimumProtocol,
        serverName: proposal.tlsServerName,
      }),
    );
    collectedAt = canonicalIso(
      dependencies.now(),
      "CURRENT197_TRUST_ACQUISITION_TIME_INVALID",
    );
    if (
      collectedAt.epoch < preflightAt.epoch ||
      collectedAt.epoch >= proposalValidUntil.epoch
    ) {
      fail("CURRENT197_TRUST_ACQUISITION_PROPOSAL_EXPIRED");
    }
    observation = normalizeObservation(
      observation,
      proposal,
      selectedAddress,
      collectedAt,
    );
  } catch (error) {
    if (error?.safeContractError) throw error;
    fail("CURRENT197_TRUST_ACQUISITION_COLLECTION_FAILED");
  }

  const resolvedAddressSetDigest = digest("RESOLVED_ADDRESS_SET", addresses);
  const receiptDigest = digest("RECEIPT", {
    attestationPublicKeyBytesSha256: attestationRoot.bytesSha256,
    candidateBundleDigest: proposal.candidateBundleDigest,
    collectedAt: collectedAt.value,
    enrollmentId: proposal.enrollmentId,
    releaseSha: proposal.releaseSha,
    resolvedAddressSetDigest,
    revokeIntentPublicKeyBytesSha256: revokeRoot.bytesSha256,
    tlsCaCertificateSha256: caCertificate.bytesSha256,
    tlsLeafCertificateSha256: observation.leafCertificateSha256,
    tlsLeafSpkiSha256: observation.leafSpkiSha256,
  });
  const receipt = Object.freeze({
    authorization: false,
    canConnectNetwork: false,
    canEnrollProductionRoots: false,
    canMutate: false,
    candidateBundleDigest: proposal.candidateBundleDigest,
    collectedAt: collectedAt.value,
    contract: LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_CONTRACT,
    databaseName: proposal.databaseName,
    databaseOid: proposal.databaseOid,
    enrollmentId: proposal.enrollmentId,
    productionExecutionAllowed: false,
    productionRootEnrolled: false,
    protectedSourceFilesVerified: true,
    receiptDigest,
    releaseArtifactDigest: proposal.releaseArtifactDigest,
    releaseSha: proposal.releaseSha,
    resolvedAddressSetDigest,
    runtimeAttestationKeyId: proposal.runtimeAttestationKeyId,
    runtimeAttestationPublicKeyBytesSha256: attestationRoot.bytesSha256,
    runtimeAttestationPublicKeyFingerprint:
      attestationRoot.publicKeyFingerprint,
    runtimeConfigDigest: proposal.runtimeConfigDigest,
    runtimeRevokeIntentKeyId: proposal.runtimeRevokeIntentKeyId,
    runtimeRevokeIntentPublicKeyBytesSha256: revokeRoot.bytesSha256,
    runtimeRevokeIntentPublicKeyFingerprint: revokeRoot.publicKeyFingerprint,
    sharedBetaAccess: false,
    sourceNetworkIoPerformed: true,
    status: LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_STATUS,
    syntheticOnly,
    testAccessAuthorized: false,
    tlsCaCertificateSha256: caCertificate.bytesSha256,
    tlsEndpointHost: proposal.tlsEndpointHost,
    tlsEndpointPort: proposal.tlsEndpointPort,
    tlsHostnameVerified: true,
    tlsLeafCertificateSha256: observation.leafCertificateSha256,
    tlsLeafSpkiSha256: observation.leafSpkiSha256,
    tlsPeerObserved: true,
    tlsProtocol: observation.protocol,
    tlsServerName: proposal.tlsServerName,
    verifierArtifactDigest: proposal.verifierArtifactDigest,
  });
  VERIFIED_RECEIPTS.add(receipt);
  if (productionOrigin) VERIFIED_PRODUCTION_RECEIPTS.add(receipt);
  return receipt;
}

export async function collectLangameRuntimeTrustAcquisitionCurrent197(input) {
  if (arguments.length !== 1) {
    fail("CURRENT197_TRUST_ACQUISITION_ARGUMENTS_INVALID");
  }
  return collectInternal(input, defaultDependencies(), false, true);
}

export async function collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
  input,
  dependencies,
  contextValue,
) {
  if (arguments.length !== 3) {
    fail("CURRENT197_TRUST_ACQUISITION_ARGUMENTS_INVALID");
  }
  const context = exactRecord(
    contextValue,
    CONTEXT_KEYS,
    "CURRENT197_TRUST_ACQUISITION_SYNTHETIC_DENIED",
  );
  const preliminaryInput = exactRecord(
    input,
    INPUT_KEYS,
    "CURRENT197_TRUST_ACQUISITION_INPUT_INVALID",
  );
  const proposal = normalizeProposal(preliminaryInput.proposal, true);
  if (
    context.environment !== "ci" ||
    context.explicitConfirmation !==
      LANGAME_RUNTIME_TRUST_ACQUISITION_CURRENT197_SYNTHETIC_CONFIRMATION ||
    !LOOPBACK_HOSTS.has(context.hostname) ||
    context.databaseName !== proposal.databaseName ||
    !/_ci$/u.test(context.databaseName)
  ) {
    fail("CURRENT197_TRUST_ACQUISITION_SYNTHETIC_DENIED");
  }
  return collectInternal(preliminaryInput, dependencies, true, false);
}

export async function collectSyntheticLangameRuntimeTrustAcquisitionCurrent197WithDefaultDependenciesForTestOnly(
  input,
  context,
) {
  if (arguments.length !== 2) {
    fail("CURRENT197_TRUST_ACQUISITION_ARGUMENTS_INVALID");
  }
  return collectSyntheticLangameRuntimeTrustAcquisitionCurrent197ForTestOnly(
    input,
    defaultDependencies(),
    context,
  );
}

export function isVerifiedLangameRuntimeTrustAcquisitionCurrent197(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_RECEIPTS.has(value)
  );
}

export function isVerifiedProductionLangameRuntimeTrustAcquisitionCurrent197(
  value,
) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    VERIFIED_PRODUCTION_RECEIPTS.has(value)
  );
}

import { X509Certificate, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { connect as connectTcp } from "node:net";
import { checkServerIdentity, connect as connectTls } from "node:tls";
import { types as utilTypes } from "node:util";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";

export const CURRENT187_ENDPOINT_TLS_PEER_COLLECTOR_SLICE =
  "CURRENT187_J2_ENDPOINT_TLS_PEER_COLLECTOR";
export const CURRENT187_ENDPOINT_TLS_PEER_COLLECTOR_PROFILE =
  "CURRENT187_POSTGRES_SSL_REQUEST_TLS_PEER_OBSERVATION_DENY_ONLY_V1";
export const CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND =
  "CURRENT187_ENDPOINT_TLS_PEER_OBSERVATION_DENY_ONLY_RECEIPT";
export const CURRENT187_ENDPOINT_TLS_PEER_STATUS =
  "ENDPOINT_TLS_PEER_OBSERVED_DENY_ONLY";
export const CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION =
  "collect-current187-endpoint-tls-peer-production-observation-deny-only";
export const CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION =
  "collect-current187-endpoint-tls-peer-loopback-ci-observation-only";
export const CURRENT187_ENDPOINT_TLS_PEER_MAX_CONNECT_TIMEOUT_MS = 10_000;
export const CURRENT187_ENDPOINT_TLS_PEER_MAX_HANDSHAKE_TIMEOUT_MS = 15_000;

const INPUT_KEYS = Object.freeze([
  "caCertificatePem",
  "caCertificateSha256",
  "clusterIdentityDigest",
  "connectTimeoutMs",
  "databaseUniverseDigest",
  "endpointClass",
  "endpointHost",
  "endpointPort",
  "environment",
  "expectedLeafCertificateSha256",
  "expectedLeafSpkiSha256",
  "expectedResolvedAddresses",
  "explicitConfirmation",
  "handshakeTimeoutMs",
  "postgresSessionReceiptDigest",
  "purpose",
  "releaseSha",
  "secretReferenceDigest",
  "serverName",
  "verificationChallengeDigest",
]);
const ADDRESS_KEYS = Object.freeze(["address", "family"]);
const DEPENDENCY_KEYS = Object.freeze([
  "connectEndpoint",
  "now",
  "resolveEndpoint",
]);
const CONNECT_INPUT_KEYS = Object.freeze([
  "address",
  "caCertificatePem",
  "connectTimeoutMs",
  "endpointPort",
  "family",
  "handshakeTimeoutMs",
  "serverName",
]);
const OBSERVATION_KEYS = Object.freeze([
  "alpnProtocol",
  "authorizationError",
  "authorized",
  "cipherName",
  "leafCertificateSha256",
  "leafSpkiSha256",
  "leafValidFrom",
  "leafValidTo",
  "localAddress",
  "localPort",
  "protocol",
  "remoteAddress",
  "remotePort",
  "serverName",
]);

const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DNS_HOST_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const LOOPBACK_HOSTS = new Set(["localhost"]);
const ENDPOINT_CLASSES = new Set(["DIRECT_DATABASE", "POOLER"]);
const TLS_PROTOCOLS = new Set(["TLSv1.2", "TLSv1.3"]);
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_CA_CERTIFICATE_BYTES = 65_536;
const MAX_RESOLVED_ADDRESSES = 8;
const SSL_REQUEST_CODE = 80_877_103;

const EXPECTED_ENDPOINT_CLASS_BY_PURPOSE = Object.freeze({
  APPLICATION: "POOLER",
  COORDINATOR: "DIRECT_DATABASE",
  MIGRATION: "DIRECT_DATABASE",
  WORKER: "DIRECT_DATABASE",
});

const ENDPOINT_OBSERVATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_ENDPOINT_TLS_ENDPOINT_OBSERVATION_V1";
const TLS_PEER_OBSERVATION_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_ENDPOINT_TLS_PEER_OBSERVATION_V1";
const RECEIPT_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_V1";

const VERIFIED_ENDPOINT_TLS_PEER_RECEIPTS = new WeakSet();
const VERIFIED_PRODUCTION_ENDPOINT_TLS_PEER_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function bytesDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactOperationalRecord(value, expectedKeys, reasonCode) {
  return current187AdmissionExactDataRecord(
    value,
    expectedKeys,
    reasonCode,
    "CURRENT187 endpoint/TLS collector expected an exact data-only record.",
  );
}

function exactDenseArray(value, maximum, reasonCode) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    fail(reasonCode, "Endpoint address evidence must be an exact dense array.");
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode, "Endpoint address evidence must be an exact dense array.");
  }
  const length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > maximum ||
    Reflect.ownKeys(descriptors).length !== length + 1
  ) {
    fail(reasonCode, "Endpoint address evidence must be bounded and dense.");
  }
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(reasonCode, "Endpoint address evidence must be bounded and dense.");
    }
    result.push(descriptor.value);
  }
  return result;
}

function canonicalIp(value) {
  if (typeof value !== "string") return null;
  const lowered = value.toLowerCase();
  if (lowered.startsWith("::ffff:") && isIP(lowered.slice(7)) === 4) {
    return lowered.slice(7);
  }
  return isIP(lowered) === 0 ? null : lowered;
}

function normalizeAddressRows(value, reasonCode, requireCanonicalOrder) {
  const rows = exactDenseArray(value, MAX_RESOLVED_ADDRESSES, reasonCode).map(
    (entry) => {
      const row = exactOperationalRecord(entry, ADDRESS_KEYS, reasonCode);
      const address = canonicalIp(row.address);
      if (
        address === null ||
        (row.family !== 4 && row.family !== 6) ||
        isIP(address) !== row.family
      ) {
        fail(reasonCode, "Endpoint address evidence contains an invalid IP.");
      }
      return Object.freeze({ address, family: row.family });
    },
  );
  const sorted = [...rows].sort(
    (left, right) =>
      left.family - right.family || left.address.localeCompare(right.address),
  );
  if (
    sorted.some(
      (entry, index) =>
        index > 0 &&
        entry.family === sorted[index - 1].family &&
        entry.address === sorted[index - 1].address,
    )
  ) {
    fail(reasonCode, "Endpoint address evidence contains a duplicate IP.");
  }
  if (
    requireCanonicalOrder &&
    sorted.some(
      (entry, index) =>
        entry.family !== rows[index].family ||
        entry.address !== rows[index].address,
    )
  ) {
    fail(reasonCode, "Expected endpoint addresses must use canonical order.");
  }
  return Object.freeze(sorted);
}

function validateBoundedInteger(value, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(reasonCode, "Endpoint/TLS collector timeout is outside its bound.");
  }
  return value;
}

function normalizeCertificatePem(value, expectedDigest, reasonCode) {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > MAX_CA_CERTIFICATE_BYTES ||
    !value.startsWith("-----BEGIN CERTIFICATE-----\n") ||
    !value.endsWith("-----END CERTIFICATE-----\n") ||
    value.includes("\0") ||
    bytesDigest(Buffer.from(value, "utf8")) !== expectedDigest
  ) {
    fail(reasonCode, "CA certificate bytes do not match the exact binding.");
  }
  return value;
}

function normalizeInput(value, syntheticOnly) {
  const reasonCode = "CURRENT187_ENDPOINT_TLS_PEER_INPUT_INVALID";
  const input = exactOperationalRecord(value, INPUT_KEYS, reasonCode);
  if (
    input.environment !== (syntheticOnly ? "ci" : "production") ||
    input.explicitConfirmation !==
      (syntheticOnly
        ? CURRENT187_ENDPOINT_TLS_PEER_SYNTHETIC_CONFIRMATION
        : CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION) ||
    !CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.includes(input.purpose) ||
    !ENDPOINT_CLASSES.has(input.endpointClass) ||
    input.endpointClass !== EXPECTED_ENDPOINT_CLASS_BY_PURPOSE[input.purpose] ||
    typeof input.endpointHost !== "string" ||
    input.endpointHost !== input.endpointHost.toLowerCase() ||
    input.serverName !== input.endpointHost ||
    !Number.isSafeInteger(input.endpointPort) ||
    input.endpointPort < 1 ||
    input.endpointPort > 65_535 ||
    typeof input.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(input.releaseSha)
  ) {
    fail(reasonCode, "Endpoint/TLS input binding is invalid.");
  }
  if (
    syntheticOnly
      ? !LOOPBACK_HOSTS.has(input.endpointHost)
      : !DNS_HOST_PATTERN.test(input.endpointHost) ||
        input.endpointHost.endsWith(".localhost") ||
        isIP(input.endpointHost) !== 0
  ) {
    fail(reasonCode, "Endpoint hostname is unsafe for this collector mode.");
  }
  for (const key of [
    "caCertificateSha256",
    "clusterIdentityDigest",
    "databaseUniverseDigest",
    "expectedLeafCertificateSha256",
    "expectedLeafSpkiSha256",
    "postgresSessionReceiptDigest",
    "secretReferenceDigest",
    "verificationChallengeDigest",
  ]) {
    if (!current187AdmissionValidDigest(input[key])) {
      fail(reasonCode, "Endpoint/TLS input requires exact non-zero digests.");
    }
  }
  const caCertificatePem = normalizeCertificatePem(
    input.caCertificatePem,
    input.caCertificateSha256,
    reasonCode,
  );
  const expectedResolvedAddresses = normalizeAddressRows(
    input.expectedResolvedAddresses,
    reasonCode,
    true,
  );
  return Object.freeze({
    ...input,
    caCertificatePem,
    connectTimeoutMs: validateBoundedInteger(
      input.connectTimeoutMs,
      CURRENT187_ENDPOINT_TLS_PEER_MAX_CONNECT_TIMEOUT_MS,
      reasonCode,
    ),
    expectedResolvedAddresses,
    handshakeTimeoutMs: validateBoundedInteger(
      input.handshakeTimeoutMs,
      CURRENT187_ENDPOINT_TLS_PEER_MAX_HANDSHAKE_TIMEOUT_MS,
      reasonCode,
    ),
  });
}

function canonicalIso(value, reasonCode) {
  if (typeof value !== "string") {
    fail(reasonCode, "Endpoint/TLS time evidence is invalid.");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(reasonCode, "Endpoint/TLS time evidence is invalid.");
  }
  return value;
}

function normalizePort(value, reasonCode) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    fail(reasonCode, "Endpoint/TLS network port is invalid.");
  }
  return value;
}

function normalizeObservation(value, input, selectedAddress, collectedAt) {
  const reasonCode = "CURRENT187_ENDPOINT_TLS_PEER_OBSERVATION_INVALID";
  const row = exactOperationalRecord(value, OBSERVATION_KEYS, reasonCode);
  const remoteAddress = canonicalIp(row.remoteAddress);
  const localAddress = canonicalIp(row.localAddress);
  const leafValidFrom = canonicalIso(row.leafValidFrom, reasonCode);
  const leafValidTo = canonicalIso(row.leafValidTo, reasonCode);
  const now = Date.parse(collectedAt);
  if (
    row.authorized !== true ||
    row.authorizationError !== null ||
    row.alpnProtocol !== null ||
    row.serverName !== input.serverName ||
    !TLS_PROTOCOLS.has(row.protocol) ||
    typeof row.cipherName !== "string" ||
    row.cipherName.length < 3 ||
    row.cipherName.length > 255 ||
    !FINGERPRINT_PATTERN.test(row.leafCertificateSha256) ||
    !FINGERPRINT_PATTERN.test(row.leafSpkiSha256) ||
    row.leafCertificateSha256 !== input.expectedLeafCertificateSha256 ||
    row.leafSpkiSha256 !== input.expectedLeafSpkiSha256 ||
    remoteAddress !== selectedAddress.address ||
    localAddress === null ||
    normalizePort(row.remotePort, reasonCode) !== input.endpointPort ||
    normalizePort(row.localPort, reasonCode) !== row.localPort ||
    now < Date.parse(leafValidFrom) ||
    now >= Date.parse(leafValidTo)
  ) {
    fail(
      reasonCode,
      "Observed endpoint/TLS peer does not match the exact expected binding.",
    );
  }
  return Object.freeze({
    ...row,
    leafValidFrom,
    leafValidTo,
    localAddress,
    remoteAddress,
  });
}

function socketTimeout(reasonCode, message) {
  const error = new Error(message);
  error.code = reasonCode;
  return error;
}

function openTcpSocket(options) {
  return new Promise((resolve, reject) => {
    const socket = connectTcp({
      family: options.family,
      host: options.address,
      port: options.endpointPort,
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(
        socketTimeout(
          "CURRENT187_ENDPOINT_TCP_TIMEOUT",
          "Endpoint TCP connection timed out.",
        ),
      );
    }, options.connectTimeoutMs);
    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
    }
    function onConnect() {
      if (settled) return;
      settled = true;
      cleanup();
      socket.setNoDelay(true);
      resolve(socket);
    }
    function onError(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
}

function requestPostgresTls(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        socketTimeout(
          "CURRENT187_POSTGRES_SSL_REQUEST_TIMEOUT",
          "PostgreSQL SSLRequest timed out.",
        ),
      );
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("end", onEnd);
      socket.removeListener("error", onError);
    }
    function onData(chunk) {
      if (settled) return;
      settled = true;
      cleanup();
      socket.pause();
      if (!Buffer.isBuffer(chunk) || chunk.length !== 1 || chunk[0] !== 0x53) {
        reject(
          socketTimeout(
            "CURRENT187_POSTGRES_SSL_REQUEST_REJECTED",
            "Endpoint did not return the exact PostgreSQL SSL support byte.",
          ),
        );
        return;
      }
      resolve();
    }
    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Endpoint closed before PostgreSQL SSL negotiation."));
    }
    function onError(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
    socket.once("data", onData);
    socket.once("end", onEnd);
    socket.once("error", onError);
    const request = Buffer.alloc(8);
    request.writeInt32BE(8, 0);
    request.writeInt32BE(SSL_REQUEST_CODE, 4);
    socket.write(request);
  });
}

function upgradeToVerifiedTls(socket, options) {
  return new Promise((resolve, reject) => {
    const secureSocket = connectTls({
      ca: options.caCertificatePem,
      checkServerIdentity,
      maxVersion: "TLSv1.3",
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
      servername: options.serverName,
      socket,
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      secureSocket.destroy();
      reject(
        socketTimeout(
          "CURRENT187_ENDPOINT_TLS_TIMEOUT",
          "Endpoint TLS handshake timed out.",
        ),
      );
    }, options.handshakeTimeoutMs);
    function cleanup() {
      clearTimeout(timer);
      secureSocket.removeListener("secureConnect", onSecureConnect);
      secureSocket.removeListener("error", onError);
    }
    function onSecureConnect() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(secureSocket);
    }
    function onError(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }
    secureSocket.once("secureConnect", onSecureConnect);
    secureSocket.once("error", onError);
  });
}

function x509Iso(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new Error("Invalid peer certificate time.");
  return new Date(parsed).toISOString();
}

async function connectEndpointActual(value) {
  const options = exactOperationalRecord(
    value,
    CONNECT_INPUT_KEYS,
    "CURRENT187_ENDPOINT_TLS_PEER_CONNECT_INPUT_INVALID",
  );
  let socket;
  let secureSocket;
  try {
    socket = await openTcpSocket(options);
    await requestPostgresTls(socket, options.handshakeTimeoutMs);
    secureSocket = await upgradeToVerifiedTls(socket, options);
    const peer = secureSocket.getPeerCertificate(true);
    if (!peer || !Buffer.isBuffer(peer.raw) || peer.raw.length === 0) {
      throw new Error("Endpoint did not provide a leaf certificate.");
    }
    const certificate = new X509Certificate(peer.raw);
    const spki = certificate.publicKey.export({ format: "der", type: "spki" });
    const cipher = secureSocket.getCipher();
    return Object.freeze({
      alpnProtocol:
        secureSocket.alpnProtocol === false || secureSocket.alpnProtocol === ""
          ? null
          : secureSocket.alpnProtocol,
      authorizationError: secureSocket.authorizationError ?? null,
      authorized: secureSocket.authorized,
      cipherName: cipher?.name ?? null,
      leafCertificateSha256: bytesDigest(peer.raw),
      leafSpkiSha256: bytesDigest(spki),
      leafValidFrom: x509Iso(certificate.validFrom),
      leafValidTo: x509Iso(certificate.validTo),
      localAddress: secureSocket.localAddress ?? null,
      localPort: secureSocket.localPort ?? null,
      protocol: secureSocket.getProtocol(),
      remoteAddress: secureSocket.remoteAddress ?? null,
      remotePort: secureSocket.remotePort ?? null,
      serverName: options.serverName,
    });
  } finally {
    secureSocket?.destroy();
    socket?.destroy();
  }
}

function productionDependencies() {
  return Object.freeze({
    async connectEndpoint(input) {
      return connectEndpointActual(input);
    },
    now() {
      return new Date().toISOString();
    },
    async resolveEndpoint(hostname) {
      const rows = await lookup(hostname, { all: true, verbatim: true });
      return rows.map((row) => ({ address: row.address, family: row.family }));
    },
  });
}

async function collectInternal(
  value,
  dependencyValue,
  syntheticOnly,
  productionOrigin,
) {
  const input = normalizeInput(value, syntheticOnly);
  const dependencies = exactOperationalRecord(
    dependencyValue,
    DEPENDENCY_KEYS,
    "CURRENT187_ENDPOINT_TLS_PEER_DEPENDENCIES_INVALID",
  );
  if (
    typeof dependencies.resolveEndpoint !== "function" ||
    typeof dependencies.connectEndpoint !== "function" ||
    typeof dependencies.now !== "function"
  ) {
    fail(
      "CURRENT187_ENDPOINT_TLS_PEER_DEPENDENCIES_INVALID",
      "Endpoint/TLS collector dependencies must be exact functions.",
    );
  }

  let resolvedAddresses;
  let observation;
  let collectedAt;
  try {
    resolvedAddresses = normalizeAddressRows(
      await dependencies.resolveEndpoint(input.endpointHost),
      "CURRENT187_ENDPOINT_TLS_PEER_RESOLUTION_INVALID",
      false,
    );
    if (
      resolvedAddresses.length !== input.expectedResolvedAddresses.length ||
      resolvedAddresses.some(
        (entry, index) =>
          entry.family !== input.expectedResolvedAddresses[index].family ||
          entry.address !== input.expectedResolvedAddresses[index].address,
      )
    ) {
      fail(
        "CURRENT187_ENDPOINT_TLS_PEER_RESOLUTION_DRIFT",
        "Actual DNS resolution does not match the exact expected addresses.",
      );
    }
    const selectedAddress = resolvedAddresses[0];
    const connectInput = Object.freeze({
      address: selectedAddress.address,
      caCertificatePem: input.caCertificatePem,
      connectTimeoutMs: input.connectTimeoutMs,
      endpointPort: input.endpointPort,
      family: selectedAddress.family,
      handshakeTimeoutMs: input.handshakeTimeoutMs,
      serverName: input.serverName,
    });
    const rawObservation = await dependencies.connectEndpoint(connectInput);
    collectedAt = canonicalIso(
      dependencies.now(),
      "CURRENT187_ENDPOINT_TLS_PEER_TIME_INVALID",
    );
    observation = normalizeObservation(
      rawObservation,
      input,
      selectedAddress,
      collectedAt,
    );
  } catch {
    fail(
      "CURRENT187_ENDPOINT_TLS_PEER_COLLECTION_FAILED",
      "Endpoint/TLS peer evidence collection failed closed.",
    );
  }

  const endpointProjection = {
    endpointClass: input.endpointClass,
    endpointHost: input.endpointHost,
    endpointPort: input.endpointPort,
    expectedResolvedAddresses: input.expectedResolvedAddresses,
    localAddress: observation.localAddress,
    localPort: observation.localPort,
    remoteAddress: observation.remoteAddress,
    remotePort: observation.remotePort,
    serverName: observation.serverName,
  };
  const tlsPeerProjection = {
    alpnProtocol: observation.alpnProtocol,
    caCertificateSha256: input.caCertificateSha256,
    cipherName: observation.cipherName,
    leafCertificateSha256: observation.leafCertificateSha256,
    leafSpkiSha256: observation.leafSpkiSha256,
    leafValidFrom: observation.leafValidFrom,
    leafValidTo: observation.leafValidTo,
    protocol: observation.protocol,
  };
  const receiptProjection = {
    clusterIdentityDigest: input.clusterIdentityDigest,
    collectedAt,
    databaseUniverseDigest: input.databaseUniverseDigest,
    endpointObservationDigest: digest(
      ENDPOINT_OBSERVATION_DIGEST_DOMAIN,
      endpointProjection,
    ),
    environment: input.environment,
    postgresSessionReceiptDigest: input.postgresSessionReceiptDigest,
    purpose: input.purpose,
    releaseSha: input.releaseSha,
    secretReferenceDigest: input.secretReferenceDigest,
    tlsPeerObservationDigest: digest(
      TLS_PEER_OBSERVATION_DIGEST_DOMAIN,
      tlsPeerProjection,
    ),
    verificationChallengeDigest: input.verificationChallengeDigest,
  };
  const receipt = current187AdmissionDeepFreeze({
    admissionContract: CURRENT187_ADMISSION_CONTRACT,
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: input.clusterIdentityDigest,
    collectedAt,
    databaseUniverseDigest: input.databaseUniverseDigest,
    dnsResolutionMatched: true,
    endpointIdentityAttested: false,
    endpointIdentityObserved: true,
    endpointObservationDigest: receiptProjection.endpointObservationDigest,
    endpointTlsPeerReceiptDigest: digest(
      RECEIPT_DIGEST_DOMAIN,
      receiptProjection,
    ),
    environment: input.environment,
    hbaRuleMatched: false,
    kind: CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
    negativeProbePerformed: false,
    poolerIdentityObserved: false,
    postgresSessionReceiptDigest: input.postgresSessionReceiptDigest,
    postgresSslRequestAccepted: true,
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    profile: CURRENT187_ENDPOINT_TLS_PEER_COLLECTOR_PROFILE,
    purpose: input.purpose,
    releaseSha: input.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    secretReferenceDigest: input.secretReferenceDigest,
    selectedAddressMatched: true,
    sharedBetaAccess: false,
    slice: CURRENT187_ENDPOINT_TLS_PEER_COLLECTOR_SLICE,
    sourceNetworkIoPerformed: true,
    status: CURRENT187_ENDPOINT_TLS_PEER_STATUS,
    syntheticOnly,
    testAccessAuthorized: false,
    tlsCaVerified: true,
    tlsHostnameVerified: true,
    tlsPeerIdentityAttested: false,
    tlsPeerIdentityObserved: true,
    tlsPeerObservationDigest: receiptProjection.tlsPeerObservationDigest,
    verificationChallengeDigest: input.verificationChallengeDigest,
  });
  VERIFIED_ENDPOINT_TLS_PEER_RECEIPTS.add(receipt);
  if (productionOrigin) {
    VERIFIED_PRODUCTION_ENDPOINT_TLS_PEER_RECEIPTS.add(receipt);
  }
  return receipt;
}

export async function collectCurrent187EndpointTlsPeerEvidence(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_ENDPOINT_TLS_PEER_ARGUMENTS_INVALID",
      "Production endpoint/TLS collection accepts exactly one input.",
    );
  }
  return collectInternal(input, productionDependencies(), false, true);
}

export async function collectCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_ENDPOINT_TLS_PEER_ARGUMENTS_INVALID",
      "Test endpoint/TLS collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, false, false);
}

export async function collectSyntheticCurrent187EndpointTlsPeerEvidenceForTestOnly(
  input,
) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_ENDPOINT_TLS_PEER_ARGUMENTS_INVALID",
      "Synthetic endpoint/TLS collection accepts exactly one input.",
    );
  }
  return collectInternal(input, productionDependencies(), true, false);
}

export async function collectSyntheticCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
  input,
  dependencies,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_ENDPOINT_TLS_PEER_ARGUMENTS_INVALID",
      "Synthetic test collection accepts exact input and dependencies.",
    );
  }
  return collectInternal(input, dependencies, true, false);
}

export function isVerifiedCurrent187EndpointTlsPeerReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_ENDPOINT_TLS_PEER_RECEIPTS.has(value)
  );
}

export function isVerifiedCurrent187ProductionEndpointTlsPeerReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_PRODUCTION_ENDPOINT_TLS_PEER_RECEIPTS.has(value)
  );
}

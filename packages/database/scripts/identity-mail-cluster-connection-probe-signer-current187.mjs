import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signPayload,
} from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidKeyId,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_CONNECTION_PROBE_KIND,
  CURRENT187_CONNECTION_PROBE_MAX_LIFETIME_MS,
  CURRENT187_CONNECTION_PROBE_PROFILE,
  CURRENT187_CONNECTION_PROBE_PURPOSE,
  CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
  CURRENT187_CONNECTION_PROBE_SLICE,
  CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  current187ConnectionProbePayloadDigest,
  current187ConnectionProbePublicKeyFingerprint,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import { isVerifiedCurrent187ConnectionProbeRunnerReceipt } from "./identity-mail-cluster-connection-probe-runner-current187.mjs";

export const CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_KIND =
  "CURRENT187_PROTECTED_CONNECTION_PROBE_SIGNER_AUTHORITY";
export const CURRENT187_CONNECTION_PROBE_SIGNER_STATUS =
  "PROTECTED_SIGNER_LOADED_NOT_EXECUTION_AUTHORITY";
export const CURRENT187_CONNECTION_PROBE_SIGNER_TEST_STATUS =
  "TEST_ONLY_MEMORY_SIGNER_NOT_PRODUCTION_AUTHORITY";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const MAX_KEY_BYTES = 16_384;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const AUTHORITY_INPUT_KEYS = Object.freeze([
  "expectedPublicKeySha256",
  "keyId",
  "notAfter",
  "notBefore",
  "privateKeyPath",
  "publicKeyPath",
]);
const TEST_AUTHORITY_INPUT_KEYS = Object.freeze([
  "keyId",
  "notAfter",
  "notBefore",
]);
const NO_EXECUTION_AUTHORITY = current187AdmissionDeepFreeze({
  authorization: false,
  canConnectDatabase: false,
  canDeploy: false,
  canMutate: false,
  canSend: false,
  productionApplyAuthorized: false,
  sharedBetaAccess: false,
  testAccessAuthorized: false,
});

const authorityStates = new WeakMap();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalEpoch(value, reasonCode, label) {
  if (typeof value !== "string") fail(reasonCode, `${label} is invalid.`);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(reasonCode, `${label} must be a canonical ISO timestamp.`);
  }
  return epoch;
}

function sameNativePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform() === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function sameOrDescendant(candidate, parent) {
  if (sameNativePath(candidate, parent)) return true;
  const fromParent = relative(parent, candidate);
  return (
    fromParent.length > 0 &&
    fromParent !== ".." &&
    !fromParent.startsWith(`..${sep}`) &&
    !isAbsolute(fromParent)
  );
}

function pathComponents(absolutePath) {
  const parsed = parse(absolutePath);
  const components = [parsed.root];
  let cursor = parsed.root;
  for (const component of absolutePath
    .slice(parsed.root.length)
    .split(sep)
    .filter(Boolean)) {
    cursor = resolve(cursor, component);
    components.push(cursor);
  }
  return components;
}

function identityOf(stat) {
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function isRegularFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink();
}

async function forbiddenRoots() {
  try {
    return Object.freeze({
      repository: resolve(await realpath(REPOSITORY_ROOT)),
      systemTemp: resolve(await realpath(resolve(tmpdir()))),
    });
  } catch {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID",
      "Protected signer forbidden roots could not be resolved.",
    );
  }
}

async function inspectKeyFile(pathValue, privateKey) {
  if (
    typeof pathValue !== "string" ||
    pathValue.length === 0 ||
    pathValue.includes("\0") ||
    !isAbsolute(pathValue) ||
    !sameNativePath(pathValue, resolve(pathValue))
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID",
      "Protected signer keys require canonical absolute paths.",
    );
  }
  const requestedPath = resolve(pathValue);
  for (const [index, component] of pathComponents(requestedPath).entries()) {
    let stat;
    try {
      stat = await lstat(component, { bigint: true });
    } catch {
      fail(
        "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID",
        "A protected signer key path component is unavailable.",
      );
    }
    const final = index === pathComponents(requestedPath).length - 1;
    if (
      stat.isSymbolicLink() ||
      (final ? !stat.isFile() : !stat.isDirectory())
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID",
        "Protected signer key paths cannot contain links or non-file leaves.",
      );
    }
  }
  let canonicalPath;
  let fixedPoint;
  let stat;
  try {
    canonicalPath = resolve(await realpath(requestedPath));
    fixedPoint = resolve(await realpath(canonicalPath));
    stat = await lstat(requestedPath, { bigint: true });
  } catch {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID",
      "A protected signer key path is unavailable.",
    );
  }
  const forbidden = await forbiddenRoots();
  if (
    !sameNativePath(requestedPath, canonicalPath) ||
    !sameNativePath(canonicalPath, fixedPoint) ||
    !isRegularFile(stat) ||
    stat.nlink !== 1n ||
    sameOrDescendant(canonicalPath, forbidden.repository) ||
    sameOrDescendant(canonicalPath, forbidden.systemTemp)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_PATH_INVALID",
      "Protected signer keys must be single-link files outside repository and system temp roots.",
    );
  }
  if (
    privateKey &&
    platform() !== "win32" &&
    (Number(stat.mode) & 0o077) !== 0
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
      "Protected signer private key group or other permissions are forbidden.",
    );
  }
  return Object.freeze({
    identity: identityOf(stat),
    path: canonicalPath,
    privateKey,
  });
}

async function readExactKeyFile(file) {
  let handle;
  try {
    handle = await open(file.path, "r");
    const opened = await handle.stat({ bigint: true });
    if (
      !isRegularFile(opened) ||
      !sameIdentity(identityOf(opened), file.identity) ||
      opened.nlink !== 1n ||
      opened.size < 1n ||
      opened.size > BigInt(MAX_KEY_BYTES)
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
        "A protected signer key file changed before reading.",
      );
    }
    const buffer = Buffer.alloc(MAX_KEY_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const result = await handle.read(
        buffer,
        total,
        buffer.length - total,
        total,
      );
      if (result.bytesRead === 0) break;
      total += result.bytesRead;
    }
    const finalOpened = await handle.stat({ bigint: true });
    if (
      total < 1 ||
      total > MAX_KEY_BYTES ||
      finalOpened.size !== BigInt(total) ||
      !sameIdentity(identityOf(finalOpened), file.identity)
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
        "A protected signer key read was incomplete or raced with replacement.",
      );
    }
    const refreshed = await inspectKeyFile(file.path, file.privateKey);
    if (!sameIdentity(refreshed.identity, file.identity)) {
      fail(
        "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
        "A protected signer key identity changed after reading.",
      );
    }
    return Buffer.from(buffer.subarray(0, total));
  } catch (error) {
    if (error?.safeContractError === true) throw error;
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
      "A protected signer key could not be read safely.",
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function normalizeAuthorityTimeline(input) {
  const notBefore = canonicalEpoch(
    input.notBefore,
    "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
    "Signer root validity start",
  );
  const notAfter = canonicalEpoch(
    input.notAfter,
    "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
    "Signer root validity end",
  );
  if (
    !current187AdmissionValidKeyId(input.keyId) ||
    notAfter <= notBefore ||
    notAfter - notBefore > 366 * 24 * 60 * 60 * 1_000
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
      "Protected signer key identity or bounded root timeline is invalid.",
    );
  }
  return Object.freeze({ notAfter, notBefore });
}

function publicRoot(state) {
  return current187AdmissionDeepFreeze({
    algorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    keyId: state.keyId,
    notAfter: state.notAfter,
    notBefore: state.notBefore,
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: state.publicKeyFingerprint,
    publicKeyPem: state.publicKeyPem,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    status: "ACTIVE",
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
  });
}

function publicAuthority(state) {
  return current187AdmissionDeepFreeze({
    authority: NO_EXECUTION_AUTHORITY,
    authorityKind: CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_KIND,
    keyId: state.keyId,
    publicKeyFingerprint: state.publicKeyFingerprint,
    root: publicRoot(state),
    status:
      state.kind === "PRODUCTION_FILE_BACKED"
        ? CURRENT187_CONNECTION_PROBE_SIGNER_STATUS
        : CURRENT187_CONNECTION_PROBE_SIGNER_TEST_STATUS,
  });
}

async function assertFresh(state) {
  if (state.kind !== "PRODUCTION_FILE_BACKED") return;
  const [privateFile, publicFile] = await Promise.all([
    inspectKeyFile(state.privateFile.path, true),
    inspectKeyFile(state.publicFile.path, false),
  ]);
  if (
    !sameIdentity(privateFile.identity, state.privateFile.identity) ||
    !sameIdentity(publicFile.identity, state.publicFile.identity)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_STALE",
      "Protected signer key file identity drifted.",
    );
  }
  const [privateBytes, publicBytes] = await Promise.all([
    readExactKeyFile(privateFile),
    readExactKeyFile(publicFile),
  ]);
  if (
    sha256(privateBytes) !== state.privateKeyBytesSha256 ||
    sha256(publicBytes) !== state.publicKeyBytesSha256
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_STALE",
      "Protected signer key bytes drifted.",
    );
  }
}

function authorityState(authority, expectedKind) {
  if (
    !authority ||
    typeof authority !== "object" ||
    isProxy(authority) ||
    !authorityStates.has(authority)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
      "An exact module-branded protected signer authority is required.",
    );
  }
  const state = authorityStates.get(authority);
  if (state.kind !== expectedKind) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
      "The protected signer authority kind is invalid for this entry point.",
    );
  }
  return state;
}

export async function loadCurrent187ConnectionProbeSignerAuthority(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_ARGUMENTS_INVALID",
      "Protected signer loader accepts exactly one input.",
    );
  }
  const normalized = current187AdmissionExactDataRecord(
    input,
    AUTHORITY_INPUT_KEYS,
    "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
    "Protected signer loader input must be exact and data-only.",
  );
  const timeline = normalizeAuthorityTimeline(normalized);
  if (
    !SHA256_PATTERN.test(normalized.expectedPublicKeySha256) ||
    typeof normalized.privateKeyPath !== "string" ||
    typeof normalized.publicKeyPath !== "string" ||
    sameNativePath(normalized.privateKeyPath, normalized.publicKeyPath)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
      "Protected signer requires distinct key paths and an exact public-key pin.",
    );
  }
  const [privateFile, publicFile] = await Promise.all([
    inspectKeyFile(normalized.privateKeyPath, true),
    inspectKeyFile(normalized.publicKeyPath, false),
  ]);
  if (sameIdentity(privateFile.identity, publicFile.identity)) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
      "Protected signer private and public keys must be distinct files.",
    );
  }
  const [privateBytes, publicBytes] = await Promise.all([
    readExactKeyFile(privateFile),
    readExactKeyFile(publicFile),
  ]);
  let privateKey;
  let publicKey;
  try {
    privateKey = createPrivateKey({
      format: "der",
      key: privateBytes,
      type: "pkcs8",
    });
    publicKey = createPublicKey({
      format: "der",
      key: publicBytes,
      type: "spki",
    });
  } catch {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
      "Protected signer requires canonical Ed25519 PKCS8 and SPKI files.",
    );
  }
  const canonicalPrivate = Buffer.from(
    privateKey.export({ format: "der", type: "pkcs8" }),
  );
  const canonicalPublic = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  const derivedPublic = Buffer.from(
    createPublicKey(privateKey).export({ format: "der", type: "spki" }),
  );
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const publicKeyFingerprint =
    current187ConnectionProbePublicKeyFingerprint(publicKeyPem);
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    publicKey.asymmetricKeyType !== "ed25519" ||
    !canonicalPrivate.equals(privateBytes) ||
    !canonicalPublic.equals(publicBytes) ||
    !derivedPublic.equals(canonicalPublic) ||
    publicKeyFingerprint !== normalized.expectedPublicKeySha256
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_KEY_FILE_INVALID",
      "Protected signer Ed25519 key pair or public-key pin does not match.",
    );
  }
  const state = {
    keyId: normalized.keyId,
    kind: "PRODUCTION_FILE_BACKED",
    notAfter: normalized.notAfter,
    notAfterEpoch: timeline.notAfter,
    notBefore: normalized.notBefore,
    notBeforeEpoch: timeline.notBefore,
    privateFile,
    privateKey,
    privateKeyBytesSha256: sha256(privateBytes),
    publicFile,
    publicKey,
    publicKeyBytesSha256: sha256(publicBytes),
    publicKeyFingerprint,
    publicKeyPem,
  };
  await assertFresh(state);
  const authority = publicAuthority(state);
  authorityStates.set(authority, state);
  return authority;
}

export function createCurrent187ConnectionProbeSignerAuthorityForTestOnly(
  input,
) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_ARGUMENTS_INVALID",
      "Test signer authority accepts exactly one input.",
    );
  }
  const normalized = current187AdmissionExactDataRecord(
    input,
    TEST_AUTHORITY_INPUT_KEYS,
    "CURRENT187_CONNECTION_PROBE_SIGNER_AUTHORITY_INVALID",
    "Test signer authority input must be exact and data-only.",
  );
  const timeline = normalizeAuthorityTimeline(normalized);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const state = {
    keyId: normalized.keyId,
    kind: "TEST_ONLY_MEMORY",
    notAfter: normalized.notAfter,
    notAfterEpoch: timeline.notAfter,
    notBefore: normalized.notBefore,
    notBeforeEpoch: timeline.notBefore,
    privateKey,
    publicKey,
    publicKeyFingerprint:
      current187ConnectionProbePublicKeyFingerprint(publicKeyPem),
    publicKeyPem,
  };
  const authority = publicAuthority(state);
  authorityStates.set(authority, state);
  return authority;
}

function normalizeRunnerReceipt(receipt, syntheticOnly) {
  if (
    !isVerifiedCurrent187ConnectionProbeRunnerReceipt(receipt) ||
    receipt.syntheticOnly !== syntheticOnly ||
    receipt.environment !== (syntheticOnly ? "ci" : "production") ||
    receipt.actualPositiveProbeCount !== 4 ||
    receipt.actualNetworkNegativeProbeCount !== 20 ||
    receipt.controlPolicyNegativeProbeCount !== 12 ||
    receipt.positiveProbeCount !== 4 ||
    receipt.negativeProbeCount !== 32 ||
    receipt.sourceNetworkIoPerformed !== true ||
    receipt.authorization !== false ||
    receipt.canMutate !== false ||
    receipt.canSend !== false ||
    receipt.productionRuntimeAttested !== false ||
    receipt.testAccessAuthorized !== false ||
    receipt.sharedBetaAccess !== false ||
    !RELEASE_SHA_PATTERN.test(receipt.releaseSha)
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_RUNNER_RECEIPT_INVALID",
      "Protected signer requires the exact unprivileged branded runner receipt.",
    );
  }
  return receipt;
}

async function signInternal(
  authority,
  runnerReceipt,
  expectedKind,
  syntheticOnly,
) {
  const state = authorityState(authority, expectedKind);
  await assertFresh(state);
  const receipt = normalizeRunnerReceipt(runnerReceipt, syntheticOnly);
  const issuedAtEpoch = Date.now();
  if (
    issuedAtEpoch < state.notBeforeEpoch ||
    issuedAtEpoch >= state.notAfterEpoch
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_ROOT_INACTIVE",
      "Protected signer root is outside its validity window.",
    );
  }
  const validUntilEpoch = Math.min(
    issuedAtEpoch + CURRENT187_CONNECTION_PROBE_MAX_LIFETIME_MS,
    state.notAfterEpoch,
  );
  if (validUntilEpoch <= issuedAtEpoch) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_ROOT_INACTIVE",
      "Protected signer root has no remaining issuance window.",
    );
  }
  const payload = current187AdmissionDeepFreeze({
    clusterIdentityDigest: receipt.clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    databaseUniverseDigest: receipt.databaseUniverseDigest,
    environment: receipt.environment,
    hbaControlReceiptDigest: receipt.hbaControlReceiptDigest,
    hostControlChallengeDigest: receipt.hostControlChallengeDigest,
    issuedAt: new Date(issuedAtEpoch).toISOString(),
    kind: CURRENT187_CONNECTION_PROBE_KIND,
    nonce: receipt.nonce,
    operationId: receipt.operationId,
    pgbouncerControlReceiptDigest: receipt.pgbouncerControlReceiptDigest,
    probeRunnerArtifactDigest: receipt.probeRunnerArtifactDigest,
    probeTranscriptDigest: receipt.probeTranscriptDigest,
    profile: CURRENT187_CONNECTION_PROBE_PROFILE,
    publicKeyFingerprint: state.publicKeyFingerprint,
    purpose: CURRENT187_CONNECTION_PROBE_PURPOSE,
    releaseSha: receipt.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    services: receipt.services,
    signingKeyId: state.keyId,
    slice: CURRENT187_CONNECTION_PROBE_SLICE,
    trustDomain: CURRENT187_CONNECTION_PROBE_TRUST_DOMAIN,
    validUntil: new Date(validUntilEpoch).toISOString(),
  });
  const payloadDigest = current187ConnectionProbePayloadDigest(payload);
  const signature = signPayload(
    null,
    Buffer.from(current187AdmissionCanonicalJson(payload), "utf8"),
    state.privateKey,
  ).toString("base64url");
  await assertFresh(state);
  return current187AdmissionDeepFreeze({
    payload,
    payloadDigest,
    publicKeyFingerprint: state.publicKeyFingerprint,
    signature,
    signatureAlgorithm: CURRENT187_CONNECTION_PROBE_SIGNATURE_ALGORITHM,
    signingKeyId: state.keyId,
  });
}

export async function signCurrent187ConnectionProbeRunnerReceipt(
  authority,
  runnerReceipt,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_ARGUMENTS_INVALID",
      "Production signer accepts authority and runner receipt.",
    );
  }
  return signInternal(
    authority,
    runnerReceipt,
    "PRODUCTION_FILE_BACKED",
    false,
  );
}

export async function signCurrent187ConnectionProbeRunnerReceiptForTestOnly(
  authority,
  runnerReceipt,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CONNECTION_PROBE_SIGNER_ARGUMENTS_INVALID",
      "Test signer accepts authority and runner receipt.",
    );
  }
  return signInternal(authority, runnerReceipt, "TEST_ONLY_MEMORY", true);
}

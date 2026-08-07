import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_AUTHORITY_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_AUTHORITY_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_VERIFICATION_AUTHORITY_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_VERIFICATION_AUTHORITY_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_TEST_AUTHORITY_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_TEST_AUTHORITY_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_RUN_BINDING_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_RUN_BINDING_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_SIGNED_ANCHOR_V1";

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_PURPOSES =
  deepFreeze(["JOURNAL_ROOT_ANCHOR", "MATERIALIZER_RECOVERY_ANCHOR"]);

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RUN_TOKEN_PATTERN = /^[0-9a-f]{32}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_KEY_BYTES = 16_384;
const MAX_PAYLOAD_BYTES = 256 * 1_024;
const MAX_ANCHOR_SNAPSHOT_BYTES = MAX_PAYLOAD_BYTES + 32 * 1_024;
const MAX_DATA_DEPTH = 64;
const MAX_DATA_NODES = 20_000;
const MAX_ARRAY_ENTRIES = 10_000;
const MAX_OBJECT_KEYS = 10_000;
const DOMAIN_RUN_BINDING_SIGNATURE =
  "LEETPLUS_CURRENT180_CURRENT190_COORDINATOR_RUN_BINDING_ED25519_V1";
const DOMAIN_RUN_BINDING_DIGEST =
  "LEETPLUS_CURRENT180_CURRENT190_COORDINATOR_RUN_BINDING_DIGEST_V1";
const DOMAIN_ANCHOR_SIGNATURE =
  "LEETPLUS_CURRENT180_CURRENT190_COORDINATOR_ANCHOR_ED25519_V1";
const DOMAIN_ANCHOR_DIGEST =
  "LEETPLUS_CURRENT180_CURRENT190_COORDINATOR_ANCHOR_DIGEST_V1";

const authorityStates = new WeakMap();
const runBindingStates = new WeakMap();

const NO_AUTHORITY = deepFreeze({
  canApplyDatabase: false,
  canConnectDatabase: false,
  canDeploy: false,
  canMutateProduction: false,
  canProvisionRolesOrGrants: false,
  canSpawnProcess: false,
  executionAuthority: false,
  productionApplyAuthorized: false,
});

export class Current180Current190PostgresqlRehearsalCoordinatorError extends Error {
  constructor(code, findings = []) {
    super("CURRENT180-CURRENT190 rehearsal coordinator failed closed.");
    this.name = "Current180Current190PostgresqlRehearsalCoordinatorError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, findings) {
  throw new Current180Current190PostgresqlRehearsalCoordinatorError(
    code,
    findings,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return Object.freeze(value);
}

function ownDataDescriptors(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    return null;
  }
  return descriptors;
}

function exactKeys(value, expectedKeys) {
  const descriptors = ownDataDescriptors(value);
  return (
    descriptors !== null &&
    canonicalJson(Object.keys(descriptors).sort(compareText)) ===
      canonicalJson([...expectedKeys].sort(compareText))
  );
}

function accountDataNode(context, depth, utf8Bytes = 0) {
  context.nodeCount += 1;
  context.utf8Bytes += utf8Bytes;
  if (
    depth > MAX_DATA_DEPTH ||
    context.nodeCount > MAX_DATA_NODES ||
    context.utf8Bytes > context.maxUtf8Bytes
  ) {
    fail("COORDINATOR_DATA_INVALID", [
      depth > MAX_DATA_DEPTH
        ? "DATA_DEPTH_LIMIT_EXCEEDED"
        : context.nodeCount > MAX_DATA_NODES
          ? "DATA_NODE_LIMIT_EXCEEDED"
          : "DATA_UTF8_LIMIT_EXCEEDED",
    ]);
  }
}

function snapshotDataOnlyInternal(value, context, depth) {
  if (value === null || typeof value === "boolean") {
    accountDataNode(context, depth);
    return value;
  }
  if (typeof value === "string") {
    accountDataNode(context, depth, Buffer.byteLength(value, "utf8"));
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      fail("COORDINATOR_DATA_INVALID", ["SAFE_JSON_INTEGER_REQUIRED"]);
    }
    accountDataNode(context, depth);
    return value;
  }
  if (typeof value !== "object" || isProxy(value) || context.seen.has(value)) {
    fail("COORDINATOR_DATA_INVALID", ["ACYCLIC_DATA_ONLY_VALUE_REQUIRED"]);
  }
  accountDataNode(context, depth);
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (
      prototype !== Array.prototype ||
      !Number.isSafeInteger(value.length) ||
      value.length > MAX_ARRAY_ENTRIES
    ) {
      fail("COORDINATOR_DATA_INVALID", ["BOUNDED_DENSE_PLAIN_ARRAY_REQUIRED"]);
    }
  } else if (prototype !== Object.prototype) {
    fail("COORDINATOR_DATA_INVALID", ["PLAIN_OBJECT_REQUIRED"]);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    fail("COORDINATOR_DATA_INVALID", ["ACCESSOR_OR_SYMBOL_REJECTED"]);
  }
  const dataKeys = keys.filter((key) => key !== "length");
  if (
    (!Array.isArray(value) && dataKeys.length > MAX_OBJECT_KEYS) ||
    dataKeys.length > MAX_DATA_NODES
  ) {
    fail("COORDINATOR_DATA_INVALID", ["DATA_KEY_LIMIT_EXCEEDED"]);
  }
  for (const key of dataKeys) {
    accountDataNode(context, depth, Buffer.byteLength(key, "utf8"));
  }
  context.seen.add(value);
  if (Array.isArray(value)) {
    if (
      keys.length !== value.length + 1 ||
      !Object.hasOwn(descriptors, "length")
    ) {
      fail("COORDINATOR_DATA_INVALID", ["DENSE_PLAIN_ARRAY_REQUIRED"]);
    }
    const snapshot = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(descriptors, String(index))) {
        fail("COORDINATOR_DATA_INVALID", ["DENSE_PLAIN_ARRAY_REQUIRED"]);
      }
      snapshot.push(
        snapshotDataOnlyInternal(
          descriptors[String(index)].value,
          context,
          depth + 1,
        ),
      );
    }
    context.seen.delete(value);
    return snapshot;
  }
  const snapshot = {};
  for (const key of keys) {
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      value: snapshotDataOnlyInternal(
        descriptors[key].value,
        context,
        depth + 1,
      ),
      writable: true,
    });
  }
  context.seen.delete(value);
  return snapshot;
}

function snapshotDataOnly(value, maxUtf8Bytes = MAX_PAYLOAD_BYTES) {
  return snapshotDataOnlyInternal(
    value,
    {
      maxUtf8Bytes,
      nodeCount: 0,
      seen: new WeakSet(),
      utf8Bytes: 0,
    },
    0,
  );
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
    cursor = join(cursor, component);
    components.push(cursor);
  }
  return components;
}

function statType(stat) {
  return stat.isSymbolicLink()
    ? "symbolic-link"
    : stat.isFile()
      ? "file"
      : stat.isDirectory()
        ? "directory"
        : "other";
}

function identityOf(stat) {
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function canonicalForbiddenRoots() {
  let repositoryRoot;
  let systemTemp;
  try {
    repositoryRoot = resolve(await realpath(REPOSITORY_ROOT));
    systemTemp = resolve(await realpath(resolve(tmpdir())));
  } catch {
    fail("COORDINATOR_KEY_PATH_INVALID", [
      "FORBIDDEN_ROOT_REALPATH_UNAVAILABLE",
    ]);
  }
  return { repositoryRoot, systemTemp };
}

async function inspectCanonicalKeyFile(path, finding, privateKey = false) {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("\0") ||
    !isAbsolute(path) ||
    !sameNativePath(path, resolve(path))
  ) {
    fail("COORDINATOR_KEY_PATH_INVALID", [finding]);
  }
  const resolvedPath = resolve(path);
  const components = pathComponents(resolvedPath);
  for (let index = 0; index < components.length; index += 1) {
    let stat;
    try {
      stat = await lstat(components[index], { bigint: true });
    } catch {
      fail("COORDINATOR_KEY_PATH_INVALID", [finding]);
    }
    const expectedType = index === components.length - 1 ? "file" : "directory";
    if (statType(stat) !== expectedType) {
      fail("COORDINATOR_KEY_PATH_INVALID", [finding]);
    }
  }
  let canonicalPath;
  let fixedPoint;
  let stat;
  try {
    canonicalPath = resolve(await realpath(resolvedPath));
    fixedPoint = resolve(await realpath(canonicalPath));
    stat = await lstat(resolvedPath, { bigint: true });
  } catch {
    fail("COORDINATOR_KEY_PATH_INVALID", [finding]);
  }
  if (
    !sameNativePath(canonicalPath, resolvedPath) ||
    !sameNativePath(fixedPoint, canonicalPath) ||
    statType(stat) !== "file" ||
    stat.nlink !== 1n
  ) {
    fail(
      stat.nlink !== 1n
        ? "COORDINATOR_KEY_FILE_INVALID"
        : "COORDINATOR_KEY_PATH_INVALID",
      [stat.nlink !== 1n ? "COORDINATOR_KEY_HARDLINK_FORBIDDEN" : finding],
    );
  }
  const forbidden = await canonicalForbiddenRoots();
  if (
    sameOrDescendant(canonicalPath, forbidden.systemTemp) ||
    sameOrDescendant(canonicalPath, forbidden.repositoryRoot)
  ) {
    fail("COORDINATOR_KEY_PATH_INVALID", [
      "COORDINATOR_KEY_MUST_NOT_BE_IN_TEMP_OR_REPOSITORY",
    ]);
  }
  if (
    privateKey &&
    platform() !== "win32" &&
    (Number(stat.mode) & 0o077) !== 0
  ) {
    fail("COORDINATOR_KEY_FILE_INVALID", [
      "PRIVATE_KEY_GROUP_OR_OTHER_PERMISSIONS_FORBIDDEN",
    ]);
  }
  return Object.freeze({
    identity: identityOf(stat),
    path: canonicalPath,
    privateKey,
  });
}

async function readExactKeyFile(file, finding) {
  let handle;
  let bytes;
  try {
    handle = await open(file.path, "r");
    const openedStat = await handle.stat({ bigint: true });
    if (
      statType(openedStat) !== "file" ||
      !sameIdentity(identityOf(openedStat), file.identity) ||
      openedStat.nlink !== 1n ||
      openedStat.size < 1n ||
      openedStat.size > BigInt(MAX_KEY_BYTES)
    ) {
      fail("COORDINATOR_KEY_FILE_INVALID", [finding]);
    }
    bytes = await handle.readFile();
  } catch (error) {
    if (
      error instanceof Current180Current190PostgresqlRehearsalCoordinatorError
    ) {
      throw error;
    }
    fail("COORDINATOR_KEY_FILE_INVALID", [finding]);
  } finally {
    await handle?.close().catch(() => undefined);
  }
  const refreshed = await inspectCanonicalKeyFile(
    file.path,
    finding,
    file.privateKey,
  );
  if (!sameIdentity(refreshed.identity, file.identity)) {
    fail("COORDINATOR_KEY_FILE_INVALID", [finding]);
  }
  return Buffer.from(bytes);
}

async function assertProductionSigningAuthorityFresh(state) {
  const [privateFile, publicFile] = await Promise.all([
    inspectCanonicalKeyFile(
      state.privateKeyFile.path,
      "PRIVATE_KEY_PATH_OR_IDENTITY_DRIFT",
      true,
    ),
    inspectCanonicalKeyFile(
      state.publicKeyFile.path,
      "PUBLIC_KEY_PATH_OR_IDENTITY_DRIFT",
    ),
  ]);
  if (
    !sameIdentity(privateFile.identity, state.privateKeyFile.identity) ||
    !sameIdentity(publicFile.identity, state.publicKeyFile.identity)
  ) {
    fail("COORDINATOR_AUTHORITY_STALE", ["KEY_FILE_IDENTITY_DRIFT"]);
  }
  const [privateKeyBytes, publicKeyBytes] = await Promise.all([
    readExactKeyFile(privateFile, "PRIVATE_KEY_CONTENT_DRIFT"),
    readExactKeyFile(publicFile, "PUBLIC_KEY_CONTENT_DRIFT"),
  ]);
  if (
    sha256(privateKeyBytes) !== state.privateKeyBytesSha256 ||
    sha256(publicKeyBytes) !== state.publicKeyBytesSha256
  ) {
    fail("COORDINATOR_AUTHORITY_STALE", ["KEY_FILE_CONTENT_DRIFT"]);
  }
}

async function assertProductionVerificationAuthorityFresh(state) {
  const publicFile = await inspectCanonicalKeyFile(
    state.publicKeyFile.path,
    "PUBLIC_KEY_PATH_OR_IDENTITY_DRIFT",
  );
  if (!sameIdentity(publicFile.identity, state.publicKeyFile.identity)) {
    fail("COORDINATOR_AUTHORITY_STALE", ["PUBLIC_KEY_FILE_IDENTITY_DRIFT"]);
  }
  const publicKeyBytes = await readExactKeyFile(
    publicFile,
    "PUBLIC_KEY_CONTENT_DRIFT",
  );
  if (sha256(publicKeyBytes) !== state.publicKeyBytesSha256) {
    fail("COORDINATOR_AUTHORITY_STALE", ["PUBLIC_KEY_FILE_CONTENT_DRIFT"]);
  }
}

function requireAuthority(authority, expectedKind) {
  if (
    authority === null ||
    typeof authority !== "object" ||
    isProxy(authority) ||
    !authorityStates.has(authority)
  ) {
    fail("COORDINATOR_AUTHORITY_INVALID", [
      "EXACT_MODULE_BRANDED_COORDINATOR_AUTHORITY_REQUIRED",
    ]);
  }
  const state = authorityStates.get(authority);
  if (state.kind !== expectedKind) {
    fail("COORDINATOR_AUTHORITY_INVALID", [
      expectedKind === "PRODUCTION_SIGNING"
        ? "PRODUCTION_FILE_BACKED_SIGNING_AUTHORITY_REQUIRED"
        : expectedKind === "PRODUCTION_VERIFICATION"
          ? "PRODUCTION_PINNED_PUBLIC_VERIFICATION_AUTHORITY_REQUIRED"
          : "TEST_ONLY_MEMORY_AUTHORITY_REQUIRED",
    ]);
  }
  return state;
}

async function assertAuthorityFresh(state) {
  if (state.kind === "PRODUCTION_SIGNING") {
    await assertProductionSigningAuthorityFresh(state);
  } else if (state.kind === "PRODUCTION_VERIFICATION") {
    await assertProductionVerificationAuthorityFresh(state);
  }
}

function signaturePayload(domain, document) {
  return Buffer.from(`${domain}\n${canonicalJson(document)}`, "utf8");
}

function decodeCanonicalBase64(value, expectedLength, finding) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 512 ||
    !BASE64_PATTERN.test(value)
  ) {
    fail("COORDINATOR_SIGNATURE_INVALID", [finding]);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== expectedLength || bytes.toString("base64") !== value) {
    fail("COORDINATOR_SIGNATURE_INVALID", [finding]);
  }
  return bytes;
}

function signedArtifactAuthorityKind(state) {
  return state.kind === "TEST_ONLY"
    ? "TEST_ONLY_MEMORY"
    : "PRODUCTION_FILE_BACKED";
}

function publicAuthority(state, privateKeyPath = null, publicKeyPath = null) {
  if (state.kind === "PRODUCTION_VERIFICATION") {
    return deepFreeze({
      authority: NO_AUTHORITY,
      authorityKind: "PRODUCTION_PINNED_PUBLIC_KEY_VERIFICATION",
      contract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_VERIFICATION_AUTHORITY_CONTRACT,
      publicKeyFingerprintSha256: state.fingerprint,
      publicKeyPath,
      status:
        "LOADED_PINNED_PUBLIC_COORDINATOR_VERIFICATION_ROOT_NOT_SIGNING_OR_EXECUTION_AUTHORITY",
    });
  }
  return deepFreeze({
    authority: NO_AUTHORITY,
    authorityKind:
      state.kind === "PRODUCTION_SIGNING"
        ? "PRODUCTION_FILE_BACKED_SIGNING"
        : "TEST_ONLY_MEMORY",
    contract:
      state.kind === "PRODUCTION_SIGNING"
        ? CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_AUTHORITY_CONTRACT
        : CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_TEST_AUTHORITY_CONTRACT,
    privateKeyPath,
    publicKeyFingerprintSha256: state.fingerprint,
    publicKeyPath,
    status:
      state.kind === "PRODUCTION_SIGNING"
        ? "LOADED_FILE_BACKED_COORDINATOR_SIGNING_ROOT_NOT_EXECUTION_AUTHORITY"
        : "TEST_ONLY_MEMORY_COORDINATOR_NOT_PRODUCTION_AUTHORITY",
  });
}

export async function loadCurrent180Current190PostgresqlRehearsalCoordinatorAuthority(
  input,
) {
  if (
    arguments.length !== 1 ||
    !exactKeys(input, [
      "expectedPublicKeySha256",
      "privateKeyPath",
      "publicKeyPath",
    ])
  ) {
    fail("COORDINATOR_LOAD_INPUT_INVALID", [
      "EXACT_DATA_ONLY_KEY_PATHS_AND_FINGERPRINT_REQUIRED",
    ]);
  }
  const descriptors = ownDataDescriptors(input);
  const expectedPublicKeySha256 = descriptors.expectedPublicKeySha256.value;
  const privateKeyPath = descriptors.privateKeyPath.value;
  const publicKeyPath = descriptors.publicKeyPath.value;
  if (
    typeof expectedPublicKeySha256 !== "string" ||
    !SHA256_PATTERN.test(expectedPublicKeySha256) ||
    typeof privateKeyPath !== "string" ||
    typeof publicKeyPath !== "string" ||
    sameNativePath(privateKeyPath, publicKeyPath)
  ) {
    fail("COORDINATOR_LOAD_INPUT_INVALID", [
      "DISTINCT_EXACT_PATHS_AND_SHA256_REQUIRED",
    ]);
  }
  const [privateKeyFile, publicKeyFile] = await Promise.all([
    inspectCanonicalKeyFile(privateKeyPath, "PRIVATE_KEY_PATH_INVALID", true),
    inspectCanonicalKeyFile(publicKeyPath, "PUBLIC_KEY_PATH_INVALID"),
  ]);
  if (sameIdentity(privateKeyFile.identity, publicKeyFile.identity)) {
    fail("COORDINATOR_KEY_FILE_INVALID", [
      "DISTINCT_PRIVATE_AND_PUBLIC_KEY_FILES_REQUIRED",
    ]);
  }
  const [privateKeyBytes, publicKeyBytes] = await Promise.all([
    readExactKeyFile(privateKeyFile, "PRIVATE_KEY_FILE_INVALID"),
    readExactKeyFile(publicKeyFile, "PUBLIC_KEY_FILE_INVALID"),
  ]);
  let privateKey;
  let publicKey;
  try {
    privateKey = createPrivateKey({
      format: "der",
      key: privateKeyBytes,
      type: "pkcs8",
    });
    publicKey = createPublicKey({
      format: "der",
      key: publicKeyBytes,
      type: "spki",
    });
  } catch {
    fail("COORDINATOR_KEY_FILE_INVALID", [
      "CANONICAL_ED25519_PKCS8_AND_SPKI_REQUIRED",
    ]);
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
  const fingerprint = sha256(canonicalPublic);
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    publicKey.asymmetricKeyType !== "ed25519" ||
    !canonicalPrivate.equals(privateKeyBytes) ||
    !canonicalPublic.equals(publicKeyBytes) ||
    !derivedPublic.equals(canonicalPublic) ||
    fingerprint !== expectedPublicKeySha256
  ) {
    fail("COORDINATOR_KEY_FILE_INVALID", ["ED25519_KEY_PAIR_OR_PIN_MISMATCH"]);
  }
  const state = {
    fingerprint,
    kind: "PRODUCTION_SIGNING",
    privateKey,
    privateKeyBytesSha256: sha256(privateKeyBytes),
    privateKeyFile,
    publicKey,
    publicKeyBytesSha256: sha256(publicKeyBytes),
    publicKeyFile,
  };
  await assertProductionSigningAuthorityFresh(state);
  const authority = publicAuthority(
    state,
    privateKeyFile.path,
    publicKeyFile.path,
  );
  authorityStates.set(authority, state);
  return authority;
}

export async function loadCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
  input,
) {
  if (
    arguments.length !== 1 ||
    !exactKeys(input, ["expectedPublicKeySha256", "publicKeyPath"])
  ) {
    fail("COORDINATOR_VERIFICATION_LOAD_INPUT_INVALID", [
      "EXACT_PUBLIC_KEY_PATH_AND_FINGERPRINT_REQUIRED",
    ]);
  }
  const descriptors = ownDataDescriptors(input);
  const expectedPublicKeySha256 = descriptors.expectedPublicKeySha256.value;
  const publicKeyPath = descriptors.publicKeyPath.value;
  if (
    typeof expectedPublicKeySha256 !== "string" ||
    !SHA256_PATTERN.test(expectedPublicKeySha256) ||
    typeof publicKeyPath !== "string"
  ) {
    fail("COORDINATOR_VERIFICATION_LOAD_INPUT_INVALID", [
      "EXACT_PUBLIC_KEY_PATH_AND_SHA256_REQUIRED",
    ]);
  }
  const publicKeyFile = await inspectCanonicalKeyFile(
    publicKeyPath,
    "PUBLIC_KEY_PATH_INVALID",
  );
  const publicKeyBytes = await readExactKeyFile(
    publicKeyFile,
    "PUBLIC_KEY_FILE_INVALID",
  );
  let publicKey;
  try {
    publicKey = createPublicKey({
      format: "der",
      key: publicKeyBytes,
      type: "spki",
    });
  } catch {
    fail("COORDINATOR_KEY_FILE_INVALID", ["CANONICAL_ED25519_SPKI_REQUIRED"]);
  }
  const canonicalPublic = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  const fingerprint = sha256(canonicalPublic);
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !canonicalPublic.equals(publicKeyBytes) ||
    fingerprint !== expectedPublicKeySha256
  ) {
    fail("COORDINATOR_KEY_FILE_INVALID", [
      "ED25519_PUBLIC_KEY_OR_PIN_MISMATCH",
    ]);
  }
  const state = {
    fingerprint,
    kind: "PRODUCTION_VERIFICATION",
    publicKey,
    publicKeyBytesSha256: sha256(publicKeyBytes),
    publicKeyFile,
  };
  await assertProductionVerificationAuthorityFresh(state);
  const authority = publicAuthority(state, null, publicKeyFile.path);
  authorityStates.set(authority, state);
  return authority;
}

export function createCurrent180Current190PostgresqlRehearsalCoordinatorAuthorityForTestOnly() {
  if (arguments.length !== 0) {
    fail("COORDINATOR_TEST_AUTHORITY_INPUT_INVALID", ["NO_ARGUMENTS_ALLOWED"]);
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyBytes = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  const state = {
    fingerprint: sha256(publicKeyBytes),
    kind: "TEST_ONLY",
    privateKey,
    publicKey,
  };
  const authority = publicAuthority(state);
  authorityStates.set(authority, state);
  return authority;
}

export async function assertCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
  authority,
) {
  if (arguments.length !== 1) {
    fail("COORDINATOR_VERIFICATION_AUTHORITY_INVALID", [
      "EXACT_PUBLIC_VERIFICATION_AUTHORITY_REQUIRED",
    ]);
  }
  const state = requireAuthority(authority, "PRODUCTION_VERIFICATION");
  await assertAuthorityFresh(state);
  return authority;
}

export async function assertCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthorityForTestOnly(
  authority,
) {
  if (arguments.length !== 1) {
    fail("COORDINATOR_VERIFICATION_AUTHORITY_INVALID", [
      "EXACT_TEST_VERIFICATION_AUTHORITY_REQUIRED",
    ]);
  }
  requireAuthority(authority, "TEST_ONLY");
  return authority;
}

async function issueRunBindingInternal(authority, input, expectedKind) {
  if (
    arguments.length !== 3 ||
    !exactKeys(input, ["authorizationReceiptDigest", "runToken"])
  ) {
    fail("COORDINATOR_RUN_BINDING_INPUT_INVALID", [
      "EXACT_AUTHORIZATION_DIGEST_AND_RUN_TOKEN_REQUIRED",
    ]);
  }
  const state = requireAuthority(authority, expectedKind);
  await assertAuthorityFresh(state);
  const descriptors = ownDataDescriptors(input);
  const authorizationReceiptDigest =
    descriptors.authorizationReceiptDigest.value;
  const runToken = descriptors.runToken.value;
  if (
    typeof authorizationReceiptDigest !== "string" ||
    !SHA256_PATTERN.test(authorizationReceiptDigest) ||
    typeof runToken !== "string" ||
    !RUN_TOKEN_PATTERN.test(runToken)
  ) {
    fail("COORDINATOR_RUN_BINDING_INPUT_INVALID", [
      "LOWERCASE_SHA256_AND_RUN_TOKEN_REQUIRED",
    ]);
  }
  const document = {
    authority: NO_AUTHORITY,
    authorityKind: signedArtifactAuthorityKind(state),
    authorizationReceiptDigest,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_RUN_BINDING_CONTRACT,
    coordinatorFingerprintSha256: state.fingerprint,
    runToken,
    status: "COORDINATOR_SIGNED_RUN_BINDING_NOT_EXECUTION_AUTHORITY",
  };
  const signatureBase64 = sign(
    null,
    signaturePayload(DOMAIN_RUN_BINDING_SIGNATURE, document),
    state.privateKey,
  ).toString("base64");
  const signed = { ...document, signatureBase64 };
  const binding = deepFreeze({
    ...signed,
    runBindingDigest: sha256(
      Buffer.from(
        `${DOMAIN_RUN_BINDING_DIGEST}\n${canonicalJson(signed)}`,
        "utf8",
      ),
    ),
  });
  runBindingStates.set(binding, { authorityState: state });
  return binding;
}

export async function issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
  authority,
  input,
) {
  if (arguments.length !== 2) {
    fail("COORDINATOR_RUN_BINDING_INPUT_INVALID", [
      "EXACT_AUTHORITY_AND_RUN_INPUT_REQUIRED",
    ]);
  }
  return issueRunBindingInternal(authority, input, "PRODUCTION_SIGNING");
}

export async function issueCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
  authority,
  input,
) {
  if (arguments.length !== 2) {
    fail("COORDINATOR_RUN_BINDING_INPUT_INVALID", [
      "EXACT_TEST_AUTHORITY_AND_RUN_INPUT_REQUIRED",
    ]);
  }
  return issueRunBindingInternal(authority, input, "TEST_ONLY");
}

async function requireRunBinding(authority, binding, expectedKind) {
  const authorityState = requireAuthority(authority, expectedKind);
  await assertAuthorityFresh(authorityState);
  if (
    binding === null ||
    typeof binding !== "object" ||
    isProxy(binding) ||
    !runBindingStates.has(binding)
  ) {
    fail("COORDINATOR_RUN_BINDING_INVALID", [
      "EXACT_MODULE_BRANDED_RUN_BINDING_REQUIRED",
    ]);
  }
  const bindingState = runBindingStates.get(binding);
  if (bindingState.authorityState !== authorityState) {
    fail("COORDINATOR_RUN_BINDING_INVALID", ["RUN_BINDING_AUTHORITY_MISMATCH"]);
  }
  return { authorityState, binding };
}

export async function assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
  authority,
  binding,
) {
  if (arguments.length !== 2) {
    fail("COORDINATOR_RUN_BINDING_INVALID", [
      "EXACT_AUTHORITY_AND_BINDING_REQUIRED",
    ]);
  }
  await requireRunBinding(authority, binding, "PRODUCTION_SIGNING");
  return binding;
}

export async function assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
  authority,
  binding,
) {
  if (arguments.length !== 2) {
    fail("COORDINATOR_RUN_BINDING_INVALID", [
      "EXACT_TEST_AUTHORITY_AND_BINDING_REQUIRED",
    ]);
  }
  await requireRunBinding(authority, binding, "TEST_ONLY");
  return binding;
}

function anchorDocument(state, binding, purpose, payload) {
  return {
    authority: NO_AUTHORITY,
    authorityKind: signedArtifactAuthorityKind(state),
    authorizationReceiptDigest: binding.authorizationReceiptDigest,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_CONTRACT,
    coordinatorFingerprintSha256: state.fingerprint,
    payload,
    purpose,
    runBindingDigest: binding.runBindingDigest,
    runToken: binding.runToken,
    status: "COORDINATOR_SIGNED_DURABLE_ANCHOR_NOT_EXECUTION_AUTHORITY",
  };
}

async function signAnchorInternal(authority, binding, input, expectedKind) {
  if (arguments.length !== 4 || !exactKeys(input, ["payload", "purpose"])) {
    fail("COORDINATOR_ANCHOR_INPUT_INVALID", [
      "EXACT_PURPOSE_AND_PAYLOAD_REQUIRED",
    ]);
  }
  const { authorityState } = await requireRunBinding(
    authority,
    binding,
    expectedKind,
  );
  const descriptors = ownDataDescriptors(input);
  const purpose = descriptors.purpose.value;
  if (
    typeof purpose !== "string" ||
    !CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_PURPOSES.includes(
      purpose,
    )
  ) {
    fail("COORDINATOR_ANCHOR_INPUT_INVALID", ["ANCHOR_PURPOSE_INVALID"]);
  }
  const payload = snapshotDataOnly(descriptors.payload.value);
  if (Buffer.byteLength(canonicalJson(payload), "utf8") > MAX_PAYLOAD_BYTES) {
    fail("COORDINATOR_ANCHOR_INPUT_INVALID", ["ANCHOR_PAYLOAD_TOO_LARGE"]);
  }
  const document = anchorDocument(authorityState, binding, purpose, payload);
  const signatureBase64 = sign(
    null,
    signaturePayload(DOMAIN_ANCHOR_SIGNATURE, document),
    authorityState.privateKey,
  ).toString("base64");
  const signed = { ...document, signatureBase64 };
  return deepFreeze({
    ...signed,
    anchorDigest: sha256(
      Buffer.from(`${DOMAIN_ANCHOR_DIGEST}\n${canonicalJson(signed)}`, "utf8"),
    ),
  });
}

export async function signCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
  authority,
  binding,
  input,
) {
  if (arguments.length !== 3) {
    fail("COORDINATOR_ANCHOR_INPUT_INVALID", [
      "EXACT_AUTHORITY_BINDING_AND_ANCHOR_INPUT_REQUIRED",
    ]);
  }
  return signAnchorInternal(authority, binding, input, "PRODUCTION_SIGNING");
}

export async function signCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
  authority,
  binding,
  input,
) {
  if (arguments.length !== 3) {
    fail("COORDINATOR_ANCHOR_INPUT_INVALID", [
      "EXACT_TEST_AUTHORITY_BINDING_AND_ANCHOR_INPUT_REQUIRED",
    ]);
  }
  return signAnchorInternal(authority, binding, input, "TEST_ONLY");
}

function snapshotAnchor(value) {
  const anchor = snapshotDataOnly(value);
  if (
    !exactKeys(anchor, [
      "anchorDigest",
      "authority",
      "authorityKind",
      "authorizationReceiptDigest",
      "contract",
      "coordinatorFingerprintSha256",
      "payload",
      "purpose",
      "runBindingDigest",
      "runToken",
      "signatureBase64",
      "status",
    ]) ||
    anchor.contract !==
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_CONTRACT ||
    !CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_PURPOSES.includes(
      anchor.purpose,
    ) ||
    !SHA256_PATTERN.test(String(anchor.authorizationReceiptDigest ?? "")) ||
    !SHA256_PATTERN.test(String(anchor.coordinatorFingerprintSha256 ?? "")) ||
    !SHA256_PATTERN.test(String(anchor.runBindingDigest ?? "")) ||
    !SHA256_PATTERN.test(String(anchor.anchorDigest ?? "")) ||
    !RUN_TOKEN_PATTERN.test(String(anchor.runToken ?? "")) ||
    anchor.status !==
      "COORDINATOR_SIGNED_DURABLE_ANCHOR_NOT_EXECUTION_AUTHORITY"
  ) {
    fail("COORDINATOR_ANCHOR_INVALID", ["EXACT_SIGNED_ANCHOR_REQUIRED"]);
  }
  return anchor;
}

async function verifyAnchorInternal(authority, value, input, expectedKind) {
  if (
    arguments.length !== 4 ||
    !exactKeys(input, ["purpose"]) ||
    typeof ownDataDescriptors(input).purpose.value !== "string"
  ) {
    fail("COORDINATOR_ANCHOR_VERIFY_INPUT_INVALID", [
      "EXACT_EXPECTED_PURPOSE_REQUIRED",
    ]);
  }
  const state = requireAuthority(authority, expectedKind);
  await assertAuthorityFresh(state);
  const anchor = snapshotAnchor(value);
  const expectedPurpose = ownDataDescriptors(input).purpose.value;
  const { anchorDigest, signatureBase64, ...document } = anchor;
  const signed = { ...document, signatureBase64 };
  const signature = decodeCanonicalBase64(
    signatureBase64,
    64,
    "CANONICAL_ED25519_SIGNATURE_REQUIRED",
  );
  const expectedAuthorityKind = signedArtifactAuthorityKind(state);
  if (
    anchor.purpose !== expectedPurpose ||
    anchor.authorityKind !== expectedAuthorityKind ||
    anchor.coordinatorFingerprintSha256 !== state.fingerprint ||
    anchorDigest !==
      sha256(
        Buffer.from(
          `${DOMAIN_ANCHOR_DIGEST}\n${canonicalJson(signed)}`,
          "utf8",
        ),
      ) ||
    !verify(
      null,
      signaturePayload(DOMAIN_ANCHOR_SIGNATURE, document),
      state.publicKey,
      signature,
    )
  ) {
    fail("COORDINATOR_ANCHOR_INVALID", [
      "ANCHOR_TRUST_ROOT_OR_SIGNATURE_MISMATCH",
    ]);
  }
  return deepFreeze({
    anchor,
    authority: NO_AUTHORITY,
    authorizationReceiptDigest: anchor.authorizationReceiptDigest,
    contract:
      "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_COORDINATOR_ANCHOR_VERIFICATION_V1",
    coordinatorFingerprintSha256: state.fingerprint,
    payload: anchor.payload,
    purpose: anchor.purpose,
    runToken: anchor.runToken,
    status: "COORDINATOR_ANCHOR_SIGNATURE_VERIFIED_NOT_EXECUTION_AUTHORITY",
  });
}

export async function verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
  authority,
  anchor,
  input,
) {
  if (arguments.length !== 3) {
    fail("COORDINATOR_ANCHOR_VERIFY_INPUT_INVALID", [
      "EXACT_AUTHORITY_ANCHOR_AND_PURPOSE_REQUIRED",
    ]);
  }
  return verifyAnchorInternal(
    authority,
    anchor,
    input,
    "PRODUCTION_VERIFICATION",
  );
}

export async function verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
  authority,
  anchor,
  input,
) {
  if (arguments.length !== 3) {
    fail("COORDINATOR_ANCHOR_VERIFY_INPUT_INVALID", [
      "EXACT_TEST_AUTHORITY_ANCHOR_AND_PURPOSE_REQUIRED",
    ]);
  }
  return verifyAnchorInternal(authority, anchor, input, "TEST_ONLY");
}

import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  lstat,
  mkdtemp,
  open,
  readdir,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import {
  basename,
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

import {
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES,
  CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS,
} from "./current180-current190-disposable-postgresql-rehearsal-contract.mjs";
import {
  assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding,
  assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly,
  assertCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority,
  assertCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthorityForTestOnly,
  signCurrent180Current190PostgresqlRehearsalCoordinatorAnchor,
  signCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly,
  verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor,
  verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly,
} from "./current180-current190-disposable-postgresql-rehearsal-coordinator.mjs";

export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_SIGNER_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_SIGNER_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECORD_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_RECORD_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_VERIFICATION_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_VERIFICATION_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_MANUAL_INSPECTION_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_MANUAL_INSPECTION_V1";
export const CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECOVERY_RECEIPT_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_RECOVERY_RECEIPT_V1";

const JOURNAL_FILE_NAME = "lifecycle.ndjson";
const ROOT_PREFIX = "lp-c180190-journal-";
const COORDINATOR_ANCHOR_PURPOSE = "JOURNAL_ROOT_ANCHOR";
const COORDINATOR_ANCHOR_PAYLOAD_CONTRACT =
  "CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_COORDINATOR_ANCHOR_PAYLOAD_V1";
const DOMAIN_SIGNATURE =
  "LEETPLUS_CURRENT180_CURRENT190_REHEARSAL_JOURNAL_ED25519_SIGNATURE_V1";
const DOMAIN_RECORD_DIGEST =
  "LEETPLUS_CURRENT180_CURRENT190_REHEARSAL_JOURNAL_RECORD_DIGEST_V1";
const DOMAIN_LOCATOR_DIGEST =
  "LEETPLUS_CURRENT180_CURRENT190_REHEARSAL_JOURNAL_LOCATOR_DIGEST_V1";
const DOMAIN_MANUAL_INSPECTION_DIGEST =
  "LEETPLUS_CURRENT180_CURRENT190_REHEARSAL_JOURNAL_MANUAL_INSPECTION_V1";
const HEADER_EVENT = "JOURNAL_BOUND";
const INITIAL_PHASE = "INITIAL";
const ZERO_DIGEST = "0".repeat(64);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RUN_TOKEN_PATTERN = /^[0-9a-f]{32}$/u;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ROOT_SUFFIX_PATTERN = /^[A-Za-z0-9]{6}$/u;
const ROOT_DISCOVERY_PATTERN =
  /^lp-c180190-journal-([0-9a-f]{32})-[A-Za-z0-9]{6}$/u;
const MAX_LIFECYCLE_RECORDS = 64;
const MAX_RECORD_BYTES = 4_096;
const MAX_FILE_BYTES = (MAX_LIFECYCLE_RECORDS + 1) * MAX_RECORD_BYTES;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");

const signerStates = new WeakMap();
const journalStates = new WeakMap();
const verificationReceiptStates = new WeakMap();
const latestVerificationReceipts = new Map();
const manualInspectionStates = new WeakMap();
const recoveryReceiptStates = new WeakMap();
let verificationGeneration = 0;

const NO_AUTHORITY = deepFreeze({
  canApplyDatabase: false,
  canCallExternalProviders: false,
  canConnectDatabase: false,
  canDeploy: false,
  canMutateProduction: false,
  canProvisionRolesOrGrants: false,
  canRecoverRehearsal: false,
  canSpawnProcess: false,
  executionAuthority: false,
  productionApplyAuthorized: false,
});

const LIMITATIONS = deepFreeze({
  crashVerificationDoesNotRestoreAppendAuthority: true,
  hostileLocalActorToctouEliminated: false,
  journalReceiptAuthorizesDatabaseEffects: false,
  journalReceiptAuthorizesDeployment: false,
  journalReceiptAuthorizesProcessSpawn: false,
  privateKeyIsMemoryOnly: true,
});

export class Current180Current190PostgresqlRehearsalJournalError extends Error {
  constructor(code, findings = [], manualInspectionReceipt = null) {
    super("CURRENT180-CURRENT190 PostgreSQL rehearsal journal failed closed.");
    this.name = "Current180Current190PostgresqlRehearsalJournalError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
    this.manualInspectionReceipt = manualInspectionReceipt;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code, findings, manualInspectionReceipt = null) {
  throw new Current180Current190PostgresqlRehearsalJournalError(
    code,
    findings,
    manualInspectionReceipt,
  );
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

function snapshotFlatData(value, expectedKeys, errorCode, finding) {
  const descriptors = ownDataDescriptors(value);
  if (
    descriptors === null ||
    canonicalJson(Object.keys(descriptors).sort(compareText)) !==
      canonicalJson([...expectedKeys].sort(compareText))
  ) {
    fail(errorCode, [finding]);
  }
  const result = {};
  for (const key of expectedKeys) {
    const entry = descriptors[key].value;
    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      fail(errorCode, [finding]);
    }
    result[key] = entry;
  }
  return result;
}

function snapshotDataOnly(value, seen = new WeakSet(), depth = 0) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    ]);
  }
  if (
    depth > 64 ||
    typeof value !== "object" ||
    isProxy(value) ||
    seen.has(value)
  ) {
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    ]);
  }
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    ]);
  }
  if (Array.isArray(value)) {
    const length = descriptors.length?.value;
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      keys.length !== length + 1
    ) {
      fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
        "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
      ]);
    }
    const snapshot = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined) {
        fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
          "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
        ]);
      }
      snapshot.push(snapshotDataOnly(descriptor.value, seen, depth + 1));
    }
    seen.delete(value);
    return snapshot;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    ]);
  }
  const snapshot = {};
  for (const key of keys) {
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      value: snapshotDataOnly(descriptors[key].value, seen, depth + 1),
      writable: true,
    });
  }
  seen.delete(value);
  return snapshot;
}

function identityOf(stat) {
  return Object.freeze({ dev: String(stat.dev), ino: String(stat.ino) });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function removalIdentityOf(stat) {
  return Object.freeze({
    birthtimeNs: String(stat.birthtimeNs),
    ctimeNs: String(stat.ctimeNs),
    dev: String(stat.dev),
    ino: String(stat.ino),
    mtimeNs: String(stat.mtimeNs),
  });
}

function sameRemovalIdentity(left, right) {
  return (
    left.birthtimeNs === right.birthtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mtimeNs === right.mtimeNs
  );
}

async function assertCoordinatorRunBinding(
  coordinatorAuthority,
  coordinatorRunBinding,
  testOnly,
) {
  return testOnly
    ? assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBindingForTestOnly(
        coordinatorAuthority,
        coordinatorRunBinding,
      )
    : assertCurrent180Current190PostgresqlRehearsalCoordinatorRunBinding(
        coordinatorAuthority,
        coordinatorRunBinding,
      );
}

async function assertCoordinatorVerificationAuthority(
  coordinatorAuthority,
  testOnly,
) {
  return testOnly
    ? assertCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthorityForTestOnly(
        coordinatorAuthority,
      )
    : assertCurrent180Current190PostgresqlRehearsalCoordinatorVerificationAuthority(
        coordinatorAuthority,
      );
}

async function signCoordinatorAnchor(
  coordinatorAuthority,
  coordinatorRunBinding,
  payload,
  testOnly,
) {
  const input = { payload, purpose: COORDINATOR_ANCHOR_PURPOSE };
  return testOnly
    ? signCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
        coordinatorAuthority,
        coordinatorRunBinding,
        input,
      )
    : signCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        coordinatorAuthority,
        coordinatorRunBinding,
        input,
      );
}

async function verifyCoordinatorAnchor(coordinatorAuthority, anchor, testOnly) {
  const input = { purpose: COORDINATOR_ANCHOR_PURPOSE };
  return testOnly
    ? verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
        coordinatorAuthority,
        anchor,
        input,
      )
    : verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        coordinatorAuthority,
        anchor,
        input,
      );
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

function sameNativePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform() === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isStrictDescendant(candidate, parent) {
  const candidateRelativeToParent = relative(parent, candidate);
  return (
    candidateRelativeToParent.length > 0 &&
    candidateRelativeToParent !== ".." &&
    !candidateRelativeToParent.startsWith(`..${sep}`) &&
    !isAbsolute(candidateRelativeToParent)
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

async function assertNoLinkDirectoryComponents(absolutePath, finding) {
  for (const component of pathComponents(absolutePath)) {
    let stat;
    try {
      stat = await lstat(component, { bigint: true });
    } catch {
      fail("REHEARSAL_JOURNAL_TEMP_PROVENANCE_INVALID", [finding]);
    }
    // lstat observes the component itself, so Windows junctions and ordinary
    // symlinks are rejected instead of followed.  Do not realpath every
    // component: Windows may return EPERM for an otherwise valid user-profile
    // component when os.tmpdir() uses its 8.3 alias (for example ALIENW~1).
    if (statType(stat) !== "directory") {
      fail("REHEARSAL_JOURNAL_TEMP_PROVENANCE_INVALID", [finding]);
    }
  }
}

async function captureSystemTemp() {
  const lexicalRoot = resolve(tmpdir());
  if (!isAbsolute(lexicalRoot)) {
    fail("REHEARSAL_JOURNAL_TEMP_PROVENANCE_INVALID", [
      "SYSTEM_TEMP_PATH_NOT_ABSOLUTE",
    ]);
  }
  await assertNoLinkDirectoryComponents(
    lexicalRoot,
    "SYSTEM_TEMP_LINK_OR_TYPE_INVALID",
  );
  const stat = await lstat(lexicalRoot, { bigint: true });
  const actualRealRoot = await realpath(lexicalRoot);
  const realRoot = resolve(actualRealRoot);
  await assertNoLinkDirectoryComponents(
    realRoot,
    "SYSTEM_TEMP_REALPATH_LINK_OR_TYPE_INVALID",
  );
  const realRootStat = await lstat(realRoot, { bigint: true });
  if (
    statType(stat) !== "directory" ||
    statType(realRootStat) !== "directory" ||
    !sameIdentity(identityOf(stat), identityOf(realRootStat)) ||
    !isAbsolute(realRoot) ||
    sameNativePath(realRoot, REPOSITORY_ROOT) ||
    isStrictDescendant(realRoot, REPOSITORY_ROOT)
  ) {
    fail("REHEARSAL_JOURNAL_TEMP_PROVENANCE_INVALID", [
      "SYSTEM_TEMP_REALPATH_INVALID",
    ]);
  }
  return Object.freeze({
    identity: identityOf(stat),
    lexicalRoot,
    realRoot,
  });
}

async function assertDirectory(
  path,
  expectedRealPath,
  expectedIdentity,
  finding,
) {
  let stat;
  let actualRealPath;
  try {
    stat = await lstat(path, { bigint: true });
    actualRealPath = await realpath(path);
  } catch {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [finding]);
  }
  const identity = identityOf(stat);
  if (
    statType(stat) !== "directory" ||
    !sameNativePath(actualRealPath, expectedRealPath) ||
    (expectedIdentity !== null && !sameIdentity(identity, expectedIdentity))
  ) {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [finding]);
  }
  return identity;
}

async function assertFile(path, expectedRealPath, expectedIdentity, finding) {
  let stat;
  let actualRealPath;
  try {
    stat = await lstat(path, { bigint: true });
    actualRealPath = await realpath(path);
  } catch {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [finding]);
  }
  const identity = identityOf(stat);
  if (
    statType(stat) !== "file" ||
    !sameNativePath(actualRealPath, expectedRealPath) ||
    !sameIdentity(identity, expectedIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [finding]);
  }
  return identity;
}

function isUnsupportedDirectorySync(error) {
  return [
    "EACCES",
    "EBADF",
    "EISDIR",
    "EINVAL",
    "ENOSYS",
    "ENOTSUP",
    "EPERM",
  ].includes(error?.code);
}

async function syncDirectoryBestEffort(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
    return true;
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) throw error;
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function canonicalBase64(bytes) {
  return bytes.toString("base64");
}

function decodeCanonicalBase64(value, expectedLength, finding) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !BASE64_PATTERN.test(value)
  ) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", [finding]);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== expectedLength || canonicalBase64(bytes) !== value) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", [finding]);
  }
  return bytes;
}

function signaturePayload(unsignedRecord) {
  return Buffer.from(
    `${DOMAIN_SIGNATURE}\n${canonicalJson(unsignedRecord)}`,
    "utf8",
  );
}

function recordDigest(signedRecord) {
  return sha256(
    Buffer.from(
      `${DOMAIN_RECORD_DIGEST}\n${canonicalJson(signedRecord)}`,
      "utf8",
    ),
  );
}

function signRecord(unsignedRecord, privateKey) {
  const signatureBase64 = canonicalBase64(
    sign(null, signaturePayload(unsignedRecord), privateKey),
  );
  const signedRecord = { ...unsignedRecord, signatureBase64 };
  return deepFreeze({
    ...signedRecord,
    recordDigest: recordDigest(signedRecord),
  });
}

function recordBytes(record) {
  const bytes = Buffer.from(`${canonicalJson(record)}\n`, "utf8");
  if (bytes.length > MAX_RECORD_BYTES) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", ["RECORD_BYTE_LIMIT_EXCEEDED"]);
  }
  return bytes;
}

function buildHeaderRecord({
  authorizationReceiptDigest,
  coordinatorAnchor,
  privateKey,
  publicKeySpkiDerBase64,
  runToken,
  signerFingerprintSha256,
}) {
  return signRecord(
    {
      authorizationReceiptDigest,
      coordinatorAnchor,
      contract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECORD_CONTRACT,
      event: HEADER_EVENT,
      previousRecordDigest: ZERO_DIGEST,
      publicKeySpkiDerBase64,
      recordType: "HEADER",
      runToken,
      sequence: 0,
      signerFingerprintSha256,
      toPhase: INITIAL_PHASE,
    },
    privateKey,
  );
}

function validateLifecycleInput(input, expectedFromPhase) {
  const value = snapshotFlatData(
    input,
    ["event", "evidenceDigest", "fromPhase", "stateDigest", "toPhase"],
    "REHEARSAL_JOURNAL_APPEND_INPUT_INVALID",
    "EXACT_DATA_ONLY_LIFECYCLE_INPUT_REQUIRED",
  );
  const transition =
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS[value.event];
  if (
    transition === undefined ||
    !CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.includes(
      value.fromPhase,
    ) ||
    !CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.includes(
      value.toPhase,
    ) ||
    !transition.from.includes(value.fromPhase) ||
    transition.to !== value.toPhase ||
    value.fromPhase !== expectedFromPhase ||
    !SHA256_PATTERN.test(String(value.evidenceDigest ?? "")) ||
    !SHA256_PATTERN.test(String(value.stateDigest ?? ""))
  ) {
    fail("REHEARSAL_JOURNAL_APPEND_INPUT_INVALID", [
      "LIFECYCLE_TRANSITION_OR_DIGEST_INVALID",
    ]);
  }
  return value;
}

function buildLifecycleRecord(state, input) {
  return signRecord(
    {
      authorizationReceiptDigest: state.authorizationReceiptDigest,
      contract:
        CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECORD_CONTRACT,
      event: input.event,
      evidenceDigest: input.evidenceDigest,
      fromPhase: input.fromPhase,
      previousRecordDigest: state.lastRecordDigest,
      recordType: "LIFECYCLE",
      runToken: state.runToken,
      sequence: state.lastSequence + 1,
      signerFingerprintSha256: state.signerFingerprintSha256,
      stateDigest: input.stateDigest,
      toPhase: input.toPhase,
    },
    state.privateKey,
  );
}

function validateHeaderShape(record) {
  return (
    exactKeys(record, [
      "authorizationReceiptDigest",
      "coordinatorAnchor",
      "contract",
      "event",
      "previousRecordDigest",
      "publicKeySpkiDerBase64",
      "recordDigest",
      "recordType",
      "runToken",
      "sequence",
      "signatureBase64",
      "signerFingerprintSha256",
      "toPhase",
    ]) &&
    record.contract ===
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECORD_CONTRACT &&
    record.recordType === "HEADER" &&
    record.event === HEADER_EVENT &&
    record.previousRecordDigest === ZERO_DIGEST &&
    record.sequence === 0 &&
    record.toPhase === INITIAL_PHASE &&
    SHA256_PATTERN.test(String(record.authorizationReceiptDigest ?? "")) &&
    SHA256_PATTERN.test(String(record.signerFingerprintSha256 ?? "")) &&
    RUN_TOKEN_PATTERN.test(String(record.runToken ?? "")) &&
    SHA256_PATTERN.test(String(record.recordDigest ?? ""))
  );
}

function validateLifecycleShape(record) {
  return (
    exactKeys(record, [
      "authorizationReceiptDigest",
      "contract",
      "event",
      "evidenceDigest",
      "fromPhase",
      "previousRecordDigest",
      "recordDigest",
      "recordType",
      "runToken",
      "sequence",
      "signatureBase64",
      "signerFingerprintSha256",
      "stateDigest",
      "toPhase",
    ]) &&
    record.contract ===
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECORD_CONTRACT &&
    record.recordType === "LIFECYCLE" &&
    typeof record.event === "string" &&
    Object.hasOwn(
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS,
      record.event,
    ) &&
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.includes(
      record.fromPhase,
    ) &&
    CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_PHASES.includes(
      record.toPhase,
    ) &&
    SHA256_PATTERN.test(String(record.authorizationReceiptDigest ?? "")) &&
    SHA256_PATTERN.test(String(record.evidenceDigest ?? "")) &&
    SHA256_PATTERN.test(String(record.previousRecordDigest ?? "")) &&
    SHA256_PATTERN.test(String(record.recordDigest ?? "")) &&
    RUN_TOKEN_PATTERN.test(String(record.runToken ?? "")) &&
    Number.isSafeInteger(record.sequence) &&
    record.sequence >= 1 &&
    record.sequence <= MAX_LIFECYCLE_RECORDS &&
    SHA256_PATTERN.test(String(record.signerFingerprintSha256 ?? "")) &&
    SHA256_PATTERN.test(String(record.stateDigest ?? ""))
  );
}

function parseCanonicalRecords(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length === 0 ||
    bytes.length > MAX_FILE_BYTES ||
    bytes[0] === 0xef ||
    bytes.includes(0) ||
    bytes.includes(13) ||
    bytes.at(-1) !== 10
  ) {
    fail("REHEARSAL_JOURNAL_BYTES_INVALID", [
      "BOUNDED_CANONICAL_UTF8_LF_NDJSON_REQUIRED",
    ]);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("REHEARSAL_JOURNAL_BYTES_INVALID", ["STRICT_UTF8_REQUIRED"]);
  }
  const lines = text.slice(0, -1).split("\n");
  if (
    lines.length < 1 ||
    lines.length > MAX_LIFECYCLE_RECORDS + 1 ||
    lines.some((line) => line.length === 0)
  ) {
    fail("REHEARSAL_JOURNAL_BYTES_INVALID", [
      "CONTIGUOUS_BOUNDED_RECORD_SET_REQUIRED",
    ]);
  }
  return lines.map((line) => {
    if (Buffer.byteLength(`${line}\n`, "utf8") > MAX_RECORD_BYTES) {
      fail("REHEARSAL_JOURNAL_BYTES_INVALID", ["RECORD_BYTE_LIMIT_EXCEEDED"]);
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      fail("REHEARSAL_JOURNAL_BYTES_INVALID", ["VALID_JSON_RECORD_REQUIRED"]);
    }
    if (canonicalJson(record) !== line) {
      fail("REHEARSAL_JOURNAL_BYTES_INVALID", [
        "CANONICAL_JSON_RECORD_REQUIRED",
      ]);
    }
    return record;
  });
}

function verifyRecordCryptography(record, publicKey) {
  const {
    recordDigest: actualDigest,
    signatureBase64,
    ...unsignedRecord
  } = record;
  const signedRecord = { ...unsignedRecord, signatureBase64 };
  if (actualDigest !== recordDigest(signedRecord)) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", ["RECORD_DIGEST_MISMATCH"]);
  }
  const signature = decodeCanonicalBase64(
    signatureBase64,
    64,
    "ED25519_SIGNATURE_ENCODING_INVALID",
  );
  if (!verify(null, signaturePayload(unsignedRecord), publicKey, signature)) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", [
      "ED25519_SIGNATURE_VERIFICATION_FAILED",
    ]);
  }
}

function verifyRecordChain(records, expected) {
  const header = records[0];
  if (!validateHeaderShape(header)) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", ["EXACT_HEADER_REQUIRED"]);
  }
  const publicKeyDer = decodeCanonicalBase64(
    header.publicKeySpkiDerBase64,
    44,
    "ED25519_PUBLIC_KEY_ENCODING_INVALID",
  );
  let publicKey;
  try {
    publicKey = createPublicKey({
      format: "der",
      key: publicKeyDer,
      type: "spki",
    });
  } catch {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", ["ED25519_PUBLIC_KEY_INVALID"]);
  }
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !Buffer.from(publicKey.export({ format: "der", type: "spki" })).equals(
      publicKeyDer,
    )
  ) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", [
      "CANONICAL_ED25519_SPKI_REQUIRED",
    ]);
  }
  const fingerprint = sha256(publicKeyDer);
  if (
    header.signerFingerprintSha256 !== fingerprint ||
    header.runToken !== fingerprint.slice(0, 32) ||
    header.authorizationReceiptDigest !== expected.authorizationReceiptDigest ||
    header.signerFingerprintSha256 !== expected.signerFingerprintSha256 ||
    header.runToken !== expected.runToken
  ) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", ["HEADER_TRUST_BINDING_MISMATCH"]);
  }
  verifyRecordCryptography(header, publicKey);

  let previousRecordDigest = header.recordDigest;
  let previousPhase = INITIAL_PHASE;
  for (let index = 1; index < records.length; index += 1) {
    const record = records[index];
    const transition =
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_TRANSITIONS[record?.event];
    if (
      !validateLifecycleShape(record) ||
      record.sequence !== index ||
      record.previousRecordDigest !== previousRecordDigest ||
      record.authorizationReceiptDigest !== header.authorizationReceiptDigest ||
      record.signerFingerprintSha256 !== header.signerFingerprintSha256 ||
      record.runToken !== header.runToken ||
      record.fromPhase !== previousPhase ||
      !transition.from.includes(record.fromPhase) ||
      transition.to !== record.toPhase
    ) {
      fail("REHEARSAL_JOURNAL_RECORD_INVALID", [
        "CONTIGUOUS_LIFECYCLE_CHAIN_INVALID",
      ]);
    }
    verifyRecordCryptography(record, publicKey);
    previousRecordDigest = record.recordDigest;
    previousPhase = record.toPhase;
  }
  const last = records.at(-1);
  const sourceZeroDiffRecords = records.filter(
    (record) => record.event === "SOURCE_ZERO_DIFF_VERIFIED",
  );
  if (sourceZeroDiffRecords.length > 1) {
    fail("REHEARSAL_JOURNAL_RECORD_INVALID", [
      "SINGLE_SOURCE_ZERO_DIFF_FINGERPRINT_RECORD_REQUIRED",
    ]);
  }
  return deepFreeze({
    authorizationReceiptDigest: header.authorizationReceiptDigest,
    byteDigest: sha256(
      Buffer.from(records.map(canonicalJson).join("\n") + "\n"),
    ),
    lastEvent: last.event,
    lastPhase: last.toPhase,
    lastRecordDigest: last.recordDigest,
    lastSequence: last.sequence,
    recordCount: records.length,
    runToken: header.runToken,
    signerFingerprintSha256: header.signerFingerprintSha256,
    sourceZeroDiffFingerprintDigest:
      sourceZeroDiffRecords[0]?.evidenceDigest ?? null,
  });
}

function validateIdentity(value, finding) {
  const snapshot = snapshotFlatData(
    value,
    ["dev", "ino"],
    "REHEARSAL_JOURNAL_LOCATOR_INVALID",
    finding,
  );
  if (
    typeof snapshot.dev !== "string" ||
    typeof snapshot.ino !== "string" ||
    !/^\d+$/u.test(snapshot.dev) ||
    !/^\d+$/u.test(snapshot.ino)
  ) {
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [finding]);
  }
  return snapshot;
}

function locatorDocument(locator) {
  const { locatorDigest, ...document } = locator;
  return document;
}

function snapshotLocator(value) {
  const descriptors = ownDataDescriptors(value);
  const keys = [
    "authorizationReceiptDigest",
    "coordinatorAnchor",
    "coordinatorAnchorDigest",
    "coordinatorFingerprintSha256",
    "contract",
    "fileIdentity",
    "journalPath",
    "locatorDigest",
    "rootIdentity",
    "rootPath",
    "runToken",
    "signerFingerprintSha256",
    "systemTempIdentity",
    "systemTempRealPath",
  ];
  if (
    descriptors === null ||
    canonicalJson(Object.keys(descriptors).sort(compareText)) !==
      canonicalJson([...keys].sort(compareText))
  ) {
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
      "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
    ]);
  }
  const scalarKeys = keys.filter(
    (key) =>
      ![
        "coordinatorAnchor",
        "fileIdentity",
        "rootIdentity",
        "systemTempIdentity",
      ].includes(key),
  );
  const locator = {};
  for (const key of scalarKeys) {
    const entry = descriptors[key].value;
    if (typeof entry !== "string") {
      fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
        "EXACT_DATA_ONLY_LOCATOR_REQUIRED",
      ]);
    }
    locator[key] = entry;
  }
  locator.fileIdentity = validateIdentity(
    descriptors.fileIdentity.value,
    "FILE_IDENTITY_INVALID",
  );
  locator.rootIdentity = validateIdentity(
    descriptors.rootIdentity.value,
    "ROOT_IDENTITY_INVALID",
  );
  locator.systemTempIdentity = validateIdentity(
    descriptors.systemTempIdentity.value,
    "SYSTEM_TEMP_IDENTITY_INVALID",
  );
  locator.coordinatorAnchor = snapshotDataOnly(
    descriptors.coordinatorAnchor.value,
  );
  if (
    locator.contract !==
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_LOCATOR_V1" ||
    !SHA256_PATTERN.test(locator.authorizationReceiptDigest) ||
    !SHA256_PATTERN.test(locator.coordinatorAnchorDigest) ||
    !SHA256_PATTERN.test(locator.coordinatorFingerprintSha256) ||
    !SHA256_PATTERN.test(locator.locatorDigest) ||
    !RUN_TOKEN_PATTERN.test(locator.runToken) ||
    !SHA256_PATTERN.test(locator.signerFingerprintSha256) ||
    locator.runToken !== locator.signerFingerprintSha256.slice(0, 32) ||
    !isAbsolute(locator.systemTempRealPath) ||
    !isAbsolute(locator.rootPath) ||
    !isAbsolute(locator.journalPath) ||
    !isStrictDescendant(locator.rootPath, locator.systemTempRealPath) ||
    !sameNativePath(dirname(locator.rootPath), locator.systemTempRealPath) ||
    basename(locator.rootPath).match(ROOT_DISCOVERY_PATTERN)?.[1] !==
      locator.runToken ||
    !sameNativePath(dirname(locator.journalPath), locator.rootPath) ||
    basename(locator.journalPath) !== JOURNAL_FILE_NAME ||
    Buffer.byteLength(canonicalJson(locator.coordinatorAnchor), "utf8") >
      MAX_RECORD_BYTES ||
    locator.locatorDigest !==
      sha256(
        Buffer.from(
          `${DOMAIN_LOCATOR_DIGEST}\n${canonicalJson(locatorDocument(locator))}`,
          "utf8",
        ),
      )
  ) {
    fail("REHEARSAL_JOURNAL_LOCATOR_INVALID", [
      "LOCATOR_BINDING_OR_PATH_INVALID",
    ]);
  }
  return deepFreeze(locator);
}

function buildLocator(state) {
  const document = {
    authorizationReceiptDigest: state.authorizationReceiptDigest,
    coordinatorAnchor: state.coordinatorAnchor,
    coordinatorAnchorDigest: state.coordinatorAnchor.anchorDigest,
    coordinatorFingerprintSha256:
      state.coordinatorAnchor.coordinatorFingerprintSha256,
    contract:
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_LOCATOR_V1",
    fileIdentity: state.fileIdentity,
    journalPath: state.journalPath,
    rootIdentity: state.rootIdentity,
    rootPath: state.rootPath,
    runToken: state.runToken,
    signerFingerprintSha256: state.signerFingerprintSha256,
    systemTempIdentity: state.systemTemp.identity,
    systemTempRealPath: state.systemTemp.realRoot,
  };
  return deepFreeze({
    ...document,
    locatorDigest: sha256(
      Buffer.from(
        `${DOMAIN_LOCATOR_DIGEST}\n${canonicalJson(document)}`,
        "utf8",
      ),
    ),
  });
}

function journalCoordinatorAnchorPayload(value) {
  return {
    authorizationReceiptDigest: value.authorizationReceiptDigest,
    contract: COORDINATOR_ANCHOR_PAYLOAD_CONTRACT,
    fileIdentity: { ...value.fileIdentity },
    journalPath: value.journalPath,
    rootIdentity: { ...value.rootIdentity },
    rootPath: value.rootPath,
    runToken: value.runToken,
    signerFingerprintSha256: value.signerFingerprintSha256,
    systemTempIdentity: { ...value.systemTempIdentity },
    systemTempRealPath: value.systemTempRealPath,
  };
}

async function verifyLocatorTrust(
  locatorInput,
  coordinatorVerificationAuthority,
  testOnlyCoordinator,
) {
  const locator = snapshotLocator(locatorInput);
  let coordinatorVerification;
  try {
    coordinatorVerification = await verifyCoordinatorAnchor(
      coordinatorVerificationAuthority,
      locator.coordinatorAnchor,
      testOnlyCoordinator,
    );
  } catch {
    fail("REHEARSAL_JOURNAL_COORDINATOR_TRUST_INVALID", [
      "COORDINATOR_SIGNED_JOURNAL_ANCHOR_REQUIRED",
    ]);
  }
  const expectedCoordinatorPayload = journalCoordinatorAnchorPayload({
    authorizationReceiptDigest: locator.authorizationReceiptDigest,
    fileIdentity: locator.fileIdentity,
    journalPath: locator.journalPath,
    rootIdentity: locator.rootIdentity,
    rootPath: locator.rootPath,
    runToken: locator.runToken,
    signerFingerprintSha256: locator.signerFingerprintSha256,
    systemTempIdentity: locator.systemTempIdentity,
    systemTempRealPath: locator.systemTempRealPath,
  });
  if (
    coordinatorVerification.anchor.anchorDigest !==
      locator.coordinatorAnchorDigest ||
    coordinatorVerification.coordinatorFingerprintSha256 !==
      locator.coordinatorFingerprintSha256 ||
    coordinatorVerification.authorizationReceiptDigest !==
      locator.authorizationReceiptDigest ||
    coordinatorVerification.runToken !== locator.runToken ||
    canonicalJson(coordinatorVerification.payload) !==
      canonicalJson(expectedCoordinatorPayload)
  ) {
    fail("REHEARSAL_JOURNAL_COORDINATOR_TRUST_INVALID", [
      "COORDINATOR_ANCHOR_LOCATOR_BINDING_MISMATCH",
    ]);
  }
  return deepFreeze({ coordinatorVerification, locator });
}

async function verifyLocatorProvenance(locator) {
  const currentSystemTemp = await captureSystemTemp();
  if (
    !sameNativePath(currentSystemTemp.realRoot, locator.systemTempRealPath) ||
    !sameIdentity(currentSystemTemp.identity, locator.systemTempIdentity) ||
    sameNativePath(locator.rootPath, REPOSITORY_ROOT) ||
    isStrictDescendant(locator.rootPath, REPOSITORY_ROOT)
  ) {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [
      "SYSTEM_TEMP_IDENTITY_DRIFT",
    ]);
  }
  await assertDirectory(
    locator.systemTempRealPath,
    locator.systemTempRealPath,
    locator.systemTempIdentity,
    "SYSTEM_TEMP_DIRECTORY_DRIFT",
  );
  await assertDirectory(
    locator.rootPath,
    locator.rootPath,
    locator.rootIdentity,
    "JOURNAL_ROOT_IDENTITY_DRIFT",
  );
  await assertFile(
    locator.journalPath,
    locator.journalPath,
    locator.fileIdentity,
    "JOURNAL_FILE_IDENTITY_DRIFT",
  );
}

async function readBoundedJournalFile(path, expectedIdentity) {
  let handle;
  try {
    handle = await open(path, "r");
    const before = await handle.stat({ bigint: true });
    if (
      statType(before) !== "file" ||
      !sameIdentity(identityOf(before), expectedIdentity) ||
      before.size < 1n ||
      before.size > BigInt(MAX_FILE_BYTES)
    ) {
      fail("REHEARSAL_JOURNAL_BYTES_INVALID", [
        "BOUNDED_OPEN_FILE_IDENTITY_AND_SIZE_REQUIRED",
      ]);
    }
    const expectedByteLength = Number(before.size);
    const bytes = Buffer.allocUnsafe(expectedByteLength);
    let offset = 0;
    while (offset < expectedByteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        expectedByteLength - offset,
        offset,
      );
      if (!Number.isSafeInteger(bytesRead) || bytesRead <= 0) {
        fail("REHEARSAL_JOURNAL_READ_FAILED", [
          "BOUNDED_EXACT_JOURNAL_READ_REQUIRED",
        ]);
      }
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (
      statType(after) !== "file" ||
      !sameIdentity(identityOf(after), expectedIdentity) ||
      after.size !== before.size
    ) {
      fail("REHEARSAL_JOURNAL_READ_FAILED", [
        "OPEN_JOURNAL_IDENTITY_OR_SIZE_DRIFT",
      ]);
    }
    return bytes;
  } catch (error) {
    if (error instanceof Current180Current190PostgresqlRehearsalJournalError) {
      throw error;
    }
    fail("REHEARSAL_JOURNAL_READ_FAILED", ["JOURNAL_READ_FAILED"]);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function assertExactLocatorTree(locator) {
  let entries;
  try {
    entries = await readdir(locator.rootPath, { withFileTypes: true });
  } catch {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [
      "JOURNAL_ROOT_ENUMERATION_FAILED",
    ]);
  }
  if (
    entries.length !== 1 ||
    entries[0].name !== JOURNAL_FILE_NAME ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink()
  ) {
    fail("REHEARSAL_JOURNAL_PROVENANCE_INVALID", [
      "EXACT_SINGLE_JOURNAL_FILE_REQUIRED",
    ]);
  }
}

async function readAndVerify(
  locatorInput,
  coordinatorVerificationAuthority,
  testOnlyCoordinator,
) {
  const { coordinatorVerification, locator } = await verifyLocatorTrust(
    locatorInput,
    coordinatorVerificationAuthority,
    testOnlyCoordinator,
  );
  await verifyLocatorProvenance(locator);
  await assertExactLocatorTree(locator);
  const bytes = await readBoundedJournalFile(
    locator.journalPath,
    locator.fileIdentity,
  );
  const records = parseCanonicalRecords(bytes);
  const verified = verifyRecordChain(records, locator);
  if (
    canonicalJson(records[0].coordinatorAnchor) !==
    canonicalJson(coordinatorVerification.anchor)
  ) {
    fail("REHEARSAL_JOURNAL_COORDINATOR_TRUST_INVALID", [
      "JOURNAL_HEADER_COORDINATOR_ANCHOR_MISMATCH",
    ]);
  }
  await verifyLocatorProvenance(locator);
  await assertExactLocatorTree(locator);
  return deepFreeze({ ...verified, byteLength: bytes.length, locator });
}

function journalIdentityKey(locator) {
  return [
    locator.systemTempIdentity.dev,
    locator.systemTempIdentity.ino,
    locator.rootIdentity.dev,
    locator.rootIdentity.ino,
    locator.fileIdentity.dev,
    locator.fileIdentity.ino,
    locator.coordinatorAnchorDigest,
    locator.coordinatorFingerprintSha256,
    locator.signerFingerprintSha256,
    locator.authorizationReceiptDigest,
  ].join(":");
}

function invalidateVerificationReceipts(locator) {
  latestVerificationReceipts.delete(journalIdentityKey(locator));
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
    );
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
      throw new Error("short journal write");
    }
    offset += bytesWritten;
  }
}

async function appendDurably(state, bytes, expectedByteLength) {
  await verifyLocatorProvenance(state.locator);
  let handle;
  try {
    handle = await open(state.journalPath, "a", 0o600);
    const before = await handle.stat({ bigint: true });
    if (
      statType(before) !== "file" ||
      !sameIdentity(identityOf(before), state.fileIdentity) ||
      before.size !== BigInt(expectedByteLength)
    ) {
      fail("REHEARSAL_JOURNAL_APPEND_DENIED", [
        "OPEN_FILE_IDENTITY_OR_LENGTH_DRIFT",
      ]);
    }
    await writeAll(handle, bytes);
    await handle.sync();
    const after = await handle.stat({ bigint: true });
    if (
      !sameIdentity(identityOf(after), state.fileIdentity) ||
      after.size !== BigInt(expectedByteLength + bytes.length)
    ) {
      fail("REHEARSAL_JOURNAL_APPEND_DENIED", [
        "DURABLE_APPEND_LENGTH_OR_IDENTITY_MISMATCH",
      ]);
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
  await verifyLocatorProvenance(state.locator);
  await syncDirectoryBestEffort(state.rootPath);
}

async function exactTreeEntries(rootPath) {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
      "JOURNAL_ROOT_ENUMERATION_FAILED",
    ]);
  }
  return entries;
}

function hasExpectedOwnedRootPath(state) {
  if (
    state?.systemTemp === undefined ||
    typeof state.rootPath !== "string" ||
    typeof state.runToken !== "string"
  ) {
    return false;
  }
  const expectedPrefix = `${ROOT_PREFIX}${state.runToken}-`;
  const rootName = basename(state.rootPath);
  return (
    isAbsolute(state.rootPath) &&
    sameNativePath(dirname(state.rootPath), state.systemTemp.realRoot) &&
    isStrictDescendant(state.rootPath, state.systemTemp.realRoot) &&
    rootName.startsWith(expectedPrefix) &&
    ROOT_SUFFIX_PATTERN.test(rootName.slice(expectedPrefix.length)) &&
    !sameNativePath(state.rootPath, REPOSITORY_ROOT) &&
    !isStrictDescendant(state.rootPath, REPOSITORY_ROOT)
  );
}

async function assertOwnedRootAbsent(state, finding) {
  if (!hasExpectedOwnedRootPath(state)) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [finding]);
  }
  await assertDirectory(
    state.systemTemp.realRoot,
    state.systemTemp.realRoot,
    state.systemTemp.identity,
    "SYSTEM_TEMP_ABSENCE_RECONCILIATION_DRIFT",
  );
  let rootStillPresent = false;
  try {
    await lstat(state.rootPath, { bigint: true });
    rootStillPresent = true;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [finding]);
    }
  }
  let parentEntries;
  try {
    parentEntries = await readdir(state.systemTemp.realRoot, {
      withFileTypes: true,
    });
  } catch {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [finding]);
  }
  if (
    rootStillPresent ||
    parentEntries.some((entry) => entry.name === basename(state.rootPath))
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [finding]);
  }
  await assertDirectory(
    state.systemTemp.realRoot,
    state.systemTemp.realRoot,
    state.systemTemp.identity,
    "SYSTEM_TEMP_POST_ABSENCE_RECONCILIATION_DRIFT",
  );
}

async function reconcileAmbiguousJournalFileRemoval(state) {
  await assertDirectory(
    state.systemTemp.realRoot,
    state.systemTemp.realRoot,
    state.systemTemp.identity,
    "SYSTEM_TEMP_FILE_REMOVAL_RECONCILIATION_DRIFT",
  );
  await assertDirectory(
    state.rootPath,
    state.rootPath,
    state.rootIdentity,
    "JOURNAL_ROOT_FILE_REMOVAL_RECONCILIATION_DRIFT",
  );
  let fileStat;
  try {
    fileStat = await lstat(state.journalPath, { bigint: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
        "JOURNAL_FILE_REMOVAL_OUTCOME_AMBIGUOUS",
      ]);
    }
  }
  if (fileStat === undefined) {
    state.cleanupStage = "JOURNAL_FILE_REMOVED_ROOT_PRESENT";
    return;
  }
  if (
    statType(fileStat) !== "file" ||
    !sameIdentity(identityOf(fileStat), state.fileIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
      "JOURNAL_FILE_REMOVAL_REPLACEMENT_DETECTED",
    ]);
  }
  await assertFile(
    state.journalPath,
    state.journalPath,
    state.fileIdentity,
    "JOURNAL_FILE_REMOVAL_RECONCILIATION_DRIFT",
  );
  state.cleanupStage = "JOURNAL_FILE_PRESENT";
}

async function reconcileAmbiguousRootRemoval(state) {
  await assertDirectory(
    state.systemTemp.realRoot,
    state.systemTemp.realRoot,
    state.systemTemp.identity,
    "SYSTEM_TEMP_ROOT_REMOVAL_RECONCILIATION_DRIFT",
  );
  let rootStat;
  try {
    rootStat = await lstat(state.rootPath, { bigint: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
        "JOURNAL_ROOT_REMOVAL_OUTCOME_AMBIGUOUS",
      ]);
    }
  }
  if (rootStat === undefined) {
    await assertOwnedRootAbsent(
      state,
      "JOURNAL_ROOT_REMOVAL_OUTCOME_AMBIGUOUS",
    );
    state.cleanupStage = "ROOT_REMOVED";
    return;
  }
  if (
    statType(rootStat) !== "directory" ||
    state.rootRemovalIdentity === undefined ||
    !sameRemovalIdentity(removalIdentityOf(rootStat), state.rootRemovalIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
      "JOURNAL_ROOT_REMOVAL_REPLACEMENT_DETECTED",
    ]);
  }
  await assertDirectory(
    state.rootPath,
    state.rootPath,
    state.rootIdentity,
    "JOURNAL_ROOT_REMOVAL_RECONCILIATION_DRIFT",
  );
  state.cleanupStage = "JOURNAL_FILE_REMOVED_ROOT_PRESENT";
}

async function assertExactJournalTree(state) {
  const verified = await readAndVerify(
    state.locator,
    state.coordinatorVerificationAuthority,
    state.testOnlyCoordinator,
  );
  if (
    verified.lastSequence !== state.lastSequence ||
    verified.lastRecordDigest !== state.lastRecordDigest ||
    verified.lastPhase !== state.lastPhase ||
    verified.byteLength !== state.expectedByteLength
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
      "LIVE_STATE_OR_JOURNAL_BYTES_DRIFT",
    ]);
  }
  const entries = await exactTreeEntries(state.rootPath);
  if (
    entries.length !== 1 ||
    entries[0].name !== JOURNAL_FILE_NAME ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink()
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", ["JOURNAL_ROOT_ENTRY_SET_DRIFT"]);
  }
  return verified;
}

function buildPublicJournalHandle(state) {
  return deepFreeze({
    authorization: NO_AUTHORITY,
    authorizationReceiptDigest: state.authorizationReceiptDigest,
    coordinatorAnchorDigest: state.coordinatorAnchor.anchorDigest,
    coordinatorFingerprintSha256:
      state.coordinatorAnchor.coordinatorFingerprintSha256,
    contract: CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_CONTRACT,
    journalPath: state.journalPath,
    limitations: LIMITATIONS,
    rootPath: state.rootPath,
    runToken: state.runToken,
    signerFingerprintSha256: state.signerFingerprintSha256,
    status: "LIVE_MODULE_BRANDED_APPEND_HANDLE_NOT_EXECUTION_AUTHORITY",
    verificationLocator: state.locator,
  });
}

function requireSignerHandle(value) {
  if (isProxy(value) || !signerStates.has(value)) {
    fail("REHEARSAL_JOURNAL_SIGNER_INVALID", [
      "EXACT_MODULE_BRANDED_SIGNER_REQUIRED",
    ]);
  }
  return signerStates.get(value);
}

function requireJournalHandle(value, allowedStatuses = ["LIVE"]) {
  if (isProxy(value) || !journalStates.has(value)) {
    fail("REHEARSAL_JOURNAL_HANDLE_INVALID", [
      "EXACT_MODULE_BRANDED_JOURNAL_HANDLE_REQUIRED",
    ]);
  }
  const state = journalStates.get(value);
  if (!allowedStatuses.includes(state.status)) {
    fail("REHEARSAL_JOURNAL_HANDLE_INVALID", [
      "JOURNAL_HANDLE_NOT_IN_REQUIRED_LIVE_STATE",
    ]);
  }
  return state;
}

function manualReceiptDocument(state, reason, cleanupStage) {
  return {
    authorization: NO_AUTHORITY,
    authorizationReceiptDigest: state.authorizationReceiptDigest,
    cleanupStage,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_MANUAL_INSPECTION_CONTRACT,
    journalPath: state.journalPath,
    limitations: LIMITATIONS,
    reason,
    rootPath: state.rootPath,
    runToken: state.runToken,
    signerFingerprintSha256: state.signerFingerprintSha256,
    status: "FAIL_CLOSED_MANUAL_INSPECTION_REQUIRED_NOT_RECOVERY_AUTHORITY",
  };
}

function issueManualInspectionReceipt(state, reason, cleanupStage) {
  if (state.latestManualReceipt !== undefined) {
    const prior = state.latestManualReceipt;
    const priorState = manualInspectionStates.get(prior);
    if (priorState !== undefined) priorState.active = false;
  }
  const document = manualReceiptDocument(state, reason, cleanupStage);
  const receipt = deepFreeze({
    ...document,
    manualInspectionDigest: sha256(
      Buffer.from(
        `${DOMAIN_MANUAL_INSPECTION_DIGEST}\n${canonicalJson(document)}`,
        "utf8",
      ),
    ),
  });
  state.latestManualReceipt = receipt;
  manualInspectionStates.set(receipt, {
    active: true,
    cleanupStage,
    state,
  });
  return receipt;
}

async function safeCleanupNewlyOwnedPaths(partial) {
  try {
    if (partial.rootPath === undefined) return true;
    if (
      partial.cleanupStage === "UNVERIFIED_NEW_ROOT_PRESENT" &&
      partial.rootIdentity === undefined &&
      typeof partial.runToken === "string"
    ) {
      const expectedPrefix = `${ROOT_PREFIX}${partial.runToken}-`;
      const rootName = basename(partial.rootPath);
      if (
        !sameNativePath(
          dirname(partial.rootPath),
          partial.systemTemp.realRoot,
        ) ||
        !isStrictDescendant(partial.rootPath, partial.systemTemp.realRoot) ||
        !rootName.startsWith(expectedPrefix) ||
        !ROOT_SUFFIX_PATTERN.test(rootName.slice(expectedPrefix.length))
      ) {
        return false;
      }
      const rootStat = await lstat(partial.rootPath, { bigint: true });
      const rootRealPath = await realpath(partial.rootPath);
      const entries = await readdir(partial.rootPath, { withFileTypes: true });
      if (
        statType(rootStat) !== "directory" ||
        !sameNativePath(rootRealPath, partial.rootPath) ||
        entries.length !== 0
      ) {
        return false;
      }
      partial.rootIdentity = identityOf(rootStat);
      partial.cleanupStage = "EMPTY_ROOT_PRESENT";
    }
    if (partial.cleanupStage === "JOURNAL_FILE_REMOVAL_AMBIGUOUS") {
      await reconcileAmbiguousJournalFileRemoval(partial);
    }
    if (partial.cleanupStage === "ROOT_REMOVAL_AMBIGUOUS") {
      await reconcileAmbiguousRootRemoval(partial);
    }
    if (partial.cleanupStage === "ROOT_REMOVED") {
      await assertOwnedRootAbsent(
        partial,
        "BIND_FAILURE_ROOT_ABSENCE_NOT_PROVABLE",
      );
      return true;
    }
    await assertDirectory(
      partial.systemTemp.realRoot,
      partial.systemTemp.realRoot,
      partial.systemTemp.identity,
      "BIND_FAILURE_SYSTEM_TEMP_DRIFT",
    );
    await assertDirectory(
      partial.rootPath,
      partial.rootPath,
      partial.rootIdentity,
      "BIND_FAILURE_ROOT_DRIFT",
    );
    let entries = await exactTreeEntries(partial.rootPath);
    if (
      partial.cleanupStage === "JOURNAL_FILE_PRESENT" &&
      partial.fileIdentity !== undefined
    ) {
      if (
        entries.length !== 1 ||
        entries[0].name !== JOURNAL_FILE_NAME ||
        !entries[0].isFile() ||
        entries[0].isSymbolicLink()
      ) {
        return false;
      }
      await assertFile(
        partial.journalPath,
        partial.journalPath,
        partial.fileIdentity,
        "BIND_FAILURE_FILE_DRIFT",
      );
      await assertDirectory(
        partial.rootPath,
        partial.rootPath,
        partial.rootIdentity,
        "BIND_FAILURE_ROOT_PRE_UNLINK_DRIFT",
      );
      partial.cleanupStage = "JOURNAL_FILE_REMOVAL_AMBIGUOUS";
      await unlink(partial.journalPath);
      await syncDirectoryBestEffort(partial.rootPath);
      partial.cleanupStage = "JOURNAL_FILE_REMOVED_ROOT_PRESENT";
      entries = await exactTreeEntries(partial.rootPath);
    } else if (
      !["EMPTY_ROOT_PRESENT", "JOURNAL_FILE_REMOVED_ROOT_PRESENT"].includes(
        partial.cleanupStage,
      )
    ) {
      return false;
    }
    if (entries.length !== 0) return false;
    await assertDirectory(
      partial.rootPath,
      partial.rootPath,
      partial.rootIdentity,
      "BIND_FAILURE_ROOT_PRE_REMOVE_DRIFT",
    );
    partial.cleanupStage = "ROOT_REMOVAL_AMBIGUOUS";
    await rmdir(partial.rootPath);
    await syncDirectoryBestEffort(partial.systemTemp.realRoot);
    partial.cleanupStage = "ROOT_REMOVED";
    await assertOwnedRootAbsent(
      partial,
      "BIND_FAILURE_ROOT_ABSENCE_NOT_PROVABLE",
    );
    return true;
  } catch {
    return false;
  }
}

export function createCurrent180Current190PostgresqlRehearsalJournalSigner() {
  if (arguments.length !== 0) {
    fail("REHEARSAL_JOURNAL_SIGNER_INVALID", ["NO_ARGUMENTS_ALLOWED"]);
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = Buffer.from(
    publicKey.export({ format: "der", type: "spki" }),
  );
  const signerFingerprintSha256 = sha256(publicKeyDer);
  const runToken = signerFingerprintSha256.slice(0, 32);
  const signer = deepFreeze({
    authorization: NO_AUTHORITY,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_SIGNER_CONTRACT,
    limitations: LIMITATIONS,
    publicKeyFingerprintSha256: signerFingerprintSha256,
    runToken,
    status: "UNBOUND_MEMORY_ONLY_SIGNER_NOT_EXECUTION_AUTHORITY",
  });
  signerStates.set(signer, {
    privateKey,
    publicKeyDer,
    runToken,
    signerFingerprintSha256,
    status: "UNBOUND",
  });
  return signer;
}

async function bindInternal(
  coordinatorSigningAuthority,
  coordinatorVerificationAuthority,
  coordinatorRunBinding,
  signer,
  testOnlyCoordinator,
) {
  const binding = await assertCoordinatorRunBinding(
    coordinatorSigningAuthority,
    coordinatorRunBinding,
    testOnlyCoordinator,
  );
  await assertCoordinatorVerificationAuthority(
    coordinatorVerificationAuthority,
    testOnlyCoordinator,
  );
  const authorizationReceiptDigest = binding.authorizationReceiptDigest;
  const signerState = requireSignerHandle(signer);
  if (
    signerState.status !== "UNBOUND" ||
    binding.runToken !== signerState.runToken
  ) {
    fail("REHEARSAL_JOURNAL_BIND_INPUT_INVALID", [
      "FRESH_SIGNER_AND_SAME_RUN_COORDINATOR_BINDING_REQUIRED",
    ]);
  }
  signerState.status = "BINDING";
  const partial = {};
  try {
    partial.systemTemp = await captureSystemTemp();
    partial.runToken = signerState.runToken;
    const rootPrefix = `${ROOT_PREFIX}${signerState.runToken}-`;
    partial.rootPath = await mkdtemp(
      join(partial.systemTemp.realRoot, rootPrefix),
    );
    partial.cleanupStage = "UNVERIFIED_NEW_ROOT_PRESENT";
    const suffix = basename(partial.rootPath).slice(rootPrefix.length);
    const rootStat = await lstat(partial.rootPath, { bigint: true });
    const rootRealPath = await realpath(partial.rootPath);
    if (
      statType(rootStat) !== "directory" ||
      !ROOT_SUFFIX_PATTERN.test(suffix) ||
      !sameNativePath(rootRealPath, partial.rootPath) ||
      !sameNativePath(dirname(partial.rootPath), partial.systemTemp.realRoot) ||
      isStrictDescendant(partial.rootPath, REPOSITORY_ROOT)
    ) {
      fail("REHEARSAL_JOURNAL_BIND_FAILED", [
        "ATOMIC_SYSTEM_TEMP_ROOT_INVALID",
      ]);
    }
    partial.rootIdentity = identityOf(rootStat);
    partial.cleanupStage = "EMPTY_ROOT_PRESENT";
    partial.journalPath = join(partial.rootPath, JOURNAL_FILE_NAME);

    const publicKeySpkiDerBase64 = canonicalBase64(signerState.publicKeyDer);
    let header;
    let headerBytes;
    let fileHandle;
    try {
      fileHandle = await open(partial.journalPath, "wx", 0o600);
      const fileStat = await fileHandle.stat({ bigint: true });
      if (statType(fileStat) !== "file" || fileStat.size !== 0n) {
        fail("REHEARSAL_JOURNAL_BIND_FAILED", ["ATOMIC_JOURNAL_FILE_INVALID"]);
      }
      partial.fileIdentity = identityOf(fileStat);
      partial.cleanupStage = "JOURNAL_FILE_PRESENT";
      partial.coordinatorAnchor = await signCoordinatorAnchor(
        coordinatorSigningAuthority,
        binding,
        journalCoordinatorAnchorPayload({
          authorizationReceiptDigest,
          fileIdentity: partial.fileIdentity,
          journalPath: partial.journalPath,
          rootIdentity: partial.rootIdentity,
          rootPath: partial.rootPath,
          runToken: signerState.runToken,
          signerFingerprintSha256: signerState.signerFingerprintSha256,
          systemTempIdentity: partial.systemTemp.identity,
          systemTempRealPath: partial.systemTemp.realRoot,
        }),
        testOnlyCoordinator,
      );
      header = buildHeaderRecord({
        authorizationReceiptDigest,
        coordinatorAnchor: partial.coordinatorAnchor,
        privateKey: signerState.privateKey,
        publicKeySpkiDerBase64,
        runToken: signerState.runToken,
        signerFingerprintSha256: signerState.signerFingerprintSha256,
      });
      headerBytes = recordBytes(header);
      await writeAll(fileHandle, headerBytes);
      await fileHandle.sync();
      const durableStat = await fileHandle.stat({ bigint: true });
      if (
        !sameIdentity(identityOf(durableStat), partial.fileIdentity) ||
        durableStat.size !== BigInt(headerBytes.length)
      ) {
        fail("REHEARSAL_JOURNAL_BIND_FAILED", [
          "DURABLE_HEADER_LENGTH_OR_IDENTITY_MISMATCH",
        ]);
      }
    } finally {
      await fileHandle?.close().catch(() => undefined);
    }
    await assertDirectory(
      partial.rootPath,
      partial.rootPath,
      partial.rootIdentity,
      "JOURNAL_ROOT_POST_HEADER_DRIFT",
    );
    await assertFile(
      partial.journalPath,
      partial.journalPath,
      partial.fileIdentity,
      "JOURNAL_FILE_POST_HEADER_DRIFT",
    );
    await syncDirectoryBestEffort(partial.rootPath);
    await syncDirectoryBestEffort(partial.systemTemp.realRoot);

    const state = {
      authorizationReceiptDigest,
      coordinatorAnchor: partial.coordinatorAnchor,
      coordinatorVerificationAuthority,
      expectedByteLength: headerBytes.length,
      fileIdentity: partial.fileIdentity,
      journalPath: partial.journalPath,
      lastPhase: INITIAL_PHASE,
      lastRecordDigest: header.recordDigest,
      lastSequence: 0,
      privateKey: signerState.privateKey,
      rootIdentity: partial.rootIdentity,
      rootPath: partial.rootPath,
      runToken: signerState.runToken,
      signerFingerprintSha256: signerState.signerFingerprintSha256,
      status: "BINDING_VERIFY",
      systemTemp: partial.systemTemp,
      testOnlyCoordinator,
    };
    state.locator = buildLocator(state);
    const verified = await readAndVerify(
      state.locator,
      state.coordinatorVerificationAuthority,
      state.testOnlyCoordinator,
    );
    if (
      verified.lastRecordDigest !== header.recordDigest ||
      verified.byteLength !== headerBytes.length
    ) {
      fail("REHEARSAL_JOURNAL_BIND_FAILED", [
        "DURABLE_HEADER_REOPEN_VERIFICATION_FAILED",
      ]);
    }
    state.status = "LIVE";
    const journal = buildPublicJournalHandle(state);
    state.journal = journal;
    journalStates.set(journal, state);
    signerState.status = "BOUND";
    signerState.privateKey = null;
    return journal;
  } catch (error) {
    signerState.status = "FAILED";
    const cleaned = await safeCleanupNewlyOwnedPaths(partial);
    if (cleaned) {
      if (
        error instanceof Current180Current190PostgresqlRehearsalJournalError
      ) {
        throw error;
      }
      fail("REHEARSAL_JOURNAL_BIND_FAILED", [
        "BIND_OPERATION_FAILED_WITH_ZERO_RESIDUE",
      ]);
    }
    const failureState = {
      authorizationReceiptDigest,
      fileIdentity: partial.fileIdentity,
      journalPath: partial.journalPath ?? "",
      kind: "BIND_FAILURE",
      cleanupStage: partial.cleanupStage ?? "BIND_FAILURE_IDENTITY_INCOMPLETE",
      rootIdentity: partial.rootIdentity,
      rootPath: partial.rootPath ?? "",
      runToken: signerState.runToken,
      signerFingerprintSha256: signerState.signerFingerprintSha256,
      status: "MANUAL_INSPECTION_REQUIRED",
      systemTemp: partial.systemTemp,
    };
    signerState.privateKey = null;
    const receipt = issueManualInspectionReceipt(
      failureState,
      "BIND_FAILURE_CLEANUP_AMBIGUOUS",
      failureState.cleanupStage,
    );
    fail(
      "REHEARSAL_JOURNAL_BIND_CLEANUP_INCOMPLETE",
      ["MANUAL_INSPECTION_REQUIRED"],
      receipt,
    );
  }
}

export async function bindCurrent180Current190PostgresqlRehearsalJournal(
  coordinatorSigningAuthority,
  coordinatorVerificationAuthority,
  coordinatorRunBinding,
  signer,
) {
  if (arguments.length !== 4) {
    fail("REHEARSAL_JOURNAL_BIND_INPUT_INVALID", [
      "EXACT_PRODUCTION_SIGNING_VERIFICATION_BINDING_AND_SIGNER_REQUIRED",
    ]);
  }
  return bindInternal(
    coordinatorSigningAuthority,
    coordinatorVerificationAuthority,
    coordinatorRunBinding,
    signer,
    false,
  );
}

export async function bindCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
  coordinatorAuthority,
  coordinatorRunBinding,
  signer,
) {
  if (arguments.length !== 3) {
    fail("REHEARSAL_JOURNAL_BIND_INPUT_INVALID", [
      "EXACT_TEST_COORDINATOR_BINDING_AND_SIGNER_REQUIRED",
    ]);
  }
  return bindInternal(
    coordinatorAuthority,
    coordinatorAuthority,
    coordinatorRunBinding,
    signer,
    true,
  );
}

async function appendInternal(journal, input, testFault) {
  const state = requireJournalHandle(journal);
  if (state.lastSequence >= MAX_LIFECYCLE_RECORDS) {
    fail("REHEARSAL_JOURNAL_APPEND_DENIED", ["LIFECYCLE_RECORD_LIMIT_REACHED"]);
  }
  const lifecycle = validateLifecycleInput(input, state.lastPhase);
  state.status = "APPENDING";
  invalidateVerificationReceipts(state.locator);
  let durableWriteAttempted = false;
  try {
    const before = await readAndVerify(
      state.locator,
      state.coordinatorVerificationAuthority,
      state.testOnlyCoordinator,
    );
    if (
      before.lastSequence !== state.lastSequence ||
      before.lastRecordDigest !== state.lastRecordDigest ||
      before.lastPhase !== state.lastPhase ||
      before.byteLength !== state.expectedByteLength
    ) {
      state.status = "STALE";
      fail("REHEARSAL_JOURNAL_APPEND_DENIED", [
        "JOURNAL_LIVE_STATE_STALE_REFRESH_REQUIRED",
      ]);
    }
    const record = buildLifecycleRecord(state, lifecycle);
    const bytes = recordBytes(record);
    durableWriteAttempted = true;
    await appendDurably(state, bytes, state.expectedByteLength);
    if (testFault === "AFTER_DURABLE_APPEND_BEFORE_STATE") {
      state.status = "STALE";
      fail("REHEARSAL_JOURNAL_APPEND_RESPONSE_LOST", [
        "DURABLE_RECORD_MAY_EXIST_REFRESH_REQUIRED",
      ]);
    }
    const after = await readAndVerify(
      state.locator,
      state.coordinatorVerificationAuthority,
      state.testOnlyCoordinator,
    );
    if (
      after.lastSequence !== record.sequence ||
      after.lastRecordDigest !== record.recordDigest ||
      after.lastPhase !== record.toPhase ||
      after.byteLength !== state.expectedByteLength + bytes.length
    ) {
      state.status = "STALE";
      fail("REHEARSAL_JOURNAL_APPEND_DENIED", [
        "POST_APPEND_REOPEN_VERIFICATION_FAILED",
      ]);
    }
    state.expectedByteLength = after.byteLength;
    state.lastPhase = after.lastPhase;
    state.lastRecordDigest = after.lastRecordDigest;
    state.lastSequence = after.lastSequence;
    state.status = "LIVE";
    return deepFreeze({
      authorization: NO_AUTHORITY,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_APPEND_RECEIPT_V1",
      event: record.event,
      lastPhase: record.toPhase,
      recordDigest: record.recordDigest,
      runToken: state.runToken,
      sequence: record.sequence,
      status: "DURABLE_RECORD_APPENDED_NOT_EXECUTION_AUTHORITY",
    });
  } catch (error) {
    if (state.status === "APPENDING") {
      state.status = durableWriteAttempted ? "STALE" : "LIVE";
    }
    throw error;
  }
}

export async function appendCurrent180Current190PostgresqlRehearsalJournal(
  journal,
  input,
) {
  if (arguments.length !== 2) {
    fail("REHEARSAL_JOURNAL_APPEND_INPUT_INVALID", [
      "EXACT_JOURNAL_AND_LIFECYCLE_INPUT_REQUIRED",
    ]);
  }
  return appendInternal(journal, input, null);
}

export async function appendCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
  journal,
  input,
  options,
) {
  if (arguments.length !== 3) {
    fail("REHEARSAL_JOURNAL_APPEND_INPUT_INVALID", [
      "EXACT_TEST_ONLY_ARGUMENTS_REQUIRED",
    ]);
  }
  const snapshot = snapshotFlatData(
    options,
    ["fault"],
    "REHEARSAL_JOURNAL_APPEND_INPUT_INVALID",
    "EXACT_TEST_ONLY_FAULT_REQUIRED",
  );
  if (snapshot.fault !== "AFTER_DURABLE_APPEND_BEFORE_STATE") {
    fail("REHEARSAL_JOURNAL_APPEND_INPUT_INVALID", [
      "SUPPORTED_TEST_ONLY_FAULT_REQUIRED",
    ]);
  }
  return appendInternal(journal, input, snapshot.fault);
}

export async function refreshCurrent180Current190PostgresqlRehearsalJournal(
  journal,
) {
  if (arguments.length !== 1) {
    fail("REHEARSAL_JOURNAL_REFRESH_INPUT_INVALID", [
      "EXACT_JOURNAL_HANDLE_REQUIRED",
    ]);
  }
  const state = requireJournalHandle(journal, ["LIVE", "STALE"]);
  try {
    if (state.status === "LIVE") {
      const current = await readAndVerify(
        state.locator,
        state.coordinatorVerificationAuthority,
        state.testOnlyCoordinator,
      );
      if (
        current.lastSequence !== state.lastSequence ||
        current.lastRecordDigest !== state.lastRecordDigest ||
        current.byteLength !== state.expectedByteLength
      ) {
        state.status = "STALE";
      }
    }
    const verified = await readAndVerify(
      state.locator,
      state.coordinatorVerificationAuthority,
      state.testOnlyCoordinator,
    );
    if (verified.lastSequence < state.lastSequence) {
      fail("REHEARSAL_JOURNAL_REFRESH_DENIED", [
        "JOURNAL_HISTORY_REGRESSION_DETECTED",
      ]);
    }
    state.expectedByteLength = verified.byteLength;
    state.lastPhase = verified.lastPhase;
    state.lastRecordDigest = verified.lastRecordDigest;
    state.lastSequence = verified.lastSequence;
    state.status = "LIVE";
    invalidateVerificationReceipts(state.locator);
    return deepFreeze({
      authorization: NO_AUTHORITY,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_REFRESH_RECEIPT_V1",
      lastPhase: state.lastPhase,
      lastRecordDigest: state.lastRecordDigest,
      lastSequence: state.lastSequence,
      runToken: state.runToken,
      status: "LIVE_PRIVATE_SIGNER_STATE_REFRESHED_NOT_RECOVERY_AUTHORITY",
    });
  } catch (error) {
    state.status = "MANUAL_INSPECTION_REQUIRED";
    const receipt = issueManualInspectionReceipt(
      state,
      error instanceof Current180Current190PostgresqlRehearsalJournalError
        ? error.code
        : "UNEXPECTED_REFRESH_FAILURE",
      "JOURNAL_FILE_PRESENT",
    );
    fail(
      "REHEARSAL_JOURNAL_REFRESH_INCOMPLETE",
      ["MANUAL_INSPECTION_REQUIRED"],
      receipt,
    );
  }
}

async function verifyJournalInternal(
  coordinatorAuthority,
  locator,
  testOnlyCoordinator,
) {
  const verified = await readAndVerify(
    locator,
    coordinatorAuthority,
    testOnlyCoordinator,
  );
  const key = journalIdentityKey(verified.locator);
  const previous = latestVerificationReceipts.get(key);
  if (previous !== undefined) {
    const previousState = verificationReceiptStates.get(previous);
    if (previousState !== undefined) previousState.active = false;
  }
  verificationGeneration += 1;
  const document = {
    authorization: NO_AUTHORITY,
    authorizationReceiptDigest: verified.authorizationReceiptDigest,
    byteDigest: verified.byteDigest,
    byteLength: verified.byteLength,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_VERIFICATION_CONTRACT,
    coordinatorAnchorDigest: verified.locator.coordinatorAnchorDigest,
    coordinatorFingerprintSha256: verified.locator.coordinatorFingerprintSha256,
    lastEvent: verified.lastEvent,
    lastPhase: verified.lastPhase,
    lastRecordDigest: verified.lastRecordDigest,
    lastSequence: verified.lastSequence,
    limitations: LIMITATIONS,
    recordCount: verified.recordCount,
    runToken: verified.runToken,
    signerFingerprintSha256: verified.signerFingerprintSha256,
    sourceZeroDiffFingerprintDigest: verified.sourceZeroDiffFingerprintDigest,
    status: "AUTHENTICATED_DURABLE_JOURNAL_VERIFIED_NOT_EXECUTION_AUTHORITY",
    verificationGeneration,
  };
  const receipt = deepFreeze({
    ...document,
    verificationReceiptDigest: sha256(canonicalJson(document)),
  });
  verificationReceiptStates.set(receipt, {
    active: true,
    key,
    testOnly: testOnlyCoordinator,
  });
  latestVerificationReceipts.set(key, receipt);
  return receipt;
}

export async function verifyCurrent180Current190PostgresqlRehearsalJournal(
  coordinatorAuthority,
  locator,
) {
  if (arguments.length !== 2) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_INPUT_INVALID", [
      "EXACT_PRODUCTION_COORDINATOR_AND_PUBLIC_LOCATOR_REQUIRED",
    ]);
  }
  return verifyJournalInternal(coordinatorAuthority, locator, false);
}

export async function verifyCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
  coordinatorAuthority,
  locator,
) {
  if (arguments.length !== 2) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_INPUT_INVALID", [
      "EXACT_TEST_COORDINATOR_AND_PUBLIC_LOCATOR_REQUIRED",
    ]);
  }
  return verifyJournalInternal(coordinatorAuthority, locator, true);
}

export function assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceipt(
  receipt,
) {
  if (arguments.length !== 1 || isProxy(receipt)) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  const state = verificationReceiptStates.get(receipt);
  if (state === undefined) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  if (
    state.testOnly ||
    !state.active ||
    latestVerificationReceipts.get(state.key) !== receipt
  ) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID", [
      state.testOnly
        ? "TEST_ONLY_VERIFICATION_RECEIPT_REJECTED_BY_PRODUCTION_ASSERT"
        : "VERIFICATION_RECEIPT_STALE",
    ]);
  }
  return receipt;
}

export function assertCurrent180Current190PostgresqlRehearsalJournalVerificationReceiptForTestOnly(
  receipt,
) {
  if (arguments.length !== 1 || isProxy(receipt)) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_TEST_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  const state = verificationReceiptStates.get(receipt);
  if (
    state === undefined ||
    !state.testOnly ||
    !state.active ||
    latestVerificationReceipts.get(state.key) !== receipt
  ) {
    fail("REHEARSAL_JOURNAL_VERIFICATION_RECEIPT_INVALID", [
      "FRESH_TEST_ONLY_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  return receipt;
}

async function discoverJournalRecoveryLocatorsInternal(
  coordinatorVerificationAuthority,
  testOnlyCoordinator,
) {
  await assertCoordinatorVerificationAuthority(
    coordinatorVerificationAuthority,
    testOnlyCoordinator,
  );
  const systemTemp = await captureSystemTemp();
  let entries;
  try {
    entries = await readdir(systemTemp.realRoot, { withFileTypes: true });
  } catch {
    fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
      "SYSTEM_TEMP_ENUMERATION_FAILED",
    ]);
  }
  const locators = [];
  for (const entry of entries.sort((left, right) =>
    compareText(left.name, right.name),
  )) {
    const match = entry.name.match(ROOT_DISCOVERY_PATTERN);
    if (match === null) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_JOURNAL_ROOT_TYPE_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
    const rootPath = join(systemTemp.realRoot, entry.name);
    const rootIdentity = await assertDirectory(
      rootPath,
      rootPath,
      null,
      "RECOVERY_DISCOVERY_ROOT_PROVENANCE_INVALID",
    );
    let rootEntries;
    try {
      rootEntries = await readdir(rootPath, { withFileTypes: true });
    } catch {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_JOURNAL_ROOT_ENUMERATION_FAILED",
      ]);
    }
    if (
      rootEntries.length !== 1 ||
      rootEntries[0].name !== JOURNAL_FILE_NAME ||
      !rootEntries[0].isFile() ||
      rootEntries[0].isSymbolicLink()
    ) {
      // Legacy pre-coordinator roots are intentionally preserved but are not
      // recoverable through this signed boundary.
      continue;
    }
    const journalPath = join(rootPath, JOURNAL_FILE_NAME);
    let fileStat;
    try {
      fileStat = await lstat(journalPath, { bigint: true });
    } catch {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_JOURNAL_FILE_STAT_FAILED",
      ]);
    }
    if (
      statType(fileStat) !== "file" ||
      fileStat.size < 1n ||
      fileStat.size > BigInt(MAX_FILE_BYTES)
    ) {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_JOURNAL_FILE_SIZE_OR_TYPE_INVALID",
      ]);
    }
    const fileIdentity = identityOf(fileStat);
    let records;
    try {
      records = parseCanonicalRecords(
        await readBoundedJournalFile(journalPath, fileIdentity),
      );
    } catch {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_JOURNAL_CANONICAL_BOUNDED_READ_FAILED",
      ]);
    }
    const coordinatorAnchor = records[0]?.coordinatorAnchor;
    const anchorDescriptors = ownDataDescriptors(coordinatorAnchor);
    const claimedFingerprint =
      anchorDescriptors?.coordinatorFingerprintSha256?.value;
    if (
      typeof claimedFingerprint !== "string" ||
      !SHA256_PATTERN.test(claimedFingerprint) ||
      claimedFingerprint !==
        coordinatorVerificationAuthority.publicKeyFingerprintSha256
    ) {
      // An unrelated or legacy root is never deleted and never blocks
      // authority-scoped discovery.
      continue;
    }
    let coordinatorVerification;
    try {
      coordinatorVerification = await verifyCoordinatorAnchor(
        coordinatorVerificationAuthority,
        coordinatorAnchor,
        testOnlyCoordinator,
      );
    } catch {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "TRUSTED_FINGERPRINT_ANCHOR_SIGNATURE_INVALID_EVIDENCE_PRESERVED",
      ]);
    }
    const payload = coordinatorVerification.payload;
    const payloadKeys = [
      "authorizationReceiptDigest",
      "contract",
      "fileIdentity",
      "journalPath",
      "rootIdentity",
      "rootPath",
      "runToken",
      "signerFingerprintSha256",
      "systemTempIdentity",
      "systemTempRealPath",
    ];
    if (
      !exactKeys(payload, payloadKeys) ||
      payload.contract !== COORDINATOR_ANCHOR_PAYLOAD_CONTRACT ||
      payload.journalPath !== journalPath ||
      payload.rootPath !== rootPath ||
      payload.runToken !== match[1] ||
      payload.systemTempRealPath !== systemTemp.realRoot ||
      !sameIdentity(
        validateIdentity(payload.fileIdentity, "FILE_IDENTITY_INVALID"),
        fileIdentity,
      ) ||
      !sameIdentity(
        validateIdentity(payload.rootIdentity, "ROOT_IDENTITY_INVALID"),
        rootIdentity,
      ) ||
      !sameIdentity(
        validateIdentity(
          payload.systemTempIdentity,
          "SYSTEM_TEMP_IDENTITY_INVALID",
        ),
        systemTemp.identity,
      )
    ) {
      fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_DENIED", [
        "COORDINATOR_ANCHOR_DISCOVERED_PATH_OR_IDENTITY_MISMATCH",
      ]);
    }
    const locator = buildLocator({
      authorizationReceiptDigest: payload.authorizationReceiptDigest,
      coordinatorAnchor: coordinatorVerification.anchor,
      fileIdentity,
      journalPath,
      rootIdentity,
      rootPath,
      runToken: payload.runToken,
      signerFingerprintSha256: payload.signerFingerprintSha256,
      systemTemp,
    });
    await readAndVerify(
      locator,
      coordinatorVerificationAuthority,
      testOnlyCoordinator,
    );
    locators.push(locator);
  }
  return deepFreeze(locators);
}

export async function discoverCurrent180Current190PostgresqlRehearsalJournalRecoveryLocators(
  coordinatorVerificationAuthority,
) {
  if (arguments.length !== 1) {
    fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_INPUT_INVALID", [
      "EXACT_PUBLIC_VERIFICATION_AUTHORITY_REQUIRED",
    ]);
  }
  return discoverJournalRecoveryLocatorsInternal(
    coordinatorVerificationAuthority,
    false,
  );
}

export async function discoverCurrent180Current190PostgresqlRehearsalJournalRecoveryLocatorsForTestOnly(
  coordinatorAuthority,
) {
  if (arguments.length !== 1) {
    fail("REHEARSAL_JOURNAL_RECOVERY_DISCOVERY_INPUT_INVALID", [
      "EXACT_TEST_COORDINATOR_AUTHORITY_REQUIRED",
    ]);
  }
  return discoverJournalRecoveryLocatorsInternal(coordinatorAuthority, true);
}

function recoveryCleanupReceiptDocument(verified, cleanupStage) {
  return {
    authorization: NO_AUTHORITY,
    authorizationReceiptDigest: verified.locator.authorizationReceiptDigest,
    cleanupStage,
    contract:
      CURRENT180_CURRENT190_POSTGRESQL_REHEARSAL_JOURNAL_RECOVERY_RECEIPT_CONTRACT,
    coordinatorAnchorDigest: verified.locator.coordinatorAnchorDigest,
    coordinatorFingerprintSha256: verified.locator.coordinatorFingerprintSha256,
    journalRootAbsent: cleanupStage === "ROOT_REMOVED",
    locatorDigest: verified.locator.locatorDigest,
    runToken: verified.locator.runToken,
    signerFingerprintSha256: verified.locator.signerFingerprintSha256,
    status:
      cleanupStage === "ROOT_REMOVED"
        ? "COORDINATOR_SIGNED_JOURNAL_ALREADY_ABSENT"
        : "COORDINATOR_SIGNED_JOURNAL_REHYDRATED_FOR_EXACT_CLEANUP",
    verified: true,
  };
}

async function inspectJournalRecoveryCleanupState(
  coordinatorVerificationAuthority,
  locatorInput,
  testOnlyCoordinator,
) {
  const { coordinatorVerification, locator } = await verifyLocatorTrust(
    locatorInput,
    coordinatorVerificationAuthority,
    testOnlyCoordinator,
  );
  const systemTemp = await captureSystemTemp();
  if (
    !sameNativePath(systemTemp.realRoot, locator.systemTempRealPath) ||
    !sameIdentity(systemTemp.identity, locator.systemTempIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_RECOVERY_DENIED", [
      "SYSTEM_TEMP_IDENTITY_DRIFT_EVIDENCE_PRESERVED",
    ]);
  }
  const state = {
    authorizationReceiptDigest: locator.authorizationReceiptDigest,
    cleanupStage: "JOURNAL_FILE_PRESENT",
    coordinatorAnchor: coordinatorVerification.anchor,
    coordinatorVerificationAuthority,
    expectedByteLength: 0,
    fileIdentity: locator.fileIdentity,
    journalPath: locator.journalPath,
    lastPhase: null,
    lastRecordDigest: null,
    lastSequence: null,
    locator,
    privateKey: null,
    rootIdentity: locator.rootIdentity,
    rootPath: locator.rootPath,
    runToken: locator.runToken,
    signerFingerprintSha256: locator.signerFingerprintSha256,
    status: "RECOVERY_REHYDRATING",
    systemTemp: {
      identity: locator.systemTempIdentity,
      realRoot: locator.systemTempRealPath,
    },
    testOnlyCoordinator,
  };
  let rootStat;
  try {
    rootStat = await lstat(locator.rootPath, { bigint: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("REHEARSAL_JOURNAL_RECOVERY_DENIED", [
        "JOURNAL_ROOT_PRESENCE_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
  }
  if (rootStat === undefined) {
    state.cleanupStage = "ROOT_REMOVED";
    await assertOwnedRootAbsent(
      state,
      "SIGNED_JOURNAL_ROOT_ABSENCE_NOT_PROVABLE",
    );
    return { state, verified: { coordinatorVerification, locator } };
  }
  if (
    statType(rootStat) !== "directory" ||
    !sameIdentity(identityOf(rootStat), locator.rootIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_RECOVERY_DENIED", [
      "JOURNAL_ROOT_REPLACEMENT_EVIDENCE_PRESERVED",
    ]);
  }
  await assertDirectory(
    locator.rootPath,
    locator.rootPath,
    locator.rootIdentity,
    "JOURNAL_ROOT_RECOVERY_PROVENANCE_DRIFT",
  );
  let fileStat;
  try {
    fileStat = await lstat(locator.journalPath, { bigint: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("REHEARSAL_JOURNAL_RECOVERY_DENIED", [
        "JOURNAL_FILE_PRESENCE_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
  }
  if (fileStat === undefined) {
    const entries = await exactTreeEntries(locator.rootPath);
    if (entries.length !== 0) {
      fail("REHEARSAL_JOURNAL_RECOVERY_DENIED", [
        "PARTIAL_JOURNAL_ROOT_CONTAINS_UNTRUSTED_ENTRIES",
      ]);
    }
    state.cleanupStage = "JOURNAL_FILE_REMOVED_ROOT_PRESENT";
    return { state, verified: { coordinatorVerification, locator } };
  }
  if (
    statType(fileStat) !== "file" ||
    !sameIdentity(identityOf(fileStat), locator.fileIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_RECOVERY_DENIED", [
      "JOURNAL_FILE_REPLACEMENT_EVIDENCE_PRESERVED",
    ]);
  }
  const verified = await readAndVerify(
    locator,
    coordinatorVerificationAuthority,
    testOnlyCoordinator,
  );
  state.expectedByteLength = verified.byteLength;
  state.lastPhase = verified.lastPhase;
  state.lastRecordDigest = verified.lastRecordDigest;
  state.lastSequence = verified.lastSequence;
  return { state, verified };
}

async function rehydrateJournalRecoveryInternal(
  coordinatorVerificationAuthority,
  locator,
  testOnlyCoordinator,
) {
  const { state, verified } = await inspectJournalRecoveryCleanupState(
    coordinatorVerificationAuthority,
    locator,
    testOnlyCoordinator,
  );
  const document = recoveryCleanupReceiptDocument(verified, state.cleanupStage);
  const receipt = deepFreeze({
    ...document,
    recoveryReceiptDigest: sha256(canonicalJson(document)),
  });
  recoveryReceiptStates.set(receipt, {
    active: true,
    cleaned: state.cleanupStage === "ROOT_REMOVED",
    state,
    testOnly: testOnlyCoordinator,
  });
  return receipt;
}

export async function rehydrateCurrent180Current190PostgresqlRehearsalJournalRecovery(
  coordinatorVerificationAuthority,
  locator,
) {
  if (arguments.length !== 2) {
    fail("REHEARSAL_JOURNAL_RECOVERY_INPUT_INVALID", [
      "EXACT_PUBLIC_VERIFICATION_AUTHORITY_AND_SIGNED_LOCATOR_REQUIRED",
    ]);
  }
  return rehydrateJournalRecoveryInternal(
    coordinatorVerificationAuthority,
    locator,
    false,
  );
}

export async function rehydrateCurrent180Current190PostgresqlRehearsalJournalRecoveryForTestOnly(
  coordinatorAuthority,
  locator,
) {
  if (arguments.length !== 2) {
    fail("REHEARSAL_JOURNAL_RECOVERY_INPUT_INVALID", [
      "EXACT_TEST_COORDINATOR_AND_SIGNED_LOCATOR_REQUIRED",
    ]);
  }
  return rehydrateJournalRecoveryInternal(coordinatorAuthority, locator, true);
}

export function assertCurrent180Current190PostgresqlRehearsalJournalRecoveryReceipt(
  receipt,
) {
  if (arguments.length !== 1 || isProxy(receipt)) {
    fail("REHEARSAL_JOURNAL_RECOVERY_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  const state = recoveryReceiptStates.get(receipt);
  if (state === undefined || state.testOnly || !state.active) {
    fail("REHEARSAL_JOURNAL_RECOVERY_RECEIPT_INVALID", [
      "FRESH_PRODUCTION_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  return receipt;
}

export function assertCurrent180Current190PostgresqlRehearsalJournalRecoveryReceiptForTestOnly(
  receipt,
) {
  if (arguments.length !== 1 || isProxy(receipt)) {
    fail("REHEARSAL_JOURNAL_RECOVERY_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_TEST_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  const state = recoveryReceiptStates.get(receipt);
  if (state === undefined || !state.testOnly || !state.active) {
    fail("REHEARSAL_JOURNAL_RECOVERY_RECEIPT_INVALID", [
      "FRESH_TEST_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  return receipt;
}

async function performCleanup(state, testFault = null) {
  if (
    ![
      "JOURNAL_FILE_PRESENT",
      "JOURNAL_FILE_REMOVAL_AMBIGUOUS",
      "JOURNAL_FILE_REMOVED_ROOT_PRESENT",
      "ROOT_REMOVAL_AMBIGUOUS",
      "ROOT_REMOVED",
    ].includes(state.cleanupStage)
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", ["CLEANUP_STAGE_INVALID"]);
  }
  await assertDirectory(
    state.systemTemp.realRoot,
    state.systemTemp.realRoot,
    state.systemTemp.identity,
    "SYSTEM_TEMP_PRE_CLEANUP_DRIFT",
  );
  if (state.cleanupStage === "JOURNAL_FILE_REMOVAL_AMBIGUOUS") {
    await reconcileAmbiguousJournalFileRemoval(state);
  }
  if (state.cleanupStage === "ROOT_REMOVAL_AMBIGUOUS") {
    await reconcileAmbiguousRootRemoval(state);
  }
  if (state.cleanupStage === "ROOT_REMOVED") {
    await assertOwnedRootAbsent(
      state,
      "JOURNAL_ROOT_ABSENCE_RECONCILIATION_FAILED",
    );
    return;
  }
  await assertDirectory(
    state.rootPath,
    state.rootPath,
    state.rootIdentity,
    "JOURNAL_ROOT_PRE_CLEANUP_DRIFT",
  );
  if (state.cleanupStage === "JOURNAL_FILE_PRESENT") {
    await assertExactJournalTree(state);
    await verifyLocatorProvenance(state.locator);
    await assertDirectory(
      state.rootPath,
      state.rootPath,
      state.rootIdentity,
      "JOURNAL_ROOT_PRE_UNLINK_DRIFT",
    );
    await assertFile(
      state.journalPath,
      state.journalPath,
      state.fileIdentity,
      "JOURNAL_FILE_PRE_UNLINK_DRIFT",
    );
    state.cleanupStage = "JOURNAL_FILE_REMOVAL_AMBIGUOUS";
    if (testFault === "JOURNAL_FILE_REMOVAL_NOT_APPLIED_RESPONSE_LOST") {
      fail("REHEARSAL_JOURNAL_CLEANUP_RESPONSE_LOST", [
        "JOURNAL_FILE_REMOVAL_OUTCOME_UNKNOWN",
      ]);
    }
    await unlink(state.journalPath);
    await syncDirectoryBestEffort(state.rootPath);
    if (testFault === "AFTER_DURABLE_FILE_REMOVAL") {
      fail("REHEARSAL_JOURNAL_CLEANUP_RESPONSE_LOST", [
        "JOURNAL_FILE_REMOVAL_DURABLE_RESPONSE_LOST",
      ]);
    }
    state.cleanupStage = "JOURNAL_FILE_REMOVED_ROOT_PRESENT";
  }
  const remaining = await exactTreeEntries(state.rootPath);
  if (remaining.length !== 0) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
      "JOURNAL_ROOT_NOT_EMPTY_AFTER_FILE_REMOVAL",
    ]);
  }
  await assertDirectory(
    state.systemTemp.realRoot,
    state.systemTemp.realRoot,
    state.systemTemp.identity,
    "SYSTEM_TEMP_PRE_ROOT_REMOVE_DRIFT",
  );
  await assertDirectory(
    state.rootPath,
    state.rootPath,
    state.rootIdentity,
    "JOURNAL_ROOT_PRE_REMOVE_DRIFT",
  );
  const rootRemovalStat = await lstat(state.rootPath, { bigint: true });
  if (
    statType(rootRemovalStat) !== "directory" ||
    !sameIdentity(identityOf(rootRemovalStat), state.rootIdentity)
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_DENIED", [
      "JOURNAL_ROOT_PRE_REMOVE_IDENTITY_DRIFT",
    ]);
  }
  state.rootRemovalIdentity = removalIdentityOf(rootRemovalStat);
  state.cleanupStage = "ROOT_REMOVAL_AMBIGUOUS";
  if (testFault === "ROOT_REMOVAL_NOT_APPLIED_RESPONSE_LOST") {
    fail("REHEARSAL_JOURNAL_CLEANUP_RESPONSE_LOST", [
      "JOURNAL_ROOT_REMOVAL_OUTCOME_UNKNOWN",
    ]);
  }
  await rmdir(state.rootPath);
  await syncDirectoryBestEffort(state.systemTemp.realRoot);
  if (testFault === "AFTER_DURABLE_ROOT_REMOVAL") {
    fail("REHEARSAL_JOURNAL_CLEANUP_RESPONSE_LOST", [
      "JOURNAL_ROOT_REMOVAL_DURABLE_RESPONSE_LOST",
    ]);
  }
  state.cleanupStage = "ROOT_REMOVED";
  await assertOwnedRootAbsent(
    state,
    "JOURNAL_ROOT_ABSENCE_RECONCILIATION_FAILED",
  );
}

async function cleanupInternal(journal, testFault) {
  const state = requireJournalHandle(journal);
  state.status = "CLEANING";
  state.cleanupStage = "JOURNAL_FILE_PRESENT";
  invalidateVerificationReceipts(state.locator);
  try {
    await performCleanup(state, testFault);
    state.status = "CLEANED";
    state.privateKey = null;
    return deepFreeze({
      authorization: NO_AUTHORITY,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_CLEANUP_RECEIPT_V1",
      effects: {
        journalFileRemoved: true,
        recursiveRemovalUsed: false,
        rootRemoved: true,
      },
      reconciledPriorRemoval: false,
      rootAbsent: true,
      runToken: state.runToken,
      status: "OWNED_JOURNAL_REMOVED_WITH_ZERO_RESIDUE",
    });
  } catch (error) {
    state.status = "MANUAL_INSPECTION_REQUIRED";
    const receipt = issueManualInspectionReceipt(
      state,
      error instanceof Current180Current190PostgresqlRehearsalJournalError
        ? error.code
        : "UNEXPECTED_CLEANUP_FAILURE",
      state.cleanupStage,
    );
    fail(
      "REHEARSAL_JOURNAL_CLEANUP_INCOMPLETE",
      ["MANUAL_INSPECTION_REQUIRED"],
      receipt,
    );
  }
}

async function cleanupJournalRecoveryInternal(
  receipt,
  testOnlyCall,
  testFault,
) {
  if (isProxy(receipt) || !recoveryReceiptStates.has(receipt)) {
    fail("REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INPUT_INVALID", [
      "EXACT_MODULE_BRANDED_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  const recovery = recoveryReceiptStates.get(receipt);
  if (!recovery.active || recovery.testOnly !== testOnlyCall) {
    fail("REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INPUT_INVALID", [
      recovery.testOnly !== testOnlyCall
        ? "RECOVERY_RECEIPT_DEPENDENCY_BOUNDARY_MISMATCH"
        : "RECOVERY_RECEIPT_STALE",
    ]);
  }
  if (recovery.cleaned) {
    recovery.active = false;
    return deepFreeze({
      authorization: NO_AUTHORITY,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_RESTART_CLEANUP_V1",
      reconciledPriorRemoval: true,
      rootAbsent: true,
      runToken: recovery.state.runToken,
      status: "SIGNED_JOURNAL_ROOT_ALREADY_ABSENT_ZERO_RESIDUE",
    });
  }
  const startingStage = recovery.state.cleanupStage;
  try {
    const refreshed = await inspectJournalRecoveryCleanupState(
      recovery.state.coordinatorVerificationAuthority,
      recovery.state.locator,
      recovery.state.testOnlyCoordinator,
    );
    recovery.state = refreshed.state;
    const reconciledStage = recovery.state.cleanupStage;
    await performCleanup(recovery.state, testFault);
    recovery.cleaned = true;
    recovery.active = false;
    invalidateVerificationReceipts(recovery.state.locator);
    return deepFreeze({
      authorization: NO_AUTHORITY,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_RESTART_CLEANUP_V1",
      reconciledPriorRemoval:
        startingStage !== "JOURNAL_FILE_PRESENT" ||
        reconciledStage !== "JOURNAL_FILE_PRESENT",
      rootAbsent: true,
      runToken: recovery.state.runToken,
      status: "COORDINATOR_SIGNED_JOURNAL_REMOVED_AFTER_RESTART_ZERO_RESIDUE",
    });
  } catch (error) {
    fail("REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INCOMPLETE", [
      error instanceof Current180Current190PostgresqlRehearsalJournalError
        ? error.code
        : "UNEXPECTED_RECOVERY_CLEANUP_FAILURE",
      "SIGNED_EVIDENCE_PRESERVED_FOR_BOUNDED_RETRY",
    ]);
  }
}

export async function cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestart(
  receipt,
) {
  if (arguments.length !== 1) {
    fail("REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INPUT_INVALID", [
      "EXACT_PRODUCTION_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  return cleanupJournalRecoveryInternal(receipt, false, null);
}

export async function cleanupCurrent180Current190PostgresqlRehearsalJournalAfterRestartForTestOnly(
  receipt,
  options = {},
) {
  if (arguments.length < 1 || arguments.length > 2) {
    fail("REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INPUT_INVALID", [
      "EXACT_TEST_RECOVERY_RECEIPT_AND_OPTIONAL_FAULT_REQUIRED",
    ]);
  }
  const descriptors = ownDataDescriptors(options);
  if (
    descriptors === null ||
    Object.keys(descriptors).some((key) => key !== "fault") ||
    (Object.hasOwn(descriptors, "fault") &&
      ![
        "AFTER_DURABLE_FILE_REMOVAL",
        "AFTER_DURABLE_ROOT_REMOVAL",
        "JOURNAL_FILE_REMOVAL_NOT_APPLIED_RESPONSE_LOST",
        "ROOT_REMOVAL_NOT_APPLIED_RESPONSE_LOST",
      ].includes(descriptors.fault.value))
  ) {
    fail("REHEARSAL_JOURNAL_RECOVERY_CLEANUP_INPUT_INVALID", [
      "SUPPORTED_TEST_ONLY_RECOVERY_CLEANUP_FAULT_REQUIRED",
    ]);
  }
  return cleanupJournalRecoveryInternal(
    receipt,
    true,
    Object.hasOwn(descriptors, "fault") ? descriptors.fault.value : null,
  );
}

export async function cleanupCurrent180Current190PostgresqlRehearsalJournal(
  journal,
) {
  if (arguments.length !== 1) {
    fail("REHEARSAL_JOURNAL_CLEANUP_INPUT_INVALID", [
      "EXACT_JOURNAL_HANDLE_REQUIRED",
    ]);
  }
  return cleanupInternal(journal, null);
}

export async function cleanupCurrent180Current190PostgresqlRehearsalJournalForTestOnly(
  journal,
  options,
) {
  if (arguments.length !== 2) {
    fail("REHEARSAL_JOURNAL_CLEANUP_INPUT_INVALID", [
      "EXACT_TEST_ONLY_CLEANUP_ARGUMENTS_REQUIRED",
    ]);
  }
  const snapshot = snapshotFlatData(
    options,
    ["fault"],
    "REHEARSAL_JOURNAL_CLEANUP_INPUT_INVALID",
    "EXACT_TEST_ONLY_CLEANUP_FAULT_REQUIRED",
  );
  if (
    ![
      "AFTER_DURABLE_FILE_REMOVAL",
      "AFTER_DURABLE_ROOT_REMOVAL",
      "JOURNAL_FILE_REMOVAL_NOT_APPLIED_RESPONSE_LOST",
      "ROOT_REMOVAL_NOT_APPLIED_RESPONSE_LOST",
    ].includes(snapshot.fault)
  ) {
    fail("REHEARSAL_JOURNAL_CLEANUP_INPUT_INVALID", [
      "SUPPORTED_TEST_ONLY_CLEANUP_FAULT_REQUIRED",
    ]);
  }
  return cleanupInternal(journal, snapshot.fault);
}

export function assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
  receipt,
) {
  if (arguments.length !== 1 || isProxy(receipt)) {
    fail("REHEARSAL_JOURNAL_MANUAL_INSPECTION_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_MANUAL_INSPECTION_RECEIPT_REQUIRED",
    ]);
  }
  const state = manualInspectionStates.get(receipt);
  if (state === undefined) {
    fail("REHEARSAL_JOURNAL_MANUAL_INSPECTION_RECEIPT_INVALID", [
      "EXACT_MODULE_BRANDED_MANUAL_INSPECTION_RECEIPT_REQUIRED",
    ]);
  }
  if (!state.active || state.state.latestManualReceipt !== receipt) {
    fail("REHEARSAL_JOURNAL_MANUAL_INSPECTION_RECEIPT_INVALID", [
      "MANUAL_INSPECTION_RECEIPT_STALE",
    ]);
  }
  return receipt;
}

export async function cleanupCurrent180Current190PostgresqlRehearsalJournalAfterManualInspection(
  receipt,
) {
  if (arguments.length !== 1) {
    fail("REHEARSAL_JOURNAL_MANUAL_CLEANUP_INPUT_INVALID", [
      "EXACT_MANUAL_INSPECTION_RECEIPT_REQUIRED",
    ]);
  }
  assertCurrent180Current190PostgresqlRehearsalJournalManualInspectionReceipt(
    receipt,
  );
  const manual = manualInspectionStates.get(receipt);
  const state = manual.state;
  const startingCleanupStage = manual.cleanupStage;
  try {
    if (state.kind === "BIND_FAILURE") {
      const cleaned = await safeCleanupNewlyOwnedPaths(state);
      if (!cleaned) {
        fail("REHEARSAL_JOURNAL_MANUAL_CLEANUP_INCOMPLETE", [
          "BIND_FAILURE_PATHS_STILL_AMBIGUOUS",
        ]);
      }
      manual.active = false;
      state.status = "CLEANED";
      return deepFreeze({
        authorization: NO_AUTHORITY,
        contract:
          "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_CLEANUP_RECEIPT_V1",
        effects: {
          journalFileRemoved: state.fileIdentity !== undefined,
          recursiveRemovalUsed: false,
          rootRemoved: true,
        },
        reconciledPriorRemoval: [
          "JOURNAL_FILE_REMOVAL_AMBIGUOUS",
          "ROOT_REMOVAL_AMBIGUOUS",
          "ROOT_REMOVED",
        ].includes(startingCleanupStage),
        rootAbsent: true,
        runToken: state.runToken,
        status: "MANUALLY_INSPECTED_PARTIAL_BIND_ROOT_REMOVED",
      });
    }
    if (state.cleanupStage !== manual.cleanupStage) {
      fail("REHEARSAL_JOURNAL_MANUAL_CLEANUP_INCOMPLETE", [
        "MANUAL_INSPECTION_RECEIPT_STAGE_STALE",
      ]);
    }
    await performCleanup(state);
    manual.active = false;
    state.status = "CLEANED";
    state.privateKey = null;
    invalidateVerificationReceipts(state.locator);
    return deepFreeze({
      authorization: NO_AUTHORITY,
      contract:
        "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_REHEARSAL_JOURNAL_CLEANUP_RECEIPT_V1",
      effects: {
        journalFileRemoved: true,
        recursiveRemovalUsed: false,
        rootRemoved: true,
      },
      reconciledPriorRemoval: [
        "JOURNAL_FILE_REMOVAL_AMBIGUOUS",
        "ROOT_REMOVAL_AMBIGUOUS",
        "ROOT_REMOVED",
      ].includes(startingCleanupStage),
      rootAbsent: true,
      runToken: state.runToken,
      status: "MANUALLY_INSPECTED_OWNED_JOURNAL_REMOVED",
    });
  } catch {
    manual.active = false;
    const replacement = issueManualInspectionReceipt(
      state,
      "MANUAL_INSPECTION_CLEANUP_STILL_AMBIGUOUS",
      state.cleanupStage,
    );
    fail(
      "REHEARSAL_JOURNAL_MANUAL_CLEANUP_INCOMPLETE",
      ["MANUAL_INSPECTION_STILL_REQUIRED"],
      replacement,
    );
  }
}

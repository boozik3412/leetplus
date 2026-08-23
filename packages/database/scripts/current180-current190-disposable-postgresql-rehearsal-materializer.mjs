import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rmdir,
  unlink,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

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

export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZER_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZER_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECEIPT_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECEIPT_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_RUNNER_VERIFICATION_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_RUNNER_TREE_VERIFICATION_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MANUAL_INSPECTION_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MANUAL_INSPECTION_RECEIPT_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_LOCATOR_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_LOCATOR_V1";
export const CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_RECEIPT_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_RECEIPT_V1";

const EXPECTED_ARTIFACT_CONTRACT =
  "CURRENT180_CURRENT190_FROZEN_IN_MEMORY_ARTIFACT_V1";
const EXPECTED_ARTIFACT_STATUS =
  "FROZEN_IN_MEMORY_ARTIFACT_ASSEMBLED_NOT_RUNNABLE";
const EXPECTED_ALLOW_MANIFEST_SHA256 =
  "e71c211f5f6743f9784c8a9d2b089c1679ea27613c62387168d33c6e152fa32d";
const EXPECTED_REFREEZE_MANIFEST_SHA256 =
  "00d2fed693e7085c6c8fa672635a92af6da2450eea8afaabcb643bd296cf9087";
const EXPECTED_ASSEMBLY_PLAN_DIGEST =
  "950f27403e48793147a7f3afef4fcd4016d06aee9eb8872ef0357da6b1fd6b1e";
const EXPECTED_ENTRY_MANIFEST_DIGEST =
  "00513bf5b31bbf37dd0d82fe025fed72c29c17fe3e26aad8bfa273c2829ed89a";
const EXPECTED_IN_MEMORY_ARTIFACT_DIGEST =
  "fdfa3af95281b9a7bc7b4127adcd8101d1a47ea951a2729139b05df3bf2dc9b1";
const EXPECTED_MIGRATION_MANIFEST_DIGEST =
  "3220929d1a33fd20748de14427bf3bd041e1c20445d9525b7fb0a560f8baf476";
const EXPECTED_MIGRATION_HEAD =
  "20260805040000_guest_portal_session_current190";
const EXPECTED_MIGRATION_HEAD_SHA256 =
  "d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5";
const EXPECTED_ENTRY_COUNT = 193;
const EXPECTED_MIGRATION_COUNT = 191;
const OWNERSHIP_MARKER_NAME = ".leetplus-current180-current190-owner.json";
const RECOVERY_ANCHOR_NAME =
  ".leetplus-current180-current190-recovery-anchor.json";
const RECOVERY_ANCHOR_PURPOSE = "MATERIALIZER_RECOVERY_ANCHOR";
const RECOVERY_ANCHOR_PAYLOAD_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZER_RECOVERY_ANCHOR_PAYLOAD_V1";
const RECOVERY_LOCATOR_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT180_CURRENT190_MATERIALIZER_RECOVERY_LOCATOR_DIGEST_V1";
const MAX_RECOVERY_ANCHOR_BYTES = 512 * 1024;
const ROOT_NAME_PREFIX = "lp-c180190-";
const ROOT_DISCOVERY_PATTERN = /^lp-c180190-([0-9a-f]{64})-[A-Za-z0-9]{6}$/u;
const RANDOM_TOKEN_PATTERN = /^[0-9a-f]{64}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MIGRATION_DIRECTORY_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const MKDTEMP_SUFFIX_PATTERN = /^[A-Za-z0-9]{6}$/u;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");

const receiptStates = new WeakMap();
const runnerVerificationStates = new WeakMap();
const manualInspectionStates = new WeakMap();
const recoveryReceiptStates = new WeakMap();

export class Current180Current190DisposablePostgresqlMaterializerError extends Error {
  constructor(code, findings, manualInspectionReceipt = null) {
    super(
      "CURRENT180-CURRENT190 disposable PostgreSQL materializer failed closed.",
    );
    this.name = "Current180Current190DisposablePostgresqlMaterializerError";
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

function fail(code, findings) {
  throw new Current180Current190DisposablePostgresqlMaterializerError(
    code,
    findings,
  );
}

function snapshotDataOnly(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_NON_JSON_NUMBER_REJECTED",
      ]);
    }
    return value;
  }
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_DATA_ONLY_SNAPSHOT_REJECTED",
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
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_ACCESSOR_OR_SYMBOL_REJECTED",
    ]);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_ARRAY_PROTOTYPE_REJECTED",
      ]);
    }
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      keys.length !== length + 1 ||
      !Object.hasOwn(descriptors, "length")
    ) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_SPARSE_OR_EXTENDED_ARRAY_REJECTED",
      ]);
    }
    const snapshot = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined) {
        fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
          "ARTIFACT_SPARSE_OR_EXTENDED_ARRAY_REJECTED",
        ]);
      }
      snapshot.push(snapshotDataOnly(descriptor.value, seen));
    }
    seen.delete(value);
    return snapshot;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_OBJECT_PROTOTYPE_REJECTED",
    ]);
  }
  const snapshot = {};
  for (const key of keys) {
    Object.defineProperty(snapshot, key, {
      configurable: true,
      enumerable: true,
      value: snapshotDataOnly(descriptors[key].value, seen),
      writable: true,
    });
  }
  seen.delete(value);
  return snapshot;
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

function isStrictRelativePosixPath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    posix.normalize(value) !== value
  ) {
    return false;
  }
  return !value
    .split("/")
    .some((component) =>
      ["", ".", "..", OWNERSHIP_MARKER_NAME, RECOVERY_ANCHOR_NAME].includes(
        component,
      ),
    );
}

function isStrictDescendant(path, parent) {
  const pathRelativeToParent = relative(parent, path);
  return (
    pathRelativeToParent.length > 0 &&
    pathRelativeToParent !== ".." &&
    !pathRelativeToParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathRelativeToParent)
  );
}

function sameNativePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform() === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
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

function validateRecoveryIdentity(value, finding) {
  const descriptors = ownDataDescriptors(value);
  if (
    descriptors === null ||
    !exactKeys(value, ["dev", "ino"]) ||
    typeof descriptors.dev.value !== "string" ||
    typeof descriptors.ino.value !== "string" ||
    !/^\d+$/u.test(descriptors.dev.value) ||
    !/^\d+$/u.test(descriptors.ino.value)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_LOCATOR_INVALID", [finding]);
  }
  return Object.freeze({
    dev: descriptors.dev.value,
    ino: descriptors.ino.value,
  });
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

async function signRecoveryAnchor(
  coordinatorAuthority,
  coordinatorRunBinding,
  payload,
  testOnly,
) {
  const input = { payload, purpose: RECOVERY_ANCHOR_PURPOSE };
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

async function verifyRecoveryAnchor(
  coordinatorAuthority,
  coordinatorAnchor,
  testOnly,
) {
  const input = { purpose: RECOVERY_ANCHOR_PURPOSE };
  return testOnly
    ? verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchorForTestOnly(
        coordinatorAuthority,
        coordinatorAnchor,
        input,
      )
    : verifyCurrent180Current190PostgresqlRehearsalCoordinatorAnchor(
        coordinatorAuthority,
        coordinatorAnchor,
        input,
      );
}

function nativePathFromArtifact(root, artifactPath) {
  const target = resolve(root, ...artifactPath.split("/"));
  if (!isStrictDescendant(target, root)) {
    fail("DISPOSABLE_MATERIALIZER_PATH_INVALID", [
      "ARTIFACT_PATH_ESCAPES_OWNED_ROOT",
    ]);
  }
  return target;
}

function migrationManifestDigest(entries) {
  return sha256(
    `${entries
      .map(({ name, sha256: digest }) => `${name} ${digest}`)
      .join("\n")}\n`,
  );
}

function entryManifestDigest(entries) {
  return sha256(
    `${entries
      .map(({ path, sha256: digest }) => `${path} ${digest}`)
      .join("\n")}\n`,
  );
}

function expectedArtifactEnvelope(artifact) {
  const publicArtifact = { ...artifact };
  delete publicArtifact.inMemoryArtifactDigest;
  return {
    ...publicArtifact,
    entries: artifact.entries.map(
      ({ byteLength, path, sha256: digest, sourceKind }) => ({
        byteLength,
        path,
        sha256: digest,
        sourceKind,
      }),
    ),
  };
}

function validateArtifact(candidate) {
  const artifact = snapshotDataOnly(candidate);
  const topLevelKeys = [
    "allowManifestSha256",
    "assemblyBoundary",
    "assemblyPlanDigest",
    "authorization",
    "contract",
    "current187EAuxiliaryExcluded",
    "effects",
    "entries",
    "entryCount",
    "entryManifestDigest",
    "inMemoryArtifactDigest",
    "migrationCount",
    "migrationHead",
    "migrationHeadChecksum",
    "migrationManifestDigest",
    "refreezeManifestSha256",
    "status",
  ];
  if (!exactKeys(artifact, topLevelKeys)) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_TOP_LEVEL_SHAPE_INVALID",
    ]);
  }
  if (
    artifact.contract !== EXPECTED_ARTIFACT_CONTRACT ||
    artifact.status !== EXPECTED_ARTIFACT_STATUS ||
    artifact.allowManifestSha256 !== EXPECTED_ALLOW_MANIFEST_SHA256 ||
    artifact.refreezeManifestSha256 !== EXPECTED_REFREEZE_MANIFEST_SHA256 ||
    artifact.assemblyPlanDigest !== EXPECTED_ASSEMBLY_PLAN_DIGEST ||
    artifact.entryManifestDigest !== EXPECTED_ENTRY_MANIFEST_DIGEST ||
    artifact.inMemoryArtifactDigest !== EXPECTED_IN_MEMORY_ARTIFACT_DIGEST ||
    artifact.migrationManifestDigest !== EXPECTED_MIGRATION_MANIFEST_DIGEST ||
    artifact.migrationHead !== EXPECTED_MIGRATION_HEAD ||
    artifact.migrationHeadChecksum !== EXPECTED_MIGRATION_HEAD_SHA256 ||
    artifact.entryCount !== EXPECTED_ENTRY_COUNT ||
    artifact.migrationCount !== EXPECTED_MIGRATION_COUNT ||
    artifact.current187EAuxiliaryExcluded !== true
  ) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_PINNED_IDENTITY_MISMATCH",
    ]);
  }

  const expectedAssemblyBoundary = {
    callerSuppliedOutputPathAccepted: false,
    databaseConnectionAllowed: false,
    filesystemCleanupAllowed: false,
    filesystemWriteAllowed: false,
    immutableResultRequired: true,
    networkCallAllowed: false,
    outputKind: "FROZEN_IN_MEMORY_UTF8_TEXT",
    processSpawnAllowed: false,
    repositorySourceProvenanceRequired: true,
    transitiveInspectorSourcePinRequired: true,
  };
  const expectedAuthorization = {
    canApplyDatabase: false,
    canCallExternalProviders: false,
    canConnectDatabase: false,
    canDeploy: false,
    canMaterializeFilesystem: false,
    canMutateCanonicalMigrations: false,
    canMutateProduction: false,
    canProvisionRolesOrGrants: false,
    canSpawnProcess: false,
    productionApplyAuthorized: false,
    runnerConsumptionAuthorized: false,
  };
  const expectedEffects = {
    callerSuppliedEffectsUnverified: false,
    databaseConnectionOpenedByAssembler: false,
    externalProviderCallAttemptedByAssembler: false,
    filesystemReadPerformed: true,
    filesystemWriteAttemptedByAssembler: false,
    inMemoryAssemblyPerformed: true,
    migrationCommandExecutedByAssembler: false,
    networkCallAttemptedByAssembler: false,
    processSpawnAttemptedByAssembler: false,
    productionStateReadByAssembler: false,
    roleOrGrantMutationAttemptedByAssembler: false,
    routeActivationAttemptedByAssembler: false,
    scope: "ASSEMBLER_IMPLEMENTATION_ONLY",
  };
  if (
    canonicalJson(artifact.assemblyBoundary) !==
      canonicalJson(expectedAssemblyBoundary) ||
    canonicalJson(artifact.authorization) !==
      canonicalJson(expectedAuthorization) ||
    canonicalJson(artifact.effects) !== canonicalJson(expectedEffects)
  ) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_AUTHORITY_BOUNDARY_MISMATCH",
    ]);
  }

  if (
    !Array.isArray(artifact.entries) ||
    artifact.entries.length !== EXPECTED_ENTRY_COUNT
  ) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_ENTRY_COUNT_INVALID",
    ]);
  }
  const paths = [];
  const portablePaths = new Set();
  for (const entry of artifact.entries) {
    if (
      !exactKeys(entry, [
        "byteLength",
        "content",
        "path",
        "sha256",
        "sourceKind",
      ]) ||
      !isStrictRelativePosixPath(entry.path) ||
      typeof entry.content !== "string" ||
      entry.content.length === 0 ||
      entry.content.includes("\r") ||
      entry.content.includes("\0") ||
      entry.content.charCodeAt(0) === 0xfeff ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 1 ||
      !SHA256_PATTERN.test(entry.sha256) ||
      typeof entry.sourceKind !== "string" ||
      entry.sourceKind.length === 0
    ) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_ENTRY_SHAPE_INVALID",
      ]);
    }
    const portablePath = entry.path.toLowerCase();
    if (portablePaths.has(portablePath)) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_ENTRY_PATH_DUPLICATE",
      ]);
    }
    portablePaths.add(portablePath);
    const bytes = Buffer.from(entry.content, "utf8");
    if (
      bytes.length !== entry.byteLength ||
      sha256(bytes) !== entry.sha256 ||
      bytes.toString("utf8") !== entry.content
    ) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_ENTRY_CONTENT_DIGEST_MISMATCH",
      ]);
    }
    paths.push(entry.path);
  }

  if (
    paths[0] !== "schema.prisma" ||
    paths[1] !== "migrations/migration_lock.toml"
  ) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_FIXED_ENTRY_LAYOUT_INVALID",
    ]);
  }
  const migrationEntries = artifact.entries.slice(2);
  const migrationProjection = migrationEntries.map((entry) => {
    const components = entry.path.split("/");
    if (
      components.length !== 3 ||
      components[0] !== "migrations" ||
      !MIGRATION_DIRECTORY_PATTERN.test(components[1]) ||
      components[2] !== "migration.sql"
    ) {
      fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
        "ARTIFACT_MIGRATION_ENTRY_LAYOUT_INVALID",
      ]);
    }
    return { name: components[1], sha256: entry.sha256 };
  });
  const migrationNames = migrationProjection.map(({ name }) => name);
  if (
    new Set(migrationNames).size !== EXPECTED_MIGRATION_COUNT ||
    canonicalJson([...migrationNames].sort(compareText)) !==
      canonicalJson(migrationNames) ||
    migrationNames.at(-1) !== EXPECTED_MIGRATION_HEAD ||
    migrationEntries.at(-1)?.sha256 !== EXPECTED_MIGRATION_HEAD_SHA256 ||
    migrationManifestDigest(migrationProjection) !==
      EXPECTED_MIGRATION_MANIFEST_DIGEST
  ) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_MIGRATION_MANIFEST_MISMATCH",
    ]);
  }
  if (
    entryManifestDigest(artifact.entries) !== EXPECTED_ENTRY_MANIFEST_DIGEST ||
    sha256(canonicalJson(expectedArtifactEnvelope(artifact))) !==
      EXPECTED_IN_MEMORY_ARTIFACT_DIGEST
  ) {
    fail("DISPOSABLE_MATERIALIZER_ARTIFACT_INVALID", [
      "ARTIFACT_RECOMPUTED_ENVELOPE_MISMATCH",
    ]);
  }
  return artifact;
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

async function assertNoLinkComponents(absolutePath, finding) {
  const assertLexicalComponents = async (candidatePath) => {
    for (const component of pathComponents(candidatePath)) {
      let stat;
      try {
        stat = await lstat(component, { bigint: true });
      } catch {
        fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [finding]);
      }
      if (statType(stat) !== "directory") {
        fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [finding]);
      }
    }
  };

  await assertLexicalComponents(absolutePath);
  let actualRealPath;
  try {
    actualRealPath = await realpath(absolutePath);
  } catch {
    fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [finding]);
  }
  if (!isAbsolute(actualRealPath)) {
    fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [finding]);
  }

  const resolvedRealPath = resolve(actualRealPath);
  await assertLexicalComponents(resolvedRealPath);
  try {
    const fixedPointRealPath = await realpath(resolvedRealPath);
    if (!sameNativePath(fixedPointRealPath, resolvedRealPath)) {
      fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [finding]);
    }
  } catch (error) {
    if (
      error instanceof Current180Current190DisposablePostgresqlMaterializerError
    ) {
      throw error;
    }
    fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [finding]);
  }
}

async function captureSystemTemp() {
  const lexicalRoot = resolve(tmpdir());
  if (!isAbsolute(lexicalRoot)) {
    fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [
      "SYSTEM_TEMP_PATH_NOT_ABSOLUTE",
    ]);
  }
  await assertNoLinkComponents(lexicalRoot, "SYSTEM_TEMP_LINK_OR_TYPE_INVALID");
  const [stat, actualRealRoot] = await Promise.all([
    lstat(lexicalRoot, { bigint: true }),
    realpath(lexicalRoot),
  ]);
  const realRoot = resolve(actualRealRoot);
  let realRootStat;
  try {
    realRootStat = await lstat(realRoot, { bigint: true });
  } catch {
    fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [
      "SYSTEM_TEMP_REALPATH_MISMATCH",
    ]);
  }
  if (
    statType(stat) !== "directory" ||
    statType(realRootStat) !== "directory" ||
    !sameIdentity(identityOf(stat), identityOf(realRootStat)) ||
    !isAbsolute(realRoot) ||
    sameNativePath(realRoot, REPOSITORY_ROOT) ||
    isStrictDescendant(realRoot, REPOSITORY_ROOT)
  ) {
    fail("DISPOSABLE_MATERIALIZER_TEMP_PROVENANCE_INVALID", [
      "SYSTEM_TEMP_REALPATH_MISMATCH",
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
    [stat, actualRealPath] = await Promise.all([
      lstat(path, { bigint: true }),
      realpath(path),
    ]);
  } catch {
    fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [finding]);
  }
  const identity = identityOf(stat);
  if (
    statType(stat) !== "directory" ||
    !sameNativePath(actualRealPath, expectedRealPath) ||
    (expectedIdentity !== null && !sameIdentity(identity, expectedIdentity))
  ) {
    fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [finding]);
  }
  return identity;
}

async function assertFile(path, expectedRealPath, expectedIdentity, finding) {
  let stat;
  let actualRealPath;
  try {
    [stat, actualRealPath] = await Promise.all([
      lstat(path, { bigint: true }),
      realpath(path),
    ]);
  } catch {
    fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [finding]);
  }
  const identity = identityOf(stat);
  if (
    statType(stat) !== "file" ||
    !sameNativePath(actualRealPath, expectedRealPath) ||
    (expectedIdentity !== null && !sameIdentity(identity, expectedIdentity))
  ) {
    fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [finding]);
  }
  return identity;
}

function isUnsupportedDirectorySync(error) {
  return ["EBADF", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(
    error?.code,
  );
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!isUnsupportedDirectorySync(error)) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function callFault(faultInjector, event) {
  if (faultInjector !== null) {
    await faultInjector(event);
  }
}

async function readExactBoundedFile({
  errorCode,
  expectedByteLength,
  expectedIdentity,
  faultInjector = null,
  finding,
  label,
  maximumByteLength = expectedByteLength,
  path,
}) {
  if (
    !Number.isSafeInteger(expectedByteLength) ||
    expectedByteLength < 0 ||
    !Number.isSafeInteger(maximumByteLength) ||
    maximumByteLength < expectedByteLength ||
    maximumByteLength < 0
  ) {
    fail(errorCode, [finding]);
  }
  let handle;
  try {
    handle = await open(path, "r");
    const openedStat = await handle.stat({ bigint: true });
    const openedIdentity = identityOf(openedStat);
    if (
      statType(openedStat) !== "file" ||
      openedStat.size < 0n ||
      openedStat.size > BigInt(maximumByteLength) ||
      openedStat.size !== BigInt(expectedByteLength) ||
      (expectedIdentity !== null &&
        !sameIdentity(openedIdentity, expectedIdentity))
    ) {
      fail(errorCode, [finding]);
    }
    await callFault(faultInjector, `after-bounded-read-open:${label}`);
    const bytes = Buffer.alloc(expectedByteLength);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead < 1) fail(errorCode, [finding]);
      offset += bytesRead;
    }
    const overflowProbe = Buffer.alloc(1);
    const overflow = await handle.read(
      overflowProbe,
      0,
      overflowProbe.length,
      expectedByteLength,
    );
    if (overflow.bytesRead !== 0) fail(errorCode, [finding]);
    await callFault(faultInjector, `after-bounded-read-bytes:${label}`);
    const finalStat = await handle.stat({ bigint: true });
    if (
      statType(finalStat) !== "file" ||
      !sameIdentity(identityOf(finalStat), openedIdentity) ||
      finalStat.size !== openedStat.size ||
      finalStat.size !== BigInt(expectedByteLength)
    ) {
      fail(errorCode, [finding]);
    }
    await assertFile(path, path, expectedIdentity ?? openedIdentity, finding);
    return bytes;
  } catch (error) {
    if (
      error instanceof Current180Current190DisposablePostgresqlMaterializerError
    ) {
      throw error;
    }
    fail(errorCode, [finding]);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function directoryPathsForEntries(entries) {
  const directories = new Set();
  for (const entry of entries) {
    let directory = posix.dirname(entry.path);
    while (directory !== ".") {
      directories.add(directory);
      directory = posix.dirname(directory);
    }
  }
  return [...directories].sort((left, right) => {
    const depthDifference = left.split("/").length - right.split("/").length;
    return depthDifference === 0 ? compareText(left, right) : depthDifference;
  });
}

function exactRootName(rootPath, rootToken) {
  const name = parse(rootPath).base;
  const tokenPrefix = `${ROOT_NAME_PREFIX}${rootToken}-`;
  return (
    name.startsWith(tokenPrefix) &&
    MKDTEMP_SUFFIX_PATTERN.test(name.slice(tokenPrefix.length))
  );
}

function captureParentChain(
  artifactDirectory,
  rootPath,
  rootIdentity,
  directoryIdentities,
) {
  const chain = [{ identity: rootIdentity, path: rootPath }];
  if (artifactDirectory === ".") {
    return chain;
  }
  let artifactCursor = "";
  for (const component of artifactDirectory.split("/")) {
    artifactCursor =
      artifactCursor.length === 0
        ? component
        : `${artifactCursor}/${component}`;
    const identity = directoryIdentities.get(artifactCursor);
    if (identity === undefined) {
      fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [
        "PARENT_CHAIN_IDENTITY_MISSING",
      ]);
    }
    chain.push({
      identity,
      path: nativePathFromArtifact(rootPath, artifactCursor),
    });
  }
  return chain;
}

async function assertParentChain(parentChain, finding) {
  for (const component of parentChain) {
    if (component.identity === null) {
      fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [finding]);
    }
    await assertDirectory(
      component.path,
      component.path,
      component.identity,
      finding,
    );
  }
}

async function assertCreatedTreeExact({
  createdDirectories,
  createdFiles,
  rootIdentity,
  rootPath,
}) {
  if (
    rootIdentity === null ||
    createdDirectories.some(({ identity }) => identity === null) ||
    createdFiles.some(({ identity }) => identity === null)
  ) {
    fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [
      "CREATED_PATH_IDENTITY_INCOMPLETE",
    ]);
  }
  const expectedByDirectory = new Map([[rootPath, []]]);
  const addExpected = (parent, name, type) => {
    const entries = expectedByDirectory.get(parent);
    if (entries === undefined) {
      fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [
        "CREATED_TREE_PARENT_MISSING",
      ]);
    }
    entries.push({ name, type });
  };
  for (const directory of createdDirectories) {
    addExpected(
      dirname(directory.path),
      parse(directory.path).base,
      "directory",
    );
    expectedByDirectory.set(directory.path, []);
  }
  for (const file of createdFiles) {
    addExpected(dirname(file.path), parse(file.path).base, "file");
  }
  for (const entries of expectedByDirectory.values()) {
    entries.sort((left, right) => compareText(left.name, right.name));
  }

  await assertDirectory(
    rootPath,
    rootPath,
    rootIdentity,
    "CREATED_ROOT_PROVENANCE_DRIFT",
  );
  for (const directory of createdDirectories) {
    await assertParentChain(
      directory.parentChain,
      "CREATED_DIRECTORY_PARENT_CHAIN_DRIFT",
    );
    await assertDirectory(
      directory.path,
      directory.path,
      directory.identity,
      "CREATED_DIRECTORY_PROVENANCE_DRIFT",
    );
  }
  for (const file of createdFiles) {
    await assertParentChain(
      file.parentChain,
      "CREATED_FILE_PARENT_CHAIN_DRIFT",
    );
    await assertFile(
      file.path,
      file.path,
      file.identity,
      "CREATED_FILE_PROVENANCE_DRIFT",
    );
  }
  for (const [directoryPath, expectedEntries] of expectedByDirectory) {
    const actualEntries = (
      await readdir(directoryPath, { withFileTypes: true })
    )
      .map((entry) => ({
        name: entry.name,
        type: entry.isFile()
          ? "file"
          : entry.isDirectory()
            ? "directory"
            : "other",
      }))
      .sort((left, right) => compareText(left.name, right.name));
    if (canonicalJson(actualEntries) !== canonicalJson(expectedEntries)) {
      fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [
        "CREATED_TREE_FILE_SET_OR_TYPE_DRIFT",
      ]);
    }
  }
}

async function removeCreatedPathsBestEffort({
  createdDirectories,
  createdFiles,
  rootIdentity,
  rootPath,
  rootToken,
  systemTemp,
}) {
  if (rootPath === null) {
    return true;
  }
  let rootRemoved = false;
  try {
    if (
      !isStrictDescendant(rootPath, systemTemp.realRoot) ||
      !sameNativePath(dirname(rootPath), systemTemp.realRoot) ||
      rootToken === null ||
      !exactRootName(rootPath, rootToken)
    ) {
      return false;
    }
    await assertDirectory(
      systemTemp.realRoot,
      systemTemp.realRoot,
      systemTemp.identity,
      "SYSTEM_TEMP_FAILURE_CLEANUP_DRIFT",
    );
    await assertCreatedTreeExact({
      createdDirectories,
      createdFiles,
      rootIdentity,
      rootPath,
    });
    while (createdFiles.length > 0) {
      const file = createdFiles.at(-1);
      await assertParentChain(
        file.parentChain,
        "CREATED_FILE_PARENT_CHAIN_PRE_UNLINK_DRIFT",
      );
      await assertFile(
        file.path,
        file.path,
        file.identity,
        "CREATED_FILE_PRE_UNLINK_DRIFT",
      );
      await unlink(file.path);
      createdFiles.pop();
    }
    while (createdDirectories.length > 0) {
      const directory = createdDirectories.at(-1);
      await assertParentChain(
        directory.parentChain,
        "CREATED_DIRECTORY_PARENT_CHAIN_PRE_REMOVE_DRIFT",
      );
      await assertDirectory(
        directory.path,
        directory.path,
        directory.identity,
        "CREATED_DIRECTORY_PRE_REMOVE_DRIFT",
      );
      await rmdir(directory.path);
      createdDirectories.pop();
    }
    await assertDirectory(
      rootPath,
      rootPath,
      rootIdentity,
      "CREATED_ROOT_PRE_REMOVE_DRIFT",
    );
    await rmdir(rootPath);
    rootRemoved = true;
    try {
      await lstat(rootPath, { bigint: true });
      return false;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        return false;
      }
    }
    await syncDirectory(systemTemp.realRoot);
    return true;
  } catch {
    return rootRemoved;
  }
}

function buildMarker({ artifact, rootPath, rootToken }) {
  const marker = {
    artifactContract: EXPECTED_ARTIFACT_CONTRACT,
    entryCount: EXPECTED_ENTRY_COUNT,
    entryManifestDigest: EXPECTED_ENTRY_MANIFEST_DIGEST,
    inMemoryArtifactDigest: artifact.inMemoryArtifactDigest,
    materializerContract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZER_CONTRACT,
    rootName: parse(rootPath).base,
    rootToken,
    status: "OWNED_DISPOSABLE_POSTGRESQL_REHEARSAL_ARTIFACT",
  };
  return Buffer.from(`${canonicalJson(marker)}\n`, "utf8");
}

function recoveryAnchorPayload({
  artifact,
  artifactEntries,
  directoryPaths,
  markerBytes,
  markerIdentity,
  rootIdentity,
  rootPath,
  rootToken,
  systemTemp,
}) {
  return {
    artifactContract: artifact.contract,
    artifactEntries: artifactEntries.map((entry) => ({
      artifactPath: entry.artifactPath,
      byteLength: entry.byteLength,
      identity: entry.identity,
      sha256: entry.sha256,
    })),
    contract: RECOVERY_ANCHOR_PAYLOAD_CONTRACT,
    directoryPaths: directoryPaths.map((directory) => ({
      artifactPath: directory.artifactPath,
      identity: directory.identity,
    })),
    entryCount: artifact.entryCount,
    entryManifestDigest: artifact.entryManifestDigest,
    inMemoryArtifactDigest: artifact.inMemoryArtifactDigest,
    marker: {
      byteLength: markerBytes.length,
      identity: markerIdentity,
      sha256: sha256(markerBytes),
    },
    materializerContract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZER_CONTRACT,
    root: { identity: rootIdentity, path: rootPath, rootToken },
    status: "COORDINATOR_SIGNED_MATERIALIZED_TREE_RECOVERY_PROVENANCE",
    systemTemp: {
      identity: systemTemp.identity,
      realPath: systemTemp.realRoot,
    },
  };
}

function recoveryLocatorDocument(locator) {
  const { locatorDigest, ...document } = locator;
  return document;
}

function buildRecoveryLocator({
  anchorBytes,
  anchorIdentity,
  anchorPath,
  coordinatorAnchor,
  rootIdentity,
  rootPath,
  rootToken,
  systemTemp,
}) {
  const document = {
    anchorByteLength: anchorBytes.length,
    anchorFileIdentity: anchorIdentity,
    anchorPath,
    anchorSha256: sha256(anchorBytes),
    authorizationReceiptDigest: coordinatorAnchor.authorizationReceiptDigest,
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_LOCATOR_CONTRACT,
    coordinatorAnchor,
    coordinatorAnchorDigest: coordinatorAnchor.anchorDigest,
    coordinatorFingerprintSha256:
      coordinatorAnchor.coordinatorFingerprintSha256,
    rootIdentity,
    rootPath,
    rootToken,
    runToken: coordinatorAnchor.runToken,
    systemTempIdentity: systemTemp.identity,
    systemTempRealPath: systemTemp.realRoot,
  };
  return deepFreeze({
    ...document,
    locatorDigest: sha256(
      Buffer.from(
        `${RECOVERY_LOCATOR_DIGEST_DOMAIN}\n${canonicalJson(document)}`,
        "utf8",
      ),
    ),
  });
}

function snapshotRecoveryLocator(value) {
  const keys = [
    "anchorByteLength",
    "anchorFileIdentity",
    "anchorPath",
    "anchorSha256",
    "authorizationReceiptDigest",
    "contract",
    "coordinatorAnchor",
    "coordinatorAnchorDigest",
    "coordinatorFingerprintSha256",
    "locatorDigest",
    "rootIdentity",
    "rootPath",
    "rootToken",
    "runToken",
    "systemTempIdentity",
    "systemTempRealPath",
  ];
  const descriptors = ownDataDescriptors(value);
  if (
    descriptors === null ||
    canonicalJson(Object.keys(descriptors).sort(compareText)) !==
      canonicalJson([...keys].sort(compareText))
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_LOCATOR_INVALID", [
      "EXACT_DATA_ONLY_RECOVERY_LOCATOR_REQUIRED",
    ]);
  }
  const scalarKeys = keys.filter(
    (key) =>
      ![
        "anchorFileIdentity",
        "coordinatorAnchor",
        "rootIdentity",
        "systemTempIdentity",
      ].includes(key),
  );
  const locator = {};
  for (const key of scalarKeys) {
    locator[key] = descriptors[key].value;
  }
  locator.anchorFileIdentity = validateRecoveryIdentity(
    descriptors.anchorFileIdentity.value,
    "RECOVERY_ANCHOR_FILE_IDENTITY_INVALID",
  );
  locator.rootIdentity = validateRecoveryIdentity(
    descriptors.rootIdentity.value,
    "RECOVERY_ROOT_IDENTITY_INVALID",
  );
  locator.systemTempIdentity = validateRecoveryIdentity(
    descriptors.systemTempIdentity.value,
    "RECOVERY_SYSTEM_TEMP_IDENTITY_INVALID",
  );
  locator.coordinatorAnchor = descriptors.coordinatorAnchor.value;
  if (
    locator.contract !==
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_LOCATOR_CONTRACT ||
    !Number.isSafeInteger(locator.anchorByteLength) ||
    locator.anchorByteLength < 1 ||
    locator.anchorByteLength > MAX_RECOVERY_ANCHOR_BYTES ||
    !SHA256_PATTERN.test(String(locator.anchorSha256 ?? "")) ||
    !SHA256_PATTERN.test(String(locator.authorizationReceiptDigest ?? "")) ||
    !SHA256_PATTERN.test(String(locator.coordinatorAnchorDigest ?? "")) ||
    !SHA256_PATTERN.test(String(locator.coordinatorFingerprintSha256 ?? "")) ||
    !SHA256_PATTERN.test(String(locator.locatorDigest ?? "")) ||
    !/^[0-9a-f]{32}$/u.test(String(locator.runToken ?? "")) ||
    !RANDOM_TOKEN_PATTERN.test(String(locator.rootToken ?? "")) ||
    !isAbsolute(locator.systemTempRealPath) ||
    !isAbsolute(locator.rootPath) ||
    !isAbsolute(locator.anchorPath) ||
    !sameNativePath(dirname(locator.rootPath), locator.systemTempRealPath) ||
    !isStrictDescendant(locator.rootPath, locator.systemTempRealPath) ||
    !exactRootName(locator.rootPath, locator.rootToken) ||
    !sameNativePath(dirname(locator.anchorPath), locator.rootPath) ||
    parse(locator.anchorPath).base !== RECOVERY_ANCHOR_NAME
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_LOCATOR_INVALID", [
      "RECOVERY_LOCATOR_BINDING_OR_PATH_INVALID",
    ]);
  }
  return locator;
}

async function verifyRecoveryLocator(
  coordinatorAuthority,
  locatorInput,
  testOnly,
) {
  const snapshot = snapshotRecoveryLocator(locatorInput);
  let coordinatorVerification;
  try {
    coordinatorVerification = await verifyRecoveryAnchor(
      coordinatorAuthority,
      snapshot.coordinatorAnchor,
      testOnly,
    );
  } catch {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_COORDINATOR_TRUST_INVALID", [
      "COORDINATOR_SIGNED_MATERIALIZER_RECOVERY_ANCHOR_REQUIRED",
    ]);
  }
  const locator = deepFreeze({
    ...snapshot,
    coordinatorAnchor: coordinatorVerification.anchor,
  });
  if (
    locator.coordinatorAnchorDigest !==
      coordinatorVerification.anchor.anchorDigest ||
    locator.coordinatorFingerprintSha256 !==
      coordinatorVerification.coordinatorFingerprintSha256 ||
    locator.authorizationReceiptDigest !==
      coordinatorVerification.authorizationReceiptDigest ||
    locator.runToken !== coordinatorVerification.runToken ||
    locator.locatorDigest !==
      sha256(
        Buffer.from(
          `${RECOVERY_LOCATOR_DIGEST_DOMAIN}\n${canonicalJson(
            recoveryLocatorDocument(locator),
          )}`,
          "utf8",
        ),
      )
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_LOCATOR_INVALID", [
      "RECOVERY_LOCATOR_COORDINATOR_BINDING_INVALID",
    ]);
  }
  return deepFreeze({
    coordinatorVerification,
    locator,
    payload: coordinatorVerification.payload,
  });
}

function validateRecoveryPayload(payload, artifact, locator) {
  if (
    !exactKeys(payload, [
      "artifactContract",
      "artifactEntries",
      "contract",
      "directoryPaths",
      "entryCount",
      "entryManifestDigest",
      "inMemoryArtifactDigest",
      "marker",
      "materializerContract",
      "root",
      "status",
      "systemTemp",
    ]) ||
    payload.contract !== RECOVERY_ANCHOR_PAYLOAD_CONTRACT ||
    payload.artifactContract !== artifact.contract ||
    payload.entryCount !== artifact.entryCount ||
    payload.entryManifestDigest !== artifact.entryManifestDigest ||
    payload.inMemoryArtifactDigest !== artifact.inMemoryArtifactDigest ||
    payload.materializerContract !==
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZER_CONTRACT ||
    payload.status !==
      "COORDINATOR_SIGNED_MATERIALIZED_TREE_RECOVERY_PROVENANCE" ||
    !exactKeys(payload.root, ["identity", "path", "rootToken"]) ||
    !exactKeys(payload.systemTemp, ["identity", "realPath"]) ||
    !exactKeys(payload.marker, ["byteLength", "identity", "sha256"])
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
      "RECOVERY_ANCHOR_PAYLOAD_SHAPE_INVALID",
    ]);
  }
  const rootIdentity = validateRecoveryIdentity(
    payload.root.identity,
    "RECOVERY_ANCHOR_ROOT_IDENTITY_INVALID",
  );
  const systemTempIdentity = validateRecoveryIdentity(
    payload.systemTemp.identity,
    "RECOVERY_ANCHOR_SYSTEM_TEMP_IDENTITY_INVALID",
  );
  const markerIdentity = validateRecoveryIdentity(
    payload.marker.identity,
    "RECOVERY_ANCHOR_MARKER_IDENTITY_INVALID",
  );
  if (
    payload.root.path !== locator.rootPath ||
    payload.root.rootToken !== locator.rootToken ||
    !sameIdentity(rootIdentity, locator.rootIdentity) ||
    payload.systemTemp.realPath !== locator.systemTempRealPath ||
    !sameIdentity(systemTempIdentity, locator.systemTempIdentity) ||
    !Number.isSafeInteger(payload.marker.byteLength) ||
    payload.marker.byteLength < 1 ||
    !SHA256_PATTERN.test(String(payload.marker.sha256 ?? "")) ||
    !Array.isArray(payload.artifactEntries) ||
    payload.artifactEntries.length !== artifact.entries.length ||
    !Array.isArray(payload.directoryPaths)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
      "RECOVERY_ANCHOR_LOCATOR_BINDING_INVALID",
    ]);
  }
  const artifactEntries = payload.artifactEntries.map((entry, index) => {
    const expected = artifact.entries[index];
    if (
      !exactKeys(entry, ["artifactPath", "byteLength", "identity", "sha256"]) ||
      entry.artifactPath !== expected.path ||
      entry.byteLength !== expected.byteLength ||
      entry.sha256 !== expected.sha256
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
        "RECOVERY_ANCHOR_ARTIFACT_MANIFEST_INVALID",
      ]);
    }
    return {
      artifactPath: entry.artifactPath,
      byteLength: entry.byteLength,
      bytes: Buffer.from(expected.content, "utf8"),
      identity: validateRecoveryIdentity(
        entry.identity,
        "RECOVERY_ANCHOR_ARTIFACT_IDENTITY_INVALID",
      ),
      path: nativePathFromArtifact(locator.rootPath, entry.artifactPath),
      sha256: entry.sha256,
    };
  });
  const expectedDirectoryPaths = directoryPathsForEntries(artifact.entries);
  if (payload.directoryPaths.length !== expectedDirectoryPaths.length) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
      "RECOVERY_ANCHOR_DIRECTORY_MANIFEST_INVALID",
    ]);
  }
  const directoryPaths = payload.directoryPaths.map((directory, index) => {
    if (
      !exactKeys(directory, ["artifactPath", "identity"]) ||
      directory.artifactPath !== expectedDirectoryPaths[index]
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
        "RECOVERY_ANCHOR_DIRECTORY_MANIFEST_INVALID",
      ]);
    }
    return {
      artifactPath: directory.artifactPath,
      identity: validateRecoveryIdentity(
        directory.identity,
        "RECOVERY_ANCHOR_DIRECTORY_IDENTITY_INVALID",
      ),
      path: nativePathFromArtifact(locator.rootPath, directory.artifactPath),
    };
  });
  return {
    artifactEntries,
    directoryPaths,
    marker: {
      byteLength: payload.marker.byteLength,
      identity: markerIdentity,
      path: join(locator.rootPath, OWNERSHIP_MARKER_NAME),
      sha256: payload.marker.sha256,
    },
    rootIdentity,
    systemTempIdentity,
  };
}

async function pathPresence(path) {
  try {
    return { present: true, stat: await lstat(path, { bigint: true }) };
  } catch (error) {
    if (error?.code === "ENOENT") return { present: false, stat: null };
    throw error;
  }
}

function addExpectedChild(expectedByDirectory, parentPath, name, type) {
  const children = expectedByDirectory.get(parentPath) ?? new Map();
  children.set(name, type);
  expectedByDirectory.set(parentPath, children);
}

async function inspectRecoverableTree({ artifact, locator, payload }) {
  const manifest = validateRecoveryPayload(payload, artifact, locator);
  const refreshedTemp = await captureSystemTemp();
  if (
    !sameNativePath(refreshedTemp.realRoot, locator.systemTempRealPath) ||
    !sameIdentity(refreshedTemp.identity, locator.systemTempIdentity)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
      "RECOVERY_SYSTEM_TEMP_PROVENANCE_DRIFT",
    ]);
  }
  const rootProbe = await pathPresence(locator.rootPath);
  if (!rootProbe.present) {
    return {
      ...manifest,
      anchorPresent: false,
      artifactEntries: [],
      directoryPaths: [],
      markerPresent: false,
      rootPresent: false,
      systemTemp: refreshedTemp,
    };
  }
  if (
    statType(rootProbe.stat) !== "directory" ||
    !sameIdentity(identityOf(rootProbe.stat), locator.rootIdentity)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
      "RECOVERY_ROOT_PROVENANCE_DRIFT",
    ]);
  }
  await assertDirectory(
    locator.rootPath,
    locator.rootPath,
    locator.rootIdentity,
    "RECOVERY_ROOT_REALPATH_DRIFT",
  );

  const expectedByDirectory = new Map();
  addExpectedChild(
    expectedByDirectory,
    locator.rootPath,
    RECOVERY_ANCHOR_NAME,
    "file",
  );
  addExpectedChild(
    expectedByDirectory,
    locator.rootPath,
    OWNERSHIP_MARKER_NAME,
    "file",
  );
  for (const directory of manifest.directoryPaths) {
    addExpectedChild(
      expectedByDirectory,
      dirname(directory.path),
      parse(directory.path).base,
      "directory",
    );
  }
  for (const entry of manifest.artifactEntries) {
    addExpectedChild(
      expectedByDirectory,
      dirname(entry.path),
      parse(entry.path).base,
      "file",
    );
  }

  const presentDirectories = [];
  for (const directory of manifest.directoryPaths) {
    const probe = await pathPresence(directory.path);
    if (!probe.present) continue;
    if (
      statType(probe.stat) !== "directory" ||
      !sameIdentity(identityOf(probe.stat), directory.identity)
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_DIRECTORY_PROVENANCE_DRIFT",
      ]);
    }
    await assertDirectory(
      directory.path,
      directory.path,
      directory.identity,
      "RECOVERY_DIRECTORY_REALPATH_DRIFT",
    );
    presentDirectories.push(directory);
  }

  const presentArtifactEntries = [];
  for (const entry of manifest.artifactEntries) {
    const probe = await pathPresence(entry.path);
    if (!probe.present) continue;
    if (
      statType(probe.stat) !== "file" ||
      !sameIdentity(identityOf(probe.stat), entry.identity)
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_ARTIFACT_ENTRY_PROVENANCE_DRIFT",
      ]);
    }
    await assertFile(
      entry.path,
      entry.path,
      entry.identity,
      "RECOVERY_ARTIFACT_ENTRY_REALPATH_DRIFT",
    );
    const bytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_RECOVERY_DENIED",
      expectedByteLength: entry.byteLength,
      expectedIdentity: entry.identity,
      finding: "RECOVERY_ARTIFACT_ENTRY_BYTES_DRIFT",
      label: `recovery-artifact:${entry.artifactPath}`,
      path: entry.path,
    });
    if (
      bytes.length !== entry.byteLength ||
      sha256(bytes) !== entry.sha256 ||
      !bytes.equals(entry.bytes)
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_ARTIFACT_ENTRY_BYTES_DRIFT",
      ]);
    }
    presentArtifactEntries.push(entry);
  }

  const markerProbe = await pathPresence(manifest.marker.path);
  const markerPresent = markerProbe.present;
  if (markerPresent) {
    if (
      statType(markerProbe.stat) !== "file" ||
      !sameIdentity(identityOf(markerProbe.stat), manifest.marker.identity)
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_MARKER_PROVENANCE_DRIFT",
      ]);
    }
    const markerBytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_RECOVERY_DENIED",
      expectedByteLength: manifest.marker.byteLength,
      expectedIdentity: manifest.marker.identity,
      finding: "RECOVERY_MARKER_BYTES_DRIFT",
      label: "recovery-marker",
      path: manifest.marker.path,
    });
    if (
      markerBytes.length !== manifest.marker.byteLength ||
      sha256(markerBytes) !== manifest.marker.sha256
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_MARKER_BYTES_DRIFT",
      ]);
    }
  }

  const anchorProbe = await pathPresence(locator.anchorPath);
  const anchorPresent = anchorProbe.present;
  let anchorIdentity = locator.anchorFileIdentity;
  if (anchorPresent) {
    if (
      statType(anchorProbe.stat) !== "file" ||
      !sameIdentity(identityOf(anchorProbe.stat), locator.anchorFileIdentity)
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_ANCHOR_FILE_TYPE_DRIFT",
      ]);
    }
    anchorIdentity = identityOf(anchorProbe.stat);
    const anchorBytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_RECOVERY_DENIED",
      expectedByteLength: locator.anchorByteLength,
      expectedIdentity: locator.anchorFileIdentity,
      finding: "RECOVERY_ANCHOR_FILE_BYTES_DRIFT",
      label: "recovery-anchor",
      maximumByteLength: MAX_RECOVERY_ANCHOR_BYTES,
      path: locator.anchorPath,
    });
    if (
      anchorBytes.length !== locator.anchorByteLength ||
      sha256(anchorBytes) !== locator.anchorSha256 ||
      anchorBytes.toString("utf8") !==
        `${canonicalJson(locator.coordinatorAnchor)}\n`
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
        "RECOVERY_ANCHOR_FILE_BYTES_DRIFT",
      ]);
    }
  }

  const actualDirectories = [{ path: locator.rootPath }, ...presentDirectories];
  for (const directory of actualDirectories) {
    const allowed = expectedByDirectory.get(directory.path) ?? new Map();
    const entries = await readdir(directory.path, { withFileTypes: true });
    for (const entry of entries) {
      const expectedType = allowed.get(entry.name);
      const actualType = entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : "other";
      if (expectedType === undefined || actualType !== expectedType) {
        fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
          "RECOVERY_TREE_EXTRA_OR_TYPE_DRIFT",
        ]);
      }
    }
  }

  const artifactPrefix = manifest.artifactEntries.slice(
    0,
    presentArtifactEntries.length,
  );
  const directoryPrefix = manifest.directoryPaths.slice(
    0,
    presentDirectories.length,
  );
  if (
    canonicalJson(
      presentArtifactEntries.map(({ artifactPath }) => artifactPath),
    ) !==
      canonicalJson(artifactPrefix.map(({ artifactPath }) => artifactPath)) ||
    canonicalJson(
      presentDirectories.map(({ artifactPath }) => artifactPath),
    ) !==
      canonicalJson(directoryPrefix.map(({ artifactPath }) => artifactPath)) ||
    (!markerPresent && presentArtifactEntries.length > 0) ||
    (presentDirectories.length < manifest.directoryPaths.length &&
      (markerPresent || presentArtifactEntries.length > 0)) ||
    (!anchorPresent &&
      (markerPresent ||
        presentArtifactEntries.length > 0 ||
        presentDirectories.length > 0))
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_DENIED", [
      "RECOVERY_TREE_NON_MONOTONIC_CLEANUP_STATE",
    ]);
  }
  const directoryIdentityMap = new Map([
    [".", locator.rootIdentity],
    ...manifest.directoryPaths.map((directory) => [
      directory.artifactPath,
      directory.identity,
    ]),
  ]);
  const withParentChain = (record) => ({
    ...record,
    parentChain: captureParentChain(
      posix.dirname(record.artifactPath),
      locator.rootPath,
      locator.rootIdentity,
      directoryIdentityMap,
    ),
  });
  return {
    ...manifest,
    anchorIdentity,
    anchorPresent,
    artifactEntries: presentArtifactEntries.map(withParentChain),
    directoryPaths: presentDirectories.map(withParentChain),
    markerPresent,
    rootPresent: true,
    systemTemp: refreshedTemp,
  };
}

function materializationReceipt({
  artifact,
  markerBytes,
  recoveryLocator,
  rootIdentity,
  rootPath,
  testFaultInjectorInvoked,
}) {
  const publicReceipt = {
    artifactContract: artifact.contract,
    artifactRootPath: rootPath,
    authorization: {
      canApplyDatabase: false,
      canBeConsumedByDisposablePostgresqlRunner: false,
      canCleanupOwnedDisposableArtifact: true,
      canConnectDatabase: false,
      canDeploy: false,
      canMutateCanonicalMigrations: false,
      canMutateProduction: false,
      canProvisionRolesOrGrants: false,
      canSpawnProcess: false,
      productionApplyAuthorized: false,
    },
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECEIPT_CONTRACT,
    effects: {
      callerSuppliedTestFaultInjectorInvoked: testFaultInjectorInvoked,
      databaseConnectionOpened: false,
      externalProviderCallAttempted: false,
      filesystemMaterializationPerformed: true,
      networkCallAttempted: false,
      processSpawnAttempted: false,
      productionStateRead: false,
      roleOrGrantMutationAttempted: false,
      scope: "MATERIALIZER_IMPLEMENTATION_ONLY",
      toctouEliminationClaimed: false,
    },
    entryCount: artifact.entryCount,
    entryManifestDigest: artifact.entryManifestDigest,
    inMemoryArtifactDigest: artifact.inMemoryArtifactDigest,
    markerSha256: sha256(markerBytes),
    recoveryLocator,
    residualSecurityBoundary:
      "NO_HOSTILE_LOCAL_ACTOR_MAY_MUTATE_THE_OWNED_ROOT_DURING_VERIFICATION_OR_CONSUMPTION",
    rootIdentity: { ...rootIdentity },
    schemaPath: join(rootPath, "schema.prisma"),
    status: "DISPOSABLE_POSTGRESQL_REHEARSAL_ARTIFACT_MATERIALIZED_NOT_APPLIED",
  };
  const receiptDigest = sha256(canonicalJson(publicReceipt));
  return deepFreeze({ ...publicReceipt, receiptDigest });
}

function createManualInspectionReceipt({
  createdDirectories,
  createdFiles,
  rootIdentity,
  rootPath,
  rootToken,
  systemTemp,
}) {
  if (rootPath === null || rootToken === null) {
    return null;
  }
  const publicReceipt = {
    artifactRootPath: rootPath,
    authorization: {
      canApplyDatabase: false,
      canAutomaticallyCleanup: false,
      canConnectDatabase: false,
      canDeploy: false,
      canSpawnProcess: false,
      productionApplyAuthorized: false,
    },
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MANUAL_INSPECTION_CONTRACT,
    rootIdentity: rootIdentity === null ? null : { ...rootIdentity },
    rootName: parse(rootPath).base,
    rootToken,
    status: "PARTIAL_OWNED_ROOT_QUARANTINED_MANUAL_INSPECTION_REQUIRED",
  };
  const receipt = deepFreeze({
    ...publicReceipt,
    receiptDigest: sha256(canonicalJson(publicReceipt)),
  });
  manualInspectionStates.set(receipt, {
    cleaned: false,
    recoveryState: {
      createdDirectories,
      createdFiles,
      rootIdentity,
      rootPath,
      rootToken,
      systemTemp,
    },
  });
  return receipt;
}

export async function cleanupCurrent180Current190DisposablePostgresqlArtifactAfterManualInspection(
  receipt,
) {
  if (
    arguments.length !== 1 ||
    receipt === null ||
    typeof receipt !== "object" ||
    isProxy(receipt) ||
    !manualInspectionStates.has(receipt)
  ) {
    fail("DISPOSABLE_MATERIALIZER_MANUAL_INSPECTION_RECEIPT_INVALID", [
      "MODULE_BRANDED_MANUAL_INSPECTION_RECEIPT_REQUIRED",
    ]);
  }
  const state = manualInspectionStates.get(receipt);
  if (state.cleaned) {
    fail("DISPOSABLE_MATERIALIZER_MANUAL_INSPECTION_RECEIPT_INVALID", [
      "MANUAL_INSPECTION_RECEIPT_ALREADY_CLEANED",
    ]);
  }
  const cleanupSucceeded = await removeCreatedPathsBestEffort(
    state.recoveryState,
  );
  if (!cleanupSucceeded) {
    fail("DISPOSABLE_MATERIALIZER_MANUAL_RECOVERY_DENIED", [
      "OWNED_ROOT_STILL_REQUIRES_MANUAL_INSPECTION",
    ]);
  }
  state.cleaned = true;
  return deepFreeze({
    artifactRootAbsent: true,
    contract:
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MANUAL_RECOVERY_CLEANUP_V1",
    status: "MANUALLY_INSPECTED_OWNED_ROOT_CLEANED",
  });
}

export function assertCurrent180Current190DisposablePostgresqlManualInspectionReceipt(
  receipt,
) {
  if (
    arguments.length !== 1 ||
    receipt === null ||
    typeof receipt !== "object" ||
    isProxy(receipt) ||
    !manualInspectionStates.has(receipt)
  ) {
    fail("DISPOSABLE_MATERIALIZER_MANUAL_INSPECTION_RECEIPT_INVALID", [
      "MODULE_BRANDED_MANUAL_INSPECTION_RECEIPT_REQUIRED",
    ]);
  }
  return receipt;
}

async function materializeInternal(
  candidateArtifact,
  coordinatorSigningAuthority,
  coordinatorVerificationAuthority,
  coordinatorRunBinding,
  faultInjector,
  testOnly,
) {
  const binding = await assertCoordinatorRunBinding(
    coordinatorSigningAuthority,
    coordinatorRunBinding,
    testOnly,
  );
  await assertCoordinatorVerificationAuthority(
    coordinatorVerificationAuthority,
    testOnly,
  );
  const artifact = validateArtifact(candidateArtifact);
  const systemTemp = await captureSystemTemp();
  const createdDirectories = [];
  const createdFiles = [];
  let rootIdentity = null;
  let rootPath = null;
  let rootToken = null;
  try {
    await callFault(faultInjector, "before-root-create");
    await assertDirectory(
      systemTemp.realRoot,
      systemTemp.realRoot,
      systemTemp.identity,
      "SYSTEM_TEMP_PRE_CREATE_DRIFT",
    );
    rootToken = randomBytes(32).toString("hex");
    if (!RANDOM_TOKEN_PATTERN.test(rootToken)) {
      fail("DISPOSABLE_MATERIALIZER_ENTROPY_INVALID", [
        "ROOT_TOKEN_ENTROPY_INVALID",
      ]);
    }
    rootPath = resolve(
      await mkdtemp(
        join(systemTemp.realRoot, `${ROOT_NAME_PREFIX}${rootToken}-`),
      ),
    );
    await assertDirectory(
      systemTemp.realRoot,
      systemTemp.realRoot,
      systemTemp.identity,
      "SYSTEM_TEMP_POST_CREATE_DRIFT",
    );
    if (
      !sameNativePath(dirname(rootPath), systemTemp.realRoot) ||
      !isStrictDescendant(rootPath, systemTemp.realRoot) ||
      !exactRootName(rootPath, rootToken)
    ) {
      fail("DISPOSABLE_MATERIALIZER_ROOT_INVALID", [
        "ATOMIC_ROOT_PATH_INVALID",
      ]);
    }
    rootIdentity = await assertDirectory(
      rootPath,
      rootPath,
      null,
      "ATOMIC_ROOT_PROVENANCE_INVALID",
    );
    await syncDirectory(systemTemp.realRoot);
    await callFault(faultInjector, "after-root-create");

    const directoryIdentities = new Map([[".", rootIdentity]]);
    for (const artifactDirectory of directoryPathsForEntries(
      artifact.entries,
    )) {
      const parentArtifactDirectory = posix.dirname(artifactDirectory);
      const parentPath =
        parentArtifactDirectory === "."
          ? rootPath
          : nativePathFromArtifact(rootPath, parentArtifactDirectory);
      await assertDirectory(
        parentPath,
        parentPath,
        directoryIdentities.get(parentArtifactDirectory),
        "MATERIALIZATION_PARENT_DIRECTORY_DRIFT",
      );
      await callFault(faultInjector, `before-directory:${artifactDirectory}`);
      const directoryPath = nativePathFromArtifact(rootPath, artifactDirectory);
      await mkdir(directoryPath, { mode: 0o700, recursive: false });
      const directoryRecord = {
        artifactPath: artifactDirectory,
        identity: null,
        parentChain: captureParentChain(
          parentArtifactDirectory,
          rootPath,
          rootIdentity,
          directoryIdentities,
        ),
        path: directoryPath,
      };
      createdDirectories.push(directoryRecord);
      const identity = await assertDirectory(
        directoryPath,
        directoryPath,
        null,
        "MATERIALIZED_DIRECTORY_PROVENANCE_INVALID",
      );
      directoryRecord.identity = identity;
      directoryIdentities.set(artifactDirectory, identity);
      await callFault(faultInjector, `after-directory:${artifactDirectory}`);
    }

    const materializedEntries = [];
    for (const entry of artifact.entries) {
      const parentArtifactDirectory = posix.dirname(entry.path);
      const parentPath =
        parentArtifactDirectory === "."
          ? rootPath
          : nativePathFromArtifact(rootPath, parentArtifactDirectory);
      await assertDirectory(
        parentPath,
        parentPath,
        directoryIdentities.get(parentArtifactDirectory),
        "MATERIALIZATION_FILE_PARENT_DRIFT",
      );
      const filePath = nativePathFromArtifact(rootPath, entry.path);
      const fileRecord = {
        artifactPath: entry.path,
        identity: null,
        parentChain: captureParentChain(
          parentArtifactDirectory,
          rootPath,
          rootIdentity,
          directoryIdentities,
        ),
        path: filePath,
      };
      await callFault(faultInjector, `before-file:${entry.path}`);
      let handle;
      try {
        handle = await open(filePath, "wx", 0o600);
        createdFiles.push(fileRecord);
        const openedStat = await handle.stat({ bigint: true });
        if (statType(openedStat) !== "file") {
          fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [
            "OPENED_ARTIFACT_ENTRY_TYPE_INVALID",
          ]);
        }
        fileRecord.identity = identityOf(openedStat);
        await handle.writeFile(entry.content, { encoding: "utf8" });
        await handle.sync();
      } finally {
        await handle?.close().catch(() => undefined);
      }
      const identity = await assertFile(
        filePath,
        filePath,
        fileRecord.identity,
        "MATERIALIZED_FILE_PROVENANCE_INVALID",
      );
      const bytes = await readExactBoundedFile({
        errorCode: "DISPOSABLE_MATERIALIZER_WRITE_VERIFICATION_FAILED",
        expectedByteLength: entry.byteLength,
        expectedIdentity: identity,
        finding: "MATERIALIZED_FILE_BYTES_MISMATCH",
        label: `materialized-artifact:${entry.path}`,
        path: filePath,
      });
      if (
        bytes.length !== entry.byteLength ||
        sha256(bytes) !== entry.sha256 ||
        !bytes.equals(Buffer.from(entry.content, "utf8"))
      ) {
        fail("DISPOSABLE_MATERIALIZER_WRITE_VERIFICATION_FAILED", [
          "MATERIALIZED_FILE_BYTES_MISMATCH",
        ]);
      }
      materializedEntries.push({
        artifactPath: entry.path,
        byteLength: entry.byteLength,
        bytes: Buffer.from(bytes),
        identity,
        parentChain: fileRecord.parentChain,
        path: filePath,
        sha256: entry.sha256,
      });
      await callFault(faultInjector, `after-file:${entry.path}`);
    }

    if (
      entryManifestDigest(
        materializedEntries.map(({ artifactPath, sha256: digest }) => ({
          path: artifactPath,
          sha256: digest,
        })),
      ) !== EXPECTED_ENTRY_MANIFEST_DIGEST
    ) {
      fail("DISPOSABLE_MATERIALIZER_WRITE_VERIFICATION_FAILED", [
        "MATERIALIZED_ENTRY_MANIFEST_MISMATCH",
      ]);
    }
    await callFault(faultInjector, "after-all-artifact-entries-verified");

    const markerPath = join(rootPath, OWNERSHIP_MARKER_NAME);
    const markerBytes = buildMarker({ artifact, rootPath, rootToken });
    const markerRecord = {
      artifactPath: OWNERSHIP_MARKER_NAME,
      identity: null,
      parentChain: captureParentChain(
        ".",
        rootPath,
        rootIdentity,
        directoryIdentities,
      ),
      path: markerPath,
    };
    let markerHandle;
    try {
      markerHandle = await open(markerPath, "wx", 0o600);
      createdFiles.push(markerRecord);
      const openedMarkerStat = await markerHandle.stat({ bigint: true });
      if (statType(openedMarkerStat) !== "file") {
        fail("DISPOSABLE_MATERIALIZER_PROVENANCE_INVALID", [
          "OPENED_OWNERSHIP_MARKER_TYPE_INVALID",
        ]);
      }
      markerRecord.identity = identityOf(openedMarkerStat);
      await markerHandle.writeFile(markerBytes);
      await markerHandle.sync();
    } finally {
      await markerHandle?.close().catch(() => undefined);
    }
    const markerIdentity = await assertFile(
      markerPath,
      markerPath,
      markerRecord.identity,
      "OWNERSHIP_MARKER_PROVENANCE_INVALID",
    );
    const readMarkerBytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_WRITE_VERIFICATION_FAILED",
      expectedByteLength: markerBytes.length,
      expectedIdentity: markerIdentity,
      finding: "OWNERSHIP_MARKER_BYTES_MISMATCH",
      label: "materialized-marker",
      path: markerPath,
    });
    if (!readMarkerBytes.equals(markerBytes)) {
      fail("DISPOSABLE_MATERIALIZER_WRITE_VERIFICATION_FAILED", [
        "OWNERSHIP_MARKER_BYTES_MISMATCH",
      ]);
    }
    const directoryPathRecords = createdDirectories.map((directory) => ({
      artifactPath: directory.artifactPath,
      identity: directory.identity,
      parentChain: directory.parentChain,
      path: directory.path,
    }));
    const coordinatorAnchor = await signRecoveryAnchor(
      coordinatorSigningAuthority,
      binding,
      recoveryAnchorPayload({
        artifact,
        artifactEntries: materializedEntries,
        directoryPaths: directoryPathRecords,
        markerBytes,
        markerIdentity,
        rootIdentity,
        rootPath,
        rootToken,
        systemTemp,
      }),
      testOnly,
    );
    const anchorPath = join(rootPath, RECOVERY_ANCHOR_NAME);
    const anchorBytes = Buffer.from(
      `${canonicalJson(coordinatorAnchor)}\n`,
      "utf8",
    );
    if (anchorBytes.length > MAX_RECOVERY_ANCHOR_BYTES) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
        "RECOVERY_ANCHOR_FILE_TOO_LARGE",
      ]);
    }
    const anchorRecord = {
      artifactPath: RECOVERY_ANCHOR_NAME,
      identity: null,
      parentChain: captureParentChain(
        ".",
        rootPath,
        rootIdentity,
        directoryIdentities,
      ),
      path: anchorPath,
    };
    await callFault(faultInjector, "before-recovery-anchor-write");
    let anchorHandle;
    try {
      anchorHandle = await open(anchorPath, "wx", 0o600);
      createdFiles.push(anchorRecord);
      const openedAnchorStat = await anchorHandle.stat({ bigint: true });
      if (statType(openedAnchorStat) !== "file") {
        fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
          "OPENED_RECOVERY_ANCHOR_TYPE_INVALID",
        ]);
      }
      anchorRecord.identity = identityOf(openedAnchorStat);
      await anchorHandle.writeFile(anchorBytes);
      await anchorHandle.sync();
    } finally {
      await anchorHandle?.close().catch(() => undefined);
    }
    const anchorIdentity = await assertFile(
      anchorPath,
      anchorPath,
      anchorRecord.identity,
      "RECOVERY_ANCHOR_PROVENANCE_INVALID",
    );
    const readAnchorBytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID",
      expectedByteLength: anchorBytes.length,
      expectedIdentity: anchorIdentity,
      finding: "RECOVERY_ANCHOR_BYTES_MISMATCH",
      label: "materialized-recovery-anchor",
      maximumByteLength: MAX_RECOVERY_ANCHOR_BYTES,
      path: anchorPath,
    });
    if (!readAnchorBytes.equals(anchorBytes)) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_ANCHOR_INVALID", [
        "RECOVERY_ANCHOR_BYTES_MISMATCH",
      ]);
    }
    const recoveryLocator = buildRecoveryLocator({
      anchorBytes,
      anchorIdentity,
      anchorPath,
      coordinatorAnchor,
      rootIdentity,
      rootPath,
      rootToken,
      systemTemp,
    });
    await verifyRecoveryLocator(
      coordinatorVerificationAuthority,
      recoveryLocator,
      testOnly,
    );
    for (const directory of [...createdDirectories].reverse()) {
      await syncDirectory(directory.path);
    }
    await syncDirectory(rootPath);
    await syncDirectory(systemTemp.realRoot);
    await assertDirectory(
      rootPath,
      rootPath,
      rootIdentity,
      "OWNED_ROOT_POST_WRITE_DRIFT",
    );
    await callFault(faultInjector, "after-marker-verified");

    const materializationState = {
      anchorBytes,
      anchorIdentity,
      anchorParentChain: anchorRecord.parentChain,
      anchorPath,
      anchorPresent: true,
      artifactEntries: materializedEntries,
      cleaned: false,
      cleanupMutationCount: 0,
      coordinatorAnchor,
      coordinatorVerificationAuthority,
      directoryIdentities,
      directoryPaths: directoryPathRecords,
      markerBytes,
      markerIdentity,
      markerParentChain: markerRecord.parentChain,
      markerPath,
      markerPresent: true,
      manualInspectionReceipt: null,
      quarantined: false,
      rootIdentity,
      rootPath,
      rootPresent: true,
      rootToken,
      recoveryLocator,
      systemTemp,
      testOnly,
    };
    await callFault(faultInjector, "before-final-whole-tree-verification");
    await verifyOwnedTree(materializationState);

    const receipt = materializationReceipt({
      artifact,
      markerBytes,
      recoveryLocator,
      rootIdentity,
      rootPath,
      testFaultInjectorInvoked: faultInjector !== null,
    });
    receiptStates.set(receipt, materializationState);
    return receipt;
  } catch (error) {
    const cleanupSucceeded = await removeCreatedPathsBestEffort({
      createdDirectories,
      createdFiles,
      rootIdentity,
      rootPath,
      rootToken,
      systemTemp,
    });
    if (!cleanupSucceeded) {
      throw new Current180Current190DisposablePostgresqlMaterializerError(
        "DISPOSABLE_MATERIALIZER_FAILURE_CLEANUP_INCOMPLETE",
        ["OWNED_PARTIAL_ROOT_REQUIRES_MANUAL_INSPECTION"],
        createManualInspectionReceipt({
          createdDirectories,
          createdFiles,
          rootIdentity,
          rootPath,
          rootToken,
          systemTemp,
        }),
      );
    }
    if (
      error instanceof Current180Current190DisposablePostgresqlMaterializerError
    ) {
      throw error;
    }
    fail("DISPOSABLE_MATERIALIZER_FILESYSTEM_OPERATION_FAILED", [
      "OWNED_ROOT_MATERIALIZATION_FAILED_WITH_ZERO_RESIDUE",
    ]);
  }
}

function faultInjectorFromOptions(options) {
  const descriptors = ownDataDescriptors(options);
  if (
    descriptors === null ||
    Object.keys(descriptors).some((key) => key !== "faultInjector") ||
    (Object.hasOwn(descriptors, "faultInjector") &&
      typeof descriptors.faultInjector.value !== "function")
  ) {
    fail("DISPOSABLE_MATERIALIZER_TEST_ARGUMENTS_INVALID", [
      "TEST_ONLY_OPTIONS_SHAPE_INVALID",
    ]);
  }
  return Object.hasOwn(descriptors, "faultInjector")
    ? descriptors.faultInjector.value
    : null;
}

export async function materializeCurrent180Current190DisposablePostgresqlArtifact(
  artifact,
  coordinatorSigningAuthority,
  coordinatorVerificationAuthority,
  coordinatorRunBinding,
) {
  if (arguments.length !== 4) {
    fail("DISPOSABLE_MATERIALIZER_ARGUMENTS_INVALID", [
      "EXACT_ARTIFACT_SIGNING_VERIFICATION_AND_RUN_BINDING_REQUIRED",
    ]);
  }
  return materializeInternal(
    artifact,
    coordinatorSigningAuthority,
    coordinatorVerificationAuthority,
    coordinatorRunBinding,
    null,
    false,
  );
}

export async function materializeCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
  artifact,
  coordinatorAuthority,
  coordinatorRunBinding,
  options = {},
) {
  if (arguments.length < 3 || arguments.length > 4) {
    fail("DISPOSABLE_MATERIALIZER_TEST_ARGUMENTS_INVALID", [
      "EXACT_TEST_ARGUMENTS_REQUIRED",
    ]);
  }
  return materializeInternal(
    artifact,
    coordinatorAuthority,
    coordinatorAuthority,
    coordinatorRunBinding,
    faultInjectorFromOptions(options),
    true,
  );
}

async function enumerateOwnedTree(state) {
  const expectedByDirectory = new Map();
  const addExpected = (parent, name, type) => {
    const entries = expectedByDirectory.get(parent) ?? [];
    entries.push({ name, type });
    expectedByDirectory.set(parent, entries);
  };
  if (state.markerPresent) {
    addExpected(state.rootPath, OWNERSHIP_MARKER_NAME, "file");
  }
  if (state.anchorPresent) {
    addExpected(state.rootPath, RECOVERY_ANCHOR_NAME, "file");
  }
  for (const entry of state.artifactEntries) {
    addExpected(dirname(entry.path), parse(entry.path).base, "file");
  }
  for (const directory of state.directoryPaths) {
    addExpected(
      dirname(directory.path),
      parse(directory.path).base,
      "directory",
    );
  }
  for (const entries of expectedByDirectory.values()) {
    entries.sort((left, right) => compareText(left.name, right.name));
  }

  const directories = [
    { identity: state.rootIdentity, path: state.rootPath },
    ...state.directoryPaths,
  ];
  for (const directory of directories) {
    if (directory.parentChain !== undefined) {
      await assertParentChain(
        directory.parentChain,
        "OWNED_DIRECTORY_PARENT_CHAIN_DRIFT",
      );
    }
    await assertDirectory(
      directory.path,
      directory.path,
      directory.identity,
      "CLEANUP_DIRECTORY_PROVENANCE_DRIFT",
    );
    const entries = (await readdir(directory.path, { withFileTypes: true }))
      .map((entry) => ({
        name: entry.name,
        type: entry.isFile()
          ? "file"
          : entry.isDirectory()
            ? "directory"
            : "other",
      }))
      .sort((left, right) => compareText(left.name, right.name));
    if (
      canonicalJson(entries) !==
      canonicalJson(expectedByDirectory.get(directory.path) ?? [])
    ) {
      fail("DISPOSABLE_MATERIALIZER_CLEANUP_DENIED", [
        "OWNED_ROOT_FILE_SET_OR_TYPE_DRIFT",
      ]);
    }
  }
}

async function verifyOwnedTree(state) {
  const refreshedTemp = await captureSystemTemp();
  if (
    !sameNativePath(refreshedTemp.realRoot, state.systemTemp.realRoot) ||
    !sameIdentity(refreshedTemp.identity, state.systemTemp.identity) ||
    !sameNativePath(dirname(state.rootPath), refreshedTemp.realRoot) ||
    !isStrictDescendant(state.rootPath, refreshedTemp.realRoot) ||
    !exactRootName(state.rootPath, state.rootToken)
  ) {
    fail("DISPOSABLE_MATERIALIZER_CLEANUP_DENIED", [
      "SYSTEM_TEMP_OR_OWNED_ROOT_DRIFT",
    ]);
  }
  await assertDirectory(
    state.rootPath,
    state.rootPath,
    state.rootIdentity,
    "OWNED_ROOT_PROVENANCE_DRIFT",
  );
  await enumerateOwnedTree(state);
  if (state.markerPresent) {
    await assertParentChain(
      state.markerParentChain,
      "OWNERSHIP_MARKER_PARENT_CHAIN_DRIFT",
    );
    await assertFile(
      state.markerPath,
      state.markerPath,
      state.markerIdentity,
      "OWNERSHIP_MARKER_PROVENANCE_DRIFT",
    );
    const markerBytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_CLEANUP_DENIED",
      expectedByteLength: state.markerBytes.length,
      expectedIdentity: state.markerIdentity,
      finding: "OWNERSHIP_MARKER_BYTES_DRIFT",
      label: "owned-tree-marker",
      path: state.markerPath,
    });
    if (!markerBytes.equals(state.markerBytes)) {
      fail("DISPOSABLE_MATERIALIZER_CLEANUP_DENIED", [
        "OWNERSHIP_MARKER_BYTES_DRIFT",
      ]);
    }
  }
  if (state.anchorPresent) {
    await assertParentChain(
      state.anchorParentChain,
      "RECOVERY_ANCHOR_PARENT_CHAIN_DRIFT",
    );
    await assertFile(
      state.anchorPath,
      state.anchorPath,
      state.anchorIdentity,
      "RECOVERY_ANCHOR_PROVENANCE_DRIFT",
    );
    const anchorBytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_CLEANUP_DENIED",
      expectedByteLength: state.anchorBytes.length,
      expectedIdentity: state.anchorIdentity,
      finding: "RECOVERY_ANCHOR_BYTES_DRIFT",
      label: "owned-tree-recovery-anchor",
      maximumByteLength: MAX_RECOVERY_ANCHOR_BYTES,
      path: state.anchorPath,
    });
    if (!anchorBytes.equals(state.anchorBytes)) {
      fail("DISPOSABLE_MATERIALIZER_CLEANUP_DENIED", [
        "RECOVERY_ANCHOR_BYTES_DRIFT",
      ]);
    }
  }
  for (const entry of state.artifactEntries) {
    await assertParentChain(
      entry.parentChain,
      "MATERIALIZED_ENTRY_PARENT_CHAIN_DRIFT",
    );
    await assertFile(
      entry.path,
      entry.path,
      entry.identity,
      "MATERIALIZED_ENTRY_PROVENANCE_DRIFT",
    );
    const bytes = await readExactBoundedFile({
      errorCode: "DISPOSABLE_MATERIALIZER_CLEANUP_DENIED",
      expectedByteLength: entry.byteLength,
      expectedIdentity: entry.identity,
      finding: "MATERIALIZED_ENTRY_BYTES_DRIFT",
      label: `owned-tree-artifact:${entry.artifactPath}`,
      path: entry.path,
    });
    if (
      bytes.length !== entry.byteLength ||
      sha256(bytes) !== entry.sha256 ||
      !bytes.equals(entry.bytes)
    ) {
      fail("DISPOSABLE_MATERIALIZER_CLEANUP_DENIED", [
        "MATERIALIZED_ENTRY_BYTES_DRIFT",
      ]);
    }
  }
}

async function verifyArtifactForRunnerInternal(
  materializationReceipt,
  testOnlyCall,
) {
  if (
    materializationReceipt === null ||
    typeof materializationReceipt !== "object" ||
    isProxy(materializationReceipt) ||
    !receiptStates.has(materializationReceipt)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_VERIFICATION_ARGUMENTS_INVALID", [
      "MODULE_BRANDED_MATERIALIZATION_RECEIPT_REQUIRED",
    ]);
  }
  const state = receiptStates.get(materializationReceipt);
  if (state.cleaned || state.testOnly !== testOnlyCall || state.quarantined) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_VERIFICATION_DENIED", [
      state.cleaned
        ? "MATERIALIZED_ARTIFACT_ALREADY_CLEANED"
        : state.testOnly !== testOnlyCall
          ? "MATERIALIZATION_VERIFICATION_DEPENDENCY_BOUNDARY_MISMATCH"
          : "PARTIAL_CLEANUP_QUARANTINE_NOT_RUNNER_CONSUMABLE",
    ]);
  }
  await verifyOwnedTree(state);
  const schemaEntries = state.artifactEntries.filter(
    (entry) => entry.artifactPath === "schema.prisma",
  );
  if (
    schemaEntries.length !== 1 ||
    !sameNativePath(
      schemaEntries[0].path,
      join(state.rootPath, "schema.prisma"),
    )
  ) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_VERIFICATION_DENIED", [
      "EXACT_PINNED_SCHEMA_ENTRY_REQUIRED",
    ]);
  }
  const schemaEntry = schemaEntries[0];
  state.runnerVerificationGeneration =
    (state.runnerVerificationGeneration ?? 0) + 1;
  const publicVerification = {
    artifactRootPath: state.rootPath,
    authorization: {
      canApplyDatabase: false,
      canBeConsumedByDisposablePostgresqlRunner: true,
      canConnectDatabase: false,
      canDeploy: false,
      canMutateCanonicalMigrations: false,
      canMutateProduction: false,
      canProvisionRolesOrGrants: false,
      canSpawnProcess: false,
      productionApplyAuthorized: false,
    },
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_RUNNER_VERIFICATION_CONTRACT,
    effects: {
      databaseConnectionOpened: false,
      externalProviderCallAttempted: false,
      filesystemReadPerformed: true,
      filesystemWriteAttempted: false,
      networkCallAttempted: false,
      processSpawnAttempted: false,
      productionStateRead: false,
      toctouEliminationClaimed: false,
    },
    entryCount: EXPECTED_ENTRY_COUNT,
    entryManifestDigest: EXPECTED_ENTRY_MANIFEST_DIGEST,
    generation: state.runnerVerificationGeneration,
    inMemoryArtifactDigest: EXPECTED_IN_MEMORY_ARTIFACT_DIGEST,
    materializationReceiptDigest: materializationReceipt.receiptDigest,
    recoveryLocatorDigest: state.recoveryLocator.locatorDigest,
    residualSecurityBoundary:
      "RUNNER_MUST_ASSERT_THIS_MODULE_BRAND_IMMEDIATELY_BEFORE_SPAWN_AND_NO_HOSTILE_LOCAL_ACTOR_MAY_MUTATE_THE_ROOT",
    rootIdentity: { ...state.rootIdentity },
    schemaIdentity: { ...schemaEntry.identity },
    schemaPath: schemaEntry.path,
    status:
      "FRESH_WHOLE_TREE_VERIFIED_FOR_DISPOSABLE_RUNNER_NOT_PROCESS_AUTHORITY",
    systemTempIdentity: { ...state.systemTemp.identity },
    systemTempRealPath: state.systemTemp.realRoot,
  };
  const verificationReceipt = deepFreeze({
    ...publicVerification,
    verificationDigest: sha256(canonicalJson(publicVerification)),
  });
  state.latestRunnerVerificationReceipt = verificationReceipt;
  runnerVerificationStates.set(verificationReceipt, {
    materializationState: state,
  });
  return verificationReceipt;
}

export async function verifyCurrent180Current190DisposablePostgresqlArtifactForRunner(
  materializationReceipt,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_VERIFICATION_ARGUMENTS_INVALID", [
      "EXACT_PRODUCTION_MATERIALIZATION_RECEIPT_REQUIRED",
    ]);
  }
  return verifyArtifactForRunnerInternal(materializationReceipt, false);
}

export async function verifyCurrent180Current190DisposablePostgresqlArtifactForRunnerForTestOnly(
  materializationReceipt,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_VERIFICATION_ARGUMENTS_INVALID", [
      "EXACT_TEST_MATERIALIZATION_RECEIPT_REQUIRED",
    ]);
  }
  return verifyArtifactForRunnerInternal(materializationReceipt, true);
}

function assertRunnerVerificationReceiptInternal(
  verificationReceipt,
  testOnlyCall,
) {
  if (
    verificationReceipt === null ||
    typeof verificationReceipt !== "object" ||
    isProxy(verificationReceipt) ||
    !runnerVerificationStates.has(verificationReceipt)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID", [
      "MODULE_BRANDED_RUNNER_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  const { materializationState } =
    runnerVerificationStates.get(verificationReceipt);
  if (
    materializationState.cleaned ||
    materializationState.testOnly !== testOnlyCall ||
    materializationState.quarantined ||
    materializationState.latestRunnerVerificationReceipt !== verificationReceipt
  ) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID", [
      materializationState.cleaned
        ? "RUNNER_VERIFICATION_RECEIPT_CLEANED"
        : materializationState.testOnly !== testOnlyCall
          ? "RUNNER_VERIFICATION_RECEIPT_DEPENDENCY_BOUNDARY_MISMATCH"
          : materializationState.quarantined
            ? "RUNNER_VERIFICATION_RECEIPT_QUARANTINED"
            : "RUNNER_VERIFICATION_RECEIPT_SUPERSEDED",
    ]);
  }
  return verificationReceipt;
}

export function assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceipt(
  verificationReceipt,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID", [
      "EXACT_PRODUCTION_RUNNER_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  return assertRunnerVerificationReceiptInternal(verificationReceipt, false);
}

export function assertCurrent180Current190DisposablePostgresqlRunnerVerificationReceiptForTestOnly(
  verificationReceipt,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RUNNER_RECEIPT_INVALID", [
      "EXACT_TEST_RUNNER_VERIFICATION_RECEIPT_REQUIRED",
    ]);
  }
  return assertRunnerVerificationReceiptInternal(verificationReceipt, true);
}

function cleanupSuccessReceipt(
  receipt,
  recoveredAfterRootRemovalError = false,
) {
  return deepFreeze({
    artifactRootAbsent: true,
    contract:
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_CLEANUP_V1",
    effects: {
      databaseConnectionOpened: false,
      externalProviderCallAttempted: false,
      networkCallAttempted: false,
      processSpawnAttempted: false,
      productionStateRead: false,
      recursiveRemovalUsed: false,
    },
    receiptDigest: receipt.receiptDigest,
    recoveredAfterRootRemovalError,
    status: "OWNED_DISPOSABLE_POSTGRESQL_REHEARSAL_ARTIFACT_CLEANED",
  });
}

function quarantinePartialCleanup(state) {
  const remainingFiles = [];
  if (state.anchorPresent) {
    remainingFiles.push({
      artifactPath: RECOVERY_ANCHOR_NAME,
      identity: state.anchorIdentity,
      parentChain: state.anchorParentChain,
      path: state.anchorPath,
    });
  }
  remainingFiles.push(...state.artifactEntries.map((entry) => ({ ...entry })));
  if (state.markerPresent) {
    remainingFiles.push({
      artifactPath: OWNERSHIP_MARKER_NAME,
      identity: state.markerIdentity,
      parentChain: state.markerParentChain,
      path: state.markerPath,
    });
  }
  const manualInspectionReceipt = createManualInspectionReceipt({
    createdDirectories: state.directoryPaths.map((directory) => ({
      ...directory,
    })),
    createdFiles: remainingFiles,
    rootIdentity: state.rootIdentity,
    rootPath: state.rootPath,
    rootToken: state.rootToken,
    systemTemp: state.systemTemp,
  });
  state.latestRunnerVerificationReceipt = null;
  state.manualInspectionReceipt = manualInspectionReceipt;
  state.quarantined = true;
  return manualInspectionReceipt;
}

async function cleanupInternal(receipt, faultInjector, testOnlyCall) {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    isProxy(receipt) ||
    !receiptStates.has(receipt)
  ) {
    fail("DISPOSABLE_MATERIALIZER_CLEANUP_ARGUMENTS_INVALID", [
      "MODULE_BRANDED_RECEIPT_REQUIRED",
    ]);
  }
  const state = receiptStates.get(receipt);
  if (state.cleaned) {
    fail("DISPOSABLE_MATERIALIZER_CLEANUP_ARGUMENTS_INVALID", [
      "RECEIPT_ALREADY_CLEANED",
    ]);
  }
  if (state.quarantined) {
    throw new Current180Current190DisposablePostgresqlMaterializerError(
      "DISPOSABLE_MATERIALIZER_CLEANUP_QUARANTINED",
      ["PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION_RECEIPT"],
      state.manualInspectionReceipt,
    );
  }
  if (state.testOnly !== testOnlyCall) {
    fail("DISPOSABLE_MATERIALIZER_CLEANUP_ARGUMENTS_INVALID", [
      "RECEIPT_DEPENDENCY_BOUNDARY_MISMATCH",
    ]);
  }
  await callFault(faultInjector, "before-cleanup-verification");
  await verifyOwnedTree(state);
  await callFault(faultInjector, "after-cleanup-verification");
  let destructiveStepCompleted = false;
  try {
    while (state.artifactEntries.length > 0) {
      const entry = state.artifactEntries.at(-1);
      await assertParentChain(
        entry.parentChain,
        "MATERIALIZED_ENTRY_PARENT_CHAIN_PRE_UNLINK_DRIFT",
      );
      await assertFile(
        entry.path,
        entry.path,
        entry.identity,
        "MATERIALIZED_ENTRY_PRE_UNLINK_DRIFT",
      );
      await unlink(entry.path);
      state.artifactEntries.pop();
      state.cleanupMutationCount += 1;
      destructiveStepCompleted = true;
      await callFault(
        faultInjector,
        `after-cleanup-artifact-unlink:${entry.artifactPath}`,
      );
    }
    if (state.markerPresent) {
      await assertParentChain(
        state.markerParentChain,
        "OWNERSHIP_MARKER_PARENT_CHAIN_PRE_UNLINK_DRIFT",
      );
      await assertFile(
        state.markerPath,
        state.markerPath,
        state.markerIdentity,
        "OWNERSHIP_MARKER_PRE_UNLINK_DRIFT",
      );
      await unlink(state.markerPath);
      state.markerPresent = false;
      state.cleanupMutationCount += 1;
      destructiveStepCompleted = true;
      await callFault(faultInjector, "after-cleanup-marker-unlink");
    }
    while (state.directoryPaths.length > 0) {
      const directory = state.directoryPaths.at(-1);
      await assertParentChain(
        directory.parentChain,
        "MATERIALIZED_DIRECTORY_PARENT_CHAIN_PRE_REMOVE_DRIFT",
      );
      await assertDirectory(
        directory.path,
        directory.path,
        directory.identity,
        "MATERIALIZED_DIRECTORY_PRE_REMOVE_DRIFT",
      );
      await rmdir(directory.path);
      state.directoryPaths.pop();
      state.cleanupMutationCount += 1;
      destructiveStepCompleted = true;
      await callFault(
        faultInjector,
        `after-cleanup-directory-remove:${directory.artifactPath}`,
      );
    }
    if (state.anchorPresent) {
      await assertParentChain(
        state.anchorParentChain,
        "RECOVERY_ANCHOR_PARENT_CHAIN_PRE_UNLINK_DRIFT",
      );
      await assertFile(
        state.anchorPath,
        state.anchorPath,
        state.anchorIdentity,
        "RECOVERY_ANCHOR_PRE_UNLINK_DRIFT",
      );
      await unlink(state.anchorPath);
      state.anchorPresent = false;
      state.cleanupMutationCount += 1;
      destructiveStepCompleted = true;
      await callFault(faultInjector, "after-cleanup-recovery-anchor-unlink");
    }
    await assertDirectory(
      state.rootPath,
      state.rootPath,
      state.rootIdentity,
      "OWNED_ROOT_PRE_REMOVE_DRIFT",
    );
    await rmdir(state.rootPath);
    state.rootPresent = false;
    state.cleanupMutationCount += 1;
    destructiveStepCompleted = true;
    await callFault(faultInjector, "after-cleanup-root-remove");
    try {
      await lstat(state.rootPath, { bigint: true });
      fail("DISPOSABLE_MATERIALIZER_CLEANUP_INCOMPLETE", [
        "OWNED_ROOT_STILL_EXISTS",
      ]);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    await syncDirectory(state.systemTemp.realRoot);
    state.cleaned = true;
    return cleanupSuccessReceipt(receipt);
  } catch (error) {
    if (!state.rootPresent) {
      await syncDirectory(state.systemTemp.realRoot).catch(() => undefined);
      state.cleaned = true;
      return cleanupSuccessReceipt(receipt, true);
    }
    if (destructiveStepCompleted) {
      const manualInspectionReceipt = quarantinePartialCleanup(state);
      throw new Current180Current190DisposablePostgresqlMaterializerError(
        "DISPOSABLE_MATERIALIZER_PARTIAL_CLEANUP_QUARANTINED",
        ["PARTIAL_CLEANUP_REQUIRES_MANUAL_INSPECTION"],
        manualInspectionReceipt,
      );
    }
    throw error;
  }
}

export async function cleanupCurrent180Current190DisposablePostgresqlArtifact(
  receipt,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_CLEANUP_ARGUMENTS_INVALID", [
      "EXACT_RECEIPT_ARGUMENT_REQUIRED",
    ]);
  }
  return cleanupInternal(receipt, null, false);
}

export async function cleanupCurrent180Current190DisposablePostgresqlArtifactForTestOnly(
  receipt,
  options = {},
) {
  if (arguments.length < 1 || arguments.length > 2) {
    fail("DISPOSABLE_MATERIALIZER_TEST_ARGUMENTS_INVALID", [
      "EXACT_TEST_ARGUMENTS_REQUIRED",
    ]);
  }
  return cleanupInternal(receipt, faultInjectorFromOptions(options), true);
}

async function discoverRecoveryLocatorsInternal(
  coordinatorAuthority,
  testOnly,
) {
  await assertCoordinatorVerificationAuthority(coordinatorAuthority, testOnly);
  const systemTemp = await captureSystemTemp();
  let entries;
  try {
    entries = await readdir(systemTemp.realRoot, { withFileTypes: true });
  } catch {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
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
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_ROOT_TYPE_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
    const rootToken = match[1];
    const rootPath = join(systemTemp.realRoot, entry.name);
    const rootIdentity = await assertDirectory(
      rootPath,
      rootPath,
      null,
      "RECOVERY_DISCOVERY_ROOT_PROVENANCE_INVALID",
    );
    const anchorPath = join(rootPath, RECOVERY_ANCHOR_NAME);
    let anchorStat;
    try {
      anchorStat = await lstat(anchorPath, { bigint: true });
    } catch {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
        "MATCHING_ROOT_WITHOUT_RECOVERY_ANCHOR_EVIDENCE_PRESERVED",
      ]);
    }
    if (
      statType(anchorStat) !== "file" ||
      anchorStat.size < 1n ||
      anchorStat.size > BigInt(MAX_RECOVERY_ANCHOR_BYTES)
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
        "RECOVERY_ANCHOR_FILE_INVALID",
      ]);
    }
    const anchorIdentity = identityOf(anchorStat);
    await assertFile(
      anchorPath,
      anchorPath,
      anchorIdentity,
      "RECOVERY_DISCOVERY_ANCHOR_PROVENANCE_INVALID",
    );
    let anchorBytes;
    let coordinatorAnchor;
    try {
      anchorBytes = await readExactBoundedFile({
        errorCode: "DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED",
        expectedByteLength: Number(anchorStat.size),
        expectedIdentity: anchorIdentity,
        finding: "RECOVERY_ANCHOR_CANONICAL_READ_FAILED",
        label: `recovery-discovery-anchor:${rootToken}`,
        maximumByteLength: MAX_RECOVERY_ANCHOR_BYTES,
        path: anchorPath,
      });
      if (
        anchorBytes.length !== Number(anchorStat.size) ||
        anchorBytes.at(-1) !== 0x0a
      ) {
        throw new Error("non-canonical anchor bytes");
      }
      coordinatorAnchor = JSON.parse(
        anchorBytes.subarray(0, -1).toString("utf8"),
      );
      if (
        `${canonicalJson(coordinatorAnchor)}\n` !== anchorBytes.toString("utf8")
      ) {
        throw new Error("non-canonical anchor document");
      }
      await assertFile(
        anchorPath,
        anchorPath,
        anchorIdentity,
        "RECOVERY_DISCOVERY_ANCHOR_READ_DRIFT",
      );
    } catch {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
        "RECOVERY_ANCHOR_CANONICAL_READ_FAILED",
      ]);
    }
    let coordinatorVerification;
    try {
      coordinatorVerification = await verifyRecoveryAnchor(
        coordinatorAuthority,
        coordinatorAnchor,
        testOnly,
      );
    } catch {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
        "FOREIGN_OR_INVALID_COORDINATOR_ANCHOR_EVIDENCE_PRESERVED",
      ]);
    }
    const payload = coordinatorVerification.payload;
    if (
      !exactKeys(payload, [
        "artifactContract",
        "artifactEntries",
        "contract",
        "directoryPaths",
        "entryCount",
        "entryManifestDigest",
        "inMemoryArtifactDigest",
        "marker",
        "materializerContract",
        "root",
        "status",
        "systemTemp",
      ]) ||
      !exactKeys(payload.root, ["identity", "path", "rootToken"]) ||
      !exactKeys(payload.systemTemp, ["identity", "realPath"]) ||
      payload.root.path !== rootPath ||
      payload.root.rootToken !== rootToken ||
      payload.systemTemp.realPath !== systemTemp.realRoot ||
      !sameIdentity(
        validateRecoveryIdentity(
          payload.root.identity,
          "RECOVERY_DISCOVERY_ROOT_IDENTITY_INVALID",
        ),
        rootIdentity,
      ) ||
      !sameIdentity(
        validateRecoveryIdentity(
          payload.systemTemp.identity,
          "RECOVERY_DISCOVERY_TEMP_IDENTITY_INVALID",
        ),
        systemTemp.identity,
      )
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_DENIED", [
        "RECOVERY_ANCHOR_ROOT_BINDING_INVALID",
      ]);
    }
    const locator = buildRecoveryLocator({
      anchorBytes,
      anchorIdentity,
      anchorPath,
      coordinatorAnchor: coordinatorVerification.anchor,
      rootIdentity,
      rootPath,
      rootToken,
      systemTemp,
    });
    await verifyRecoveryLocator(coordinatorAuthority, locator, testOnly);
    locators.push(locator);
  }
  return deepFreeze(locators);
}

export async function discoverCurrent180Current190DisposablePostgresqlMaterializationRecoveryLocators(
  coordinatorAuthority,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_ARGUMENTS_INVALID", [
      "EXACT_PRODUCTION_COORDINATOR_AUTHORITY_REQUIRED",
    ]);
  }
  return discoverRecoveryLocatorsInternal(coordinatorAuthority, false);
}

export async function discoverCurrent180Current190DisposablePostgresqlMaterializationRecoveryLocatorsForTestOnly(
  coordinatorAuthority,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_DISCOVERY_ARGUMENTS_INVALID", [
      "EXACT_TEST_COORDINATOR_AUTHORITY_REQUIRED",
    ]);
  }
  return discoverRecoveryLocatorsInternal(coordinatorAuthority, true);
}

async function rehydrateRecoveryInternal(
  coordinatorAuthority,
  locatorInput,
  candidateArtifact,
  testOnly,
) {
  const artifact = validateArtifact(candidateArtifact);
  const { coordinatorVerification, locator, payload } =
    await verifyRecoveryLocator(coordinatorAuthority, locatorInput, testOnly);
  const tree = await inspectRecoverableTree({ artifact, locator, payload });
  const publicReceipt = {
    artifactRootAbsent: !tree.rootPresent,
    artifactRootPath: locator.rootPath,
    authorization: {
      canApplyDatabase: false,
      canCleanupExactCoordinatorSignedArtifact: true,
      canConnectDatabase: false,
      canDeploy: false,
      canMutateProduction: false,
      canSpawnProcess: false,
      productionApplyAuthorized: false,
    },
    authorizationReceiptDigest:
      coordinatorVerification.authorizationReceiptDigest,
    contract:
      CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RECOVERY_RECEIPT_CONTRACT,
    locatorDigest: locator.locatorDigest,
    remainingArtifactEntryCount: tree.artifactEntries.length,
    remainingDirectoryCount: tree.directoryPaths.length,
    rootIdentity: { ...locator.rootIdentity },
    runToken: coordinatorVerification.runToken,
    status: tree.rootPresent
      ? "COORDINATOR_SIGNED_MATERIALIZATION_REHYDRATED_FOR_EXACT_CLEANUP"
      : "COORDINATOR_SIGNED_MATERIALIZATION_ALREADY_ABSENT",
    verified: true,
  };
  const receipt = deepFreeze({
    ...publicReceipt,
    recoveryReceiptDigest: sha256(canonicalJson(publicReceipt)),
  });
  recoveryReceiptStates.set(receipt, {
    artifact,
    cleaned: !tree.rootPresent,
    coordinatorAuthority,
    locator,
    payload,
    testOnly,
  });
  return receipt;
}

export async function rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecovery(
  coordinatorAuthority,
  locator,
  artifact,
) {
  if (arguments.length !== 3) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_ARGUMENTS_INVALID", [
      "EXACT_PRODUCTION_COORDINATOR_LOCATOR_AND_ARTIFACT_REQUIRED",
    ]);
  }
  return rehydrateRecoveryInternal(
    coordinatorAuthority,
    locator,
    artifact,
    false,
  );
}

export async function rehydrateCurrent180Current190DisposablePostgresqlMaterializationRecoveryForTestOnly(
  coordinatorAuthority,
  locator,
  artifact,
) {
  if (arguments.length !== 3) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_ARGUMENTS_INVALID", [
      "EXACT_TEST_COORDINATOR_LOCATOR_AND_ARTIFACT_REQUIRED",
    ]);
  }
  return rehydrateRecoveryInternal(
    coordinatorAuthority,
    locator,
    artifact,
    true,
  );
}

async function removeRecoveredFile(record, faultInjector, event) {
  let reconciledLostResponse = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await assertParentChain(
      record.parentChain,
      "RECOVERY_FILE_PARENT_CHAIN_DRIFT",
    );
    await assertFile(
      record.path,
      record.path,
      record.identity,
      "RECOVERY_FILE_PROVENANCE_DRIFT",
    );
    try {
      await unlink(record.path);
      await callFault(faultInjector, `${event}:${attempt}`);
    } catch {
      // A response can be lost after the unlink reached the filesystem.
      reconciledLostResponse = true;
    }
    const probe = await pathPresence(record.path);
    if (!probe.present) return reconciledLostResponse;
    if (
      statType(probe.stat) !== "file" ||
      !sameIdentity(identityOf(probe.stat), record.identity) ||
      attempt === 2
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_DENIED", [
        "RECOVERY_FILE_REMOVAL_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
  }
}

async function removeRecoveredDirectory(record, faultInjector, event) {
  let reconciledLostResponse = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await assertParentChain(
      record.parentChain,
      "RECOVERY_DIRECTORY_PARENT_CHAIN_DRIFT",
    );
    await assertDirectory(
      record.path,
      record.path,
      record.identity,
      "RECOVERY_DIRECTORY_PROVENANCE_DRIFT",
    );
    try {
      await rmdir(record.path);
      await callFault(faultInjector, `${event}:${attempt}`);
    } catch {
      // A response can be lost after the directory removal reached the filesystem.
      reconciledLostResponse = true;
    }
    const probe = await pathPresence(record.path);
    if (!probe.present) return reconciledLostResponse;
    if (
      statType(probe.stat) !== "directory" ||
      !sameIdentity(identityOf(probe.stat), record.identity) ||
      attempt === 2
    ) {
      fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_DENIED", [
        "RECOVERY_DIRECTORY_REMOVAL_AMBIGUOUS_EVIDENCE_PRESERVED",
      ]);
    }
  }
}

function recoveredCleanupReceipt(receipt, recoveredLostResponse) {
  const document = {
    artifactRootAbsent: true,
    contract:
      "CURRENT180_CURRENT190_DISPOSABLE_POSTGRESQL_MATERIALIZATION_RESTART_CLEANUP_V1",
    recoveredLostResponse,
    recoveryReceiptDigest: receipt.recoveryReceiptDigest,
    status: "COORDINATOR_SIGNED_MATERIALIZATION_CLEANED_AFTER_RESTART",
    verified: true,
  };
  return deepFreeze({
    ...document,
    cleanupReceiptDigest: sha256(canonicalJson(document)),
  });
}

async function cleanupRecoveryInternal(receipt, faultInjector, testOnlyCall) {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    isProxy(receipt) ||
    !recoveryReceiptStates.has(receipt)
  ) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_ARGUMENTS_INVALID", [
      "MODULE_BRANDED_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  const state = recoveryReceiptStates.get(receipt);
  if (state.testOnly !== testOnlyCall) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_ARGUMENTS_INVALID", [
      "RECOVERY_RECEIPT_DEPENDENCY_BOUNDARY_MISMATCH",
    ]);
  }
  if (state.cleaned) {
    if (receipt.artifactRootAbsent) {
      return recoveredCleanupReceipt(receipt, false);
    }
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_ARGUMENTS_INVALID", [
      "RECOVERY_RECEIPT_ALREADY_CLEANED",
    ]);
  }
  const { locator, payload } = await verifyRecoveryLocator(
    state.coordinatorAuthority,
    state.locator,
    state.testOnly,
  );
  const tree = await inspectRecoverableTree({
    artifact: state.artifact,
    locator,
    payload,
  });
  if (!tree.rootPresent) {
    state.cleaned = true;
    return recoveredCleanupReceipt(receipt, true);
  }
  let recoveredLostResponse = false;
  for (const entry of [...tree.artifactEntries].reverse()) {
    recoveredLostResponse =
      (await removeRecoveredFile(
        entry,
        faultInjector,
        `after-restart-artifact-unlink:${entry.artifactPath}`,
      )) || recoveredLostResponse;
  }
  if (tree.markerPresent) {
    const markerRecord = {
      ...tree.marker,
      parentChain: [{ identity: locator.rootIdentity, path: locator.rootPath }],
    };
    recoveredLostResponse =
      (await removeRecoveredFile(
        markerRecord,
        faultInjector,
        "after-restart-marker-unlink",
      )) || recoveredLostResponse;
  }
  for (const directory of [...tree.directoryPaths].reverse()) {
    recoveredLostResponse =
      (await removeRecoveredDirectory(
        directory,
        faultInjector,
        `after-restart-directory-remove:${directory.artifactPath}`,
      )) || recoveredLostResponse;
  }
  if (tree.anchorPresent) {
    recoveredLostResponse =
      (await removeRecoveredFile(
        {
          identity: tree.anchorIdentity,
          parentChain: [
            { identity: locator.rootIdentity, path: locator.rootPath },
          ],
          path: locator.anchorPath,
        },
        faultInjector,
        "after-restart-anchor-unlink",
      )) || recoveredLostResponse;
  }
  await assertDirectory(
    tree.systemTemp.realRoot,
    tree.systemTemp.realRoot,
    tree.systemTemp.identity,
    "RECOVERY_SYSTEM_TEMP_PRE_ROOT_REMOVE_DRIFT",
  );
  recoveredLostResponse =
    (await removeRecoveredDirectory(
      {
        identity: locator.rootIdentity,
        parentChain: [],
        path: locator.rootPath,
      },
      faultInjector,
      "after-restart-root-remove",
    )) || recoveredLostResponse;
  await syncDirectory(tree.systemTemp.realRoot);
  state.cleaned = true;
  return recoveredCleanupReceipt(receipt, recoveredLostResponse);
}

export async function cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestart(
  receipt,
) {
  if (arguments.length !== 1) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_ARGUMENTS_INVALID", [
      "EXACT_PRODUCTION_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  return cleanupRecoveryInternal(receipt, null, false);
}

export async function cleanupCurrent180Current190DisposablePostgresqlArtifactAfterRestartForTestOnly(
  receipt,
  options = {},
) {
  if (arguments.length < 1 || arguments.length > 2) {
    fail("DISPOSABLE_MATERIALIZER_RECOVERY_CLEANUP_ARGUMENTS_INVALID", [
      "EXACT_TEST_RECOVERY_RECEIPT_REQUIRED",
    ]);
  }
  return cleanupRecoveryInternal(
    receipt,
    faultInjectorFromOptions(options),
    true,
  );
}

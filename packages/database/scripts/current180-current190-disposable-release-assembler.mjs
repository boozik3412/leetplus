import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

export const CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_V2";
export const CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_MANIFEST_SHA256 =
  "738063efe68828432bc39d4d1bea2f283e17c58dfc367ed6beb6c69a0cd5c69e";
export const CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_CONTRACT =
  "CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_V2";
export const CURRENT180_CURRENT190_IN_MEMORY_ARTIFACT_CONTRACT =
  "CURRENT180_CURRENT190_FROZEN_IN_MEMORY_ARTIFACT_V1";

const CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT =
  "CURRENT180_CURRENT190_RELEASE_REFREEZE_MANIFEST_V1";
const CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256 =
  "290909b51d4eb3bc1cab035a182b5647e89471680441c73bbe4d77cf704053e4";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const DATABASE_DIRECTORY = join(REPOSITORY_ROOT, "packages", "database");
const CANONICAL_MIGRATIONS_DIRECTORY = join(
  DATABASE_DIRECTORY,
  "prisma",
  "migrations",
);
const MIGRATION_LOCK_PATH = join(
  CANONICAL_MIGRATIONS_DIRECTORY,
  "migration_lock.toml",
);
const REFREEZE_MANIFEST_PATH = join(
  DATABASE_DIRECTORY,
  "release-proposals",
  "current180-current190",
  "refreeze-manifest.json",
);
const ALLOW_MANIFEST_PATH = join(
  DATABASE_DIRECTORY,
  "release-rehearsals",
  "current180-current190",
  "disposable-assembly-allow-manifest.json",
);
const INSPECTION_CHAIN = Object.freeze([
  Object.freeze({
    path: join(
      DATABASE_DIRECTORY,
      "scripts",
      "current180-current190-release-refreeze-manifest.mjs",
    ),
    repositoryPath:
      "packages/database/scripts/current180-current190-release-refreeze-manifest.mjs",
    sha256: "7db62383915bf780740ce6aeded51d18491590a2cacc65872e99765579dd484f",
  }),
  Object.freeze({
    path: join(
      DATABASE_DIRECTORY,
      "scripts",
      "current180-current190-release-materialization-planner.mjs",
    ),
    repositoryPath:
      "packages/database/scripts/current180-current190-release-materialization-planner.mjs",
    sha256: "6643b7601d7cfaf347510572a3a5f5ecc60d0a231582dd64cf00ca38cf327c99",
  }),
  Object.freeze({
    path: join(
      DATABASE_DIRECTORY,
      "scripts",
      "current180-current190-release-rehearsal-blocker.mjs",
    ),
    repositoryPath:
      "packages/database/scripts/current180-current190-release-rehearsal-blocker.mjs",
    sha256: "e5249159473deec3dfb230bfd75666dada72547c830a6d73e6ca19f547122a79",
  }),
]);
const MIGRATION_DIRECTORY_PATTERN = /^\d{14}_[a-z0-9_]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const EXPECTED_CANONICAL_COUNT = 180;
const EXPECTED_CANONICAL_HEAD = "20260804120000_guest_game_max_pending_rewards";
const EXPECTED_CANONICAL_HEAD_SHA256 =
  "40587bc93c34875edf6064f9848e42ce0194b321165ac494750987533cef21ef";
const EXPECTED_CANONICAL_MANIFEST_DIGEST =
  "8a763027a16c45532bf1cff84fdaacf27f2c4e834cae15cffd7a15feae63f6dc";
const EXPECTED_MIGRATION_LOCK_SHA256 =
  "99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900";
const EXPECTED_ARTIFACT_COUNT = 191;
const EXPECTED_ARTIFACT_HEAD = "20260805040000_guest_portal_session_current190";
const EXPECTED_ARTIFACT_HEAD_SHA256 =
  "d23c0e8fbdfddd0eb9ec7a73d877e7bbcde8c170683247a66f43530cca3867d5";
const EXPECTED_ARTIFACT_MANIFEST_DIGEST =
  "3220929d1a33fd20748de14427bf3bd041e1c20445d9525b7fb0a560f8baf476";
const EXCLUDED_CURRENT187_E_DIRECTORY =
  "20260805050000_identity_mail_ddl_fence_ledger_current187";
const IN_MEMORY_SCHEMA_TEXT = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

const BUILTIN_DEPENDENCY_BOUNDARY = deepFreeze({
  callerSuppliedCapabilityInvoked: false,
  externalEffectsUnverified: false,
  mode: "BUILTIN_PINNED_REPOSITORY_READS",
});
const TEST_ONLY_DEPENDENCY_BOUNDARY = deepFreeze({
  callerSuppliedCapabilityInvoked: true,
  externalEffectsUnverified: true,
  mode: "CALLER_SUPPLIED_TEST_ONLY_READ_CAPABILITY",
});

export class Current180Current190DisposableAssemblyError extends Error {
  constructor(code, findings) {
    super("CURRENT180-CURRENT190 disposable assembly failed closed.");
    this.name = "Current180Current190DisposableAssemblyError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort(compareText));
  }
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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
  const descriptorKeys = Reflect.ownKeys(descriptors);
  if (
    descriptorKeys.some(
      (key) =>
        typeof key !== "string" || !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    return null;
  }
  return descriptors;
}

function exactKeys(value, expected) {
  const descriptors = ownDataDescriptors(value);
  return (
    descriptors !== null &&
    canonicalJson(Object.keys(descriptors).sort(compareText)) ===
      canonicalJson([...expected].sort(compareText))
  );
}

function allowedKeyDescriptors(value, allowed) {
  const descriptors = ownDataDescriptors(value);
  if (
    descriptors === null ||
    Object.keys(descriptors).some((key) => !allowed.includes(key))
  ) {
    return null;
  }
  return descriptors;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationManifestDigest(entries) {
  return sha256(
    `${entries.map(({ name, sha256: digest }) => `${name} ${digest}`).join("\n")}\n`,
  );
}

function fail(code, findings) {
  throw new Current180Current190DisposableAssemblyError(code, findings);
}

function inspectionEffects(dependencyBoundary) {
  return {
    callerSuppliedEffectsUnverified:
      dependencyBoundary.externalEffectsUnverified,
    databaseConnectionOpenedByAssembler: false,
    externalProviderCallAttemptedByAssembler: false,
    filesystemReadPerformed: true,
    filesystemWriteAttemptedByAssembler: false,
    migrationCommandExecutedByAssembler: false,
    networkCallAttemptedByAssembler: false,
    processSpawnAttemptedByAssembler: false,
    productionStateReadByAssembler: false,
    roleOrGrantMutationAttemptedByAssembler: false,
    routeActivationAttemptedByAssembler: false,
    scope: "ASSEMBLER_IMPLEMENTATION_ONLY",
  };
}

function blockedAuthorization() {
  return {
    canActivateRoutes: false,
    canApplyDatabase: false,
    canAssembleInMemoryArtifact: false,
    canCallExternalProviders: false,
    canCallNetwork: false,
    canCleanupOwnedDisposableTempArtifact: false,
    canConnectDatabase: false,
    canDeploy: false,
    canInspectFrozenRepositorySources: false,
    canMaterializeDisposableTempArtifact: false,
    canMutateCanonicalMigrations: false,
    canMutateGrants: false,
    canMutateMigrationCandidates: false,
    canMutateProduction: false,
    canMutateReleaseProposals: false,
    canProvisionRoles: false,
    canResolveMigration: false,
    canSpawnProcess: false,
    productionApplyAuthorized: false,
  };
}

function blockedReport(
  findings,
  dependencyBoundary,
  allowManifestSha256 = null,
) {
  return deepFreeze({
    allowManifestSha256,
    authorization: blockedAuthorization(),
    contract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_CONTRACT,
    dependencyBoundary,
    effects: inspectionEffects(dependencyBoundary),
    findings: [...new Set(findings)].sort(compareText),
    status: "DISPOSABLE_ASSEMBLY_SOURCE_DRIFT_BLOCKED",
    verified: false,
  });
}

function parseJson(bytes, finding, findings) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    findings.push(finding);
    return null;
  }
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

function safeRepositoryRelativeDirectory(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:/u.test(value) &&
    !value
      .split("/")
      .some((part) => part.length === 0 || part === "." || part === "..")
  );
}

function canonicalUtf8Text(bytes, finding, { normalizeLineEndings }) {
  const value = Buffer.from(bytes);
  if (
    value.length === 0 ||
    value.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ||
    value.includes(0x00)
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  const text = value.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(value)) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  const withoutCrLf = text.replaceAll("\r\n", "");
  const hasCrLf = text.includes("\r\n");
  const hasLoneCr = withoutCrLf.includes("\r");
  const hasMixedLfAndCrLf = hasCrLf && withoutCrLf.includes("\n");
  if (hasLoneCr || hasMixedLfAndCrLf || (!normalizeLineEndings && hasCrLf)) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  return normalizeLineEndings ? text.replaceAll("\r\n", "\n") : text;
}

async function builtinListEntries(path) {
  return (await readdir(path, { withFileTypes: true }))
    .map((entry) => ({
      name: entry.name,
      type: entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : "other",
    }))
    .sort((left, right) => compareText(left.name, right.name));
}

async function builtinPathInfo(path) {
  const [stat, realPath] = await Promise.all([lstat(path), realpath(path)]);
  return {
    realPath,
    symbolicLink: stat.isSymbolicLink(),
    type: stat.isFile() ? "file" : stat.isDirectory() ? "directory" : "other",
  };
}

async function loadRepositoryProvenance(dependencies) {
  let repositoryInfo;
  try {
    repositoryInfo = await dependencies.pathInfo(REPOSITORY_ROOT);
  } catch {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "REPOSITORY_ROOT_PROVENANCE_READ_FAILED",
    ]);
  }
  if (
    !exactKeys(repositoryInfo, ["realPath", "symbolicLink", "type"]) ||
    repositoryInfo.type !== "directory" ||
    repositoryInfo.symbolicLink !== false ||
    typeof repositoryInfo.realPath !== "string" ||
    !isAbsolute(repositoryInfo.realPath)
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "REPOSITORY_ROOT_PROVENANCE_INVALID",
    ]);
  }
  return Object.freeze({
    lexicalRoot: REPOSITORY_ROOT,
    realRoot: resolve(repositoryInfo.realPath),
  });
}

async function assertRepositoryPathProvenance(
  path,
  expectedType,
  finding,
  dependencies,
  repositoryProvenance,
) {
  const lexicalPath = resolve(path);
  const lexicalRelative = relative(
    repositoryProvenance.lexicalRoot,
    lexicalPath,
  );
  if (
    lexicalRelative === ".." ||
    lexicalRelative.startsWith(`..${sep}`) ||
    isAbsolute(lexicalRelative)
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  let pathInfo;
  try {
    pathInfo = await dependencies.pathInfo(lexicalPath);
  } catch {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  const expectedRealPath = resolve(
    repositoryProvenance.realRoot,
    lexicalRelative,
  );
  if (
    !exactKeys(pathInfo, ["realPath", "symbolicLink", "type"]) ||
    pathInfo.type !== expectedType ||
    pathInfo.symbolicLink !== false ||
    typeof pathInfo.realPath !== "string" ||
    resolve(pathInfo.realPath) !== expectedRealPath ||
    (lexicalRelative.length > 0 &&
      !isStrictDescendant(
        resolve(pathInfo.realPath),
        repositoryProvenance.realRoot,
      ))
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
}

async function readVerifiedRepositoryFile(
  path,
  finding,
  dependencies,
  repositoryProvenance,
) {
  await assertRepositoryPathProvenance(
    path,
    "file",
    finding,
    dependencies,
    repositoryProvenance,
  );
  let bytes;
  try {
    bytes = Buffer.from(await dependencies.readBytes(path));
  } catch {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  await assertRepositoryPathProvenance(
    path,
    "file",
    finding,
    dependencies,
    repositoryProvenance,
  );
  return bytes;
}

async function listVerifiedRepositoryDirectory(
  path,
  finding,
  dependencies,
  repositoryProvenance,
) {
  await assertRepositoryPathProvenance(
    path,
    "directory",
    finding,
    dependencies,
    repositoryProvenance,
  );
  let entries;
  try {
    entries = await dependencies.listEntries(path);
  } catch {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [finding]);
  }
  await assertRepositoryPathProvenance(
    path,
    "directory",
    finding,
    dependencies,
    repositoryProvenance,
  );
  return entries;
}

function assertAllowManifest(manifest, findings) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.contract !==
      CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT ||
    manifest?.status !== "IN_MEMORY_ASSEMBLY_ONLY"
  ) {
    findings.push("ALLOW_MANIFEST_IDENTITY_INVALID");
  }
  if (
    manifest?.source?.refreezeManifestContract !==
      CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT ||
    manifest?.source?.refreezeManifestSha256 !==
      CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256 ||
    manifest?.source?.materializationPlanDigest !==
      "55fc45e1d284c82fd738ddde8d3c7f9028fc8c8a955f546f7af2f13d4ee9763" ||
    manifest?.source?.frozenSourceBytesMayChange !== false ||
    manifest?.source?.frozenSourceSqlTransformation !== "BYTE_EXACT_COPY_ONLY"
  ) {
    findings.push("ALLOW_MANIFEST_SOURCE_BINDING_INVALID");
  }
  if (
    canonicalJson(manifest?.canonicalBase) !==
    canonicalJson({
      count: EXPECTED_CANONICAL_COUNT,
      artifactLineEndings: "LF",
      head: EXPECTED_CANONICAL_HEAD,
      headChecksum: EXPECTED_CANONICAL_HEAD_SHA256,
      manifestDigest: EXPECTED_CANONICAL_MANIFEST_DIGEST,
      migrationLockSha256: EXPECTED_MIGRATION_LOCK_SHA256,
      sourceLineEndingNormalization: "CRLF_OR_LF_TO_LF",
    })
  ) {
    findings.push("ALLOW_MANIFEST_CANONICAL_BINDING_INVALID");
  }
  if (
    manifest?.artifact?.migrationCount !== EXPECTED_ARTIFACT_COUNT ||
    manifest?.artifact?.head !== EXPECTED_ARTIFACT_HEAD ||
    manifest?.artifact?.headChecksum !== EXPECTED_ARTIFACT_HEAD_SHA256 ||
    manifest?.artifact?.migrationManifestDigest !==
      EXPECTED_ARTIFACT_MANIFEST_DIGEST ||
    manifest?.artifact?.layout !== "IN_MEMORY_PRISMA_MIGRATIONS_V1" ||
    manifest?.artifact?.schemaEntry !== "schema.prisma" ||
    manifest?.artifact?.migrationLockEntry !==
      "migrations/migration_lock.toml" ||
    manifest?.artifact?.entryContentEncoding !== "UTF8_TEXT_LF" ||
    manifest?.artifact?.canonicalSourceLineEndingNormalization !==
      "CONSISTENT_CRLF_OR_LF_TO_LF" ||
    manifest?.artifact?.frozenSourceSqlTransformation !== "BYTE_EXACT_COPY_ONLY"
  ) {
    findings.push("ALLOW_MANIFEST_ARTIFACT_BINDING_INVALID");
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
  if (
    canonicalJson(manifest?.assemblyBoundary) !==
    canonicalJson(expectedAssemblyBoundary)
  ) {
    findings.push("ALLOW_MANIFEST_ASSEMBLY_BOUNDARY_INVALID");
  }
  const expectedAuthorization = {
    canActivateRoutes: false,
    canApplyDatabase: false,
    canAssembleInMemoryArtifact: true,
    canCallExternalProviders: false,
    canCallNetwork: false,
    canCleanupOwnedDisposableTempArtifact: false,
    canConnectDatabase: false,
    canDeploy: false,
    canInspectFrozenRepositorySources: true,
    canMaterializeDisposableTempArtifact: false,
    canMutateCanonicalMigrations: false,
    canMutateGrants: false,
    canMutateMigrationCandidates: false,
    canMutateProduction: false,
    canMutateReleaseProposals: false,
    canProvisionRoles: false,
    canResolveMigration: false,
    canSpawnProcess: false,
    productionApplyAuthorized: false,
  };
  if (
    canonicalJson(manifest?.authorization) !==
    canonicalJson(expectedAuthorization)
  ) {
    findings.push("ALLOW_MANIFEST_AUTHORIZATION_INVALID");
  }
  if (
    manifest?.excludedAuxiliaryEvidenceLane?.ordinal !== 187 ||
    manifest?.excludedAuxiliaryEvidenceLane?.targetDirectory !==
      EXCLUDED_CURRENT187_E_DIRECTORY ||
    manifest?.excludedAuxiliaryEvidenceLane?.contract !==
      "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1" ||
    manifest?.excludedAuxiliaryEvidenceLane?.mustNeverEnterSchemaLane !==
      true ||
    manifest?.excludedAuxiliaryEvidenceLane?.databaseBoundary !==
      "SEPARATE_LP_C187E_LOOPBACK_CI_ONLY"
  ) {
    findings.push("ALLOW_MANIFEST_AUXILIARY_EXCLUSION_INVALID");
  }
}

function refreezeSchemaProjection(refreezeManifest) {
  return refreezeManifest.schemaLane.map((entry) => ({
    migrationSqlSha256: entry.migrationSqlSha256,
    ordinal: entry.ordinal,
    sourceDirectory: entry.sourceDirectory,
    targetDirectory: entry.targetDirectory,
  }));
}

function allowSchemaProjection(allowManifest) {
  return allowManifest.schemaLane.map((entry) => ({ ...entry }));
}

async function loadVerifiedBundle({
  dependencyBoundary,
  listEntries,
  pathInfo,
  readBytes,
}) {
  const dependencies = { listEntries, pathInfo, readBytes };
  const repositoryProvenance = await loadRepositoryProvenance(dependencies);

  const inspectionChain = [];
  for (const entry of INSPECTION_CHAIN) {
    const bytes = await readVerifiedRepositoryFile(
      entry.path,
      "INSPECTION_CHAIN_SOURCE_PROVENANCE_INVALID",
      dependencies,
      repositoryProvenance,
    );
    if (sha256(bytes) !== entry.sha256) {
      fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
        "INSPECTION_CHAIN_SOURCE_BYTES_DRIFT",
      ]);
    }
    const source = canonicalUtf8Text(
      bytes,
      "INSPECTION_CHAIN_SOURCE_ENCODING_DRIFT",
      { normalizeLineEndings: true },
    );
    const noEffectsAuditSource = source.replaceAll("process.env.NODE_ENV", "");
    if (
      /node:child_process|@prisma|PrismaClient|from\s+["']pg["']|node:http|node:https|nodemailer|fetch\s*\(|process\.env/u.test(
        noEffectsAuditSource,
      )
    ) {
      fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
        "INSPECTION_CHAIN_EFFECTFUL_CAPABILITY_DETECTED",
      ]);
    }
    inspectionChain.push({
      repositoryPath: entry.repositoryPath,
      sha256: entry.sha256,
    });
  }

  const [allowBytes, refreezeBytes] = await Promise.all([
    readVerifiedRepositoryFile(
      ALLOW_MANIFEST_PATH,
      "ALLOW_MANIFEST_SOURCE_PROVENANCE_INVALID",
      dependencies,
      repositoryProvenance,
    ),
    readVerifiedRepositoryFile(
      REFREEZE_MANIFEST_PATH,
      "REFREEZE_MANIFEST_SOURCE_PROVENANCE_INVALID",
      dependencies,
      repositoryProvenance,
    ),
  ]);
  const allowManifestSha256 = sha256(allowBytes);
  if (
    allowManifestSha256 !==
    CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_MANIFEST_SHA256
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "ALLOW_MANIFEST_BYTES_DRIFT",
    ]);
  }
  if (
    sha256(refreezeBytes) !== CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "REFREEZE_MANIFEST_BYTES_DRIFT",
    ]);
  }

  const manifestFindings = [];
  const allowManifest = parseJson(
    allowBytes,
    "ALLOW_MANIFEST_JSON_INVALID",
    manifestFindings,
  );
  const refreezeManifest = parseJson(
    refreezeBytes,
    "REFREEZE_MANIFEST_JSON_INVALID",
    manifestFindings,
  );
  if (allowManifest !== null) {
    assertAllowManifest(allowManifest, manifestFindings);
  }
  if (
    refreezeManifest?.contract !==
      CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT ||
    refreezeManifest?.status !== "NOT_DEPLOYABLE" ||
    !Array.isArray(refreezeManifest?.schemaLane) ||
    !Array.isArray(refreezeManifest?.auxiliaryEvidenceLane)
  ) {
    manifestFindings.push("REFREEZE_MANIFEST_STRUCTURE_INVALID");
  }
  if (
    allowManifest !== null &&
    refreezeManifest !== null &&
    Array.isArray(allowManifest.schemaLane) &&
    Array.isArray(refreezeManifest.schemaLane) &&
    canonicalJson(allowSchemaProjection(allowManifest)) !==
      canonicalJson(refreezeSchemaProjection(refreezeManifest))
  ) {
    manifestFindings.push("ALLOW_REFREEZE_SCHEMA_LANE_MISMATCH");
  }
  if (
    refreezeManifest?.auxiliaryEvidenceLane?.length !== 1 ||
    refreezeManifest.auxiliaryEvidenceLane[0]?.sourceDirectory
      ?.split("/")
      .at(-1) !== EXCLUDED_CURRENT187_E_DIRECTORY ||
    refreezeManifest.auxiliaryEvidenceLane[0]?.mustNeverEnterSchemaLane !== true
  ) {
    manifestFindings.push("REFREEZE_AUXILIARY_LANE_INVALID");
  }
  if (manifestFindings.length > 0 || allowManifest === null) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", manifestFindings);
  }

  const canonicalRootEntries = await listVerifiedRepositoryDirectory(
    CANONICAL_MIGRATIONS_DIRECTORY,
    "CANONICAL_DIRECTORY_PROVENANCE_INVALID",
    dependencies,
    repositoryProvenance,
  );
  const canonicalNames = canonicalRootEntries
    .filter(({ type }) => type === "directory")
    .map(({ name }) => name)
    .sort(compareText);
  if (
    canonicalNames.length !== EXPECTED_CANONICAL_COUNT ||
    canonicalNames.some((name) => !MIGRATION_DIRECTORY_PATTERN.test(name)) ||
    canonicalRootEntries.some(
      ({ name, type }) =>
        (type === "directory" && !canonicalNames.includes(name)) ||
        (type !== "directory" &&
          !(name === "migration_lock.toml" && type === "file")),
    ) ||
    canonicalRootEntries.length !== EXPECTED_CANONICAL_COUNT + 1
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "CANONICAL_DIRECTORY_SET_DRIFT",
    ]);
  }

  let migrationLockBytes = await readVerifiedRepositoryFile(
    MIGRATION_LOCK_PATH,
    "MIGRATION_LOCK_SOURCE_PROVENANCE_INVALID",
    dependencies,
    repositoryProvenance,
  );
  migrationLockBytes = Buffer.from(
    canonicalUtf8Text(migrationLockBytes, "MIGRATION_LOCK_ENCODING_DRIFT", {
      normalizeLineEndings: true,
    }),
    "utf8",
  );
  if (sha256(migrationLockBytes) !== EXPECTED_MIGRATION_LOCK_SHA256) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "MIGRATION_LOCK_BYTES_DRIFT",
    ]);
  }

  const internalMigrations = [];
  for (let index = 0; index < canonicalNames.length; index += 1) {
    const name = canonicalNames[index];
    const directory = join(CANONICAL_MIGRATIONS_DIRECTORY, name);
    const entries = await listVerifiedRepositoryDirectory(
      directory,
      "CANONICAL_MIGRATION_DIRECTORY_PROVENANCE_INVALID",
      dependencies,
      repositoryProvenance,
    );
    let bytes = await readVerifiedRepositoryFile(
      join(directory, "migration.sql"),
      "CANONICAL_MIGRATION_SQL_PROVENANCE_INVALID",
      dependencies,
      repositoryProvenance,
    );
    if (
      canonicalJson(entries) !==
      canonicalJson([{ name: "migration.sql", type: "file" }])
    ) {
      fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
        "CANONICAL_MIGRATION_FILE_SET_DRIFT",
      ]);
    }
    bytes = Buffer.from(bytes);
    const text = canonicalUtf8Text(
      bytes,
      "CANONICAL_MIGRATION_SQL_ENCODING_DRIFT",
      { normalizeLineEndings: true },
    );
    const artifactBytes = Buffer.from(text, "utf8");
    internalMigrations.push({
      byteLength: artifactBytes.length,
      content: text,
      name,
      ordinal: index + 1,
      sha256: sha256(artifactBytes),
      sourceDirectory: `packages/database/prisma/migrations/${name}`,
      sourceKind: "CANONICAL_MIGRATION",
    });
  }

  if (
    internalMigrations.at(-1)?.name !== EXPECTED_CANONICAL_HEAD ||
    internalMigrations.at(-1)?.sha256 !== EXPECTED_CANONICAL_HEAD_SHA256 ||
    migrationManifestDigest(internalMigrations) !==
      EXPECTED_CANONICAL_MANIFEST_DIGEST
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "CANONICAL_MIGRATION_MANIFEST_DRIFT",
    ]);
  }

  const schemaOrdinals = allowManifest.schemaLane.map(({ ordinal }) => ordinal);
  if (
    canonicalJson(schemaOrdinals) !==
      canonicalJson([180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190]) ||
    allowManifest.schemaLane.some(
      ({ targetDirectory }) =>
        targetDirectory === EXCLUDED_CURRENT187_E_DIRECTORY,
    )
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "ASSEMBLY_SCHEMA_LANE_INVALID",
    ]);
  }

  for (const entry of allowManifest.schemaLane) {
    if (
      !exactKeys(entry, [
        "migrationSqlSha256",
        "ordinal",
        "sourceDirectory",
        "targetDirectory",
      ]) ||
      !MIGRATION_DIRECTORY_PATTERN.test(entry.targetDirectory) ||
      !safeRepositoryRelativeDirectory(entry.sourceDirectory) ||
      !SHA256_PATTERN.test(entry.migrationSqlSha256)
    ) {
      fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
        "ASSEMBLY_SCHEMA_ENTRY_INVALID",
      ]);
    }
    const sourceDirectory = resolve(
      REPOSITORY_ROOT,
      ...entry.sourceDirectory.split("/"),
    );
    if (!isStrictDescendant(sourceDirectory, REPOSITORY_ROOT)) {
      fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
        "ASSEMBLY_SOURCE_PATH_ESCAPES_REPOSITORY",
      ]);
    }
    await assertRepositoryPathProvenance(
      sourceDirectory,
      "directory",
      `CURRENT${entry.ordinal}_SOURCE_DIRECTORY_PROVENANCE_INVALID`,
      dependencies,
      repositoryProvenance,
    );
    const bytes = await readVerifiedRepositoryFile(
      join(sourceDirectory, "migration.sql"),
      `CURRENT${entry.ordinal}_SOURCE_SQL_PROVENANCE_INVALID`,
      dependencies,
      repositoryProvenance,
    );
    const text = canonicalUtf8Text(
      bytes,
      `CURRENT${entry.ordinal}_SOURCE_SQL_ENCODING_DRIFT`,
      { normalizeLineEndings: false },
    );
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== entry.migrationSqlSha256) {
      fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
        `CURRENT${entry.ordinal}_SOURCE_SQL_BYTE_DRIFT`,
      ]);
    }
    internalMigrations.push({
      byteLength: bytes.length,
      content: text,
      name: entry.targetDirectory,
      ordinal: entry.ordinal,
      sha256: actualSha256,
      sourceDirectory: entry.sourceDirectory,
      sourceKind:
        entry.ordinal === 187
          ? "REVIEWED_RELEASE_PROPOSAL"
          : "FROZEN_MIGRATION_CANDIDATE",
    });
  }

  const names = internalMigrations.map(({ name }) => name);
  if (
    internalMigrations.length !== EXPECTED_ARTIFACT_COUNT ||
    new Set(names).size !== EXPECTED_ARTIFACT_COUNT ||
    canonicalJson([...names].sort(compareText)) !== canonicalJson(names) ||
    names.includes(EXCLUDED_CURRENT187_E_DIRECTORY) ||
    internalMigrations.at(-1)?.name !== EXPECTED_ARTIFACT_HEAD ||
    internalMigrations.at(-1)?.sha256 !== EXPECTED_ARTIFACT_HEAD_SHA256 ||
    migrationManifestDigest(internalMigrations) !==
      EXPECTED_ARTIFACT_MANIFEST_DIGEST
  ) {
    fail("DISPOSABLE_ASSEMBLY_SOURCE_INTEGRITY_BLOCKED", [
      "ASSEMBLY_ARTIFACT_MANIFEST_DRIFT",
    ]);
  }

  const publicPlan = {
    allowManifestSha256,
    assemblyBoundary: { ...allowManifest.assemblyBoundary },
    artifact: {
      canonicalSourceLineEndingNormalization: "CONSISTENT_CRLF_OR_LF_TO_LF",
      entryContentEncoding: "UTF8_TEXT_LF",
      frozenSourceSqlTransformation: "BYTE_EXACT_COPY_ONLY",
      head: EXPECTED_ARTIFACT_HEAD,
      headChecksum: EXPECTED_ARTIFACT_HEAD_SHA256,
      layout: allowManifest.artifact.layout,
      migrationCount: EXPECTED_ARTIFACT_COUNT,
      migrationManifestDigest: EXPECTED_ARTIFACT_MANIFEST_DIGEST,
      migrationLockSha256: EXPECTED_MIGRATION_LOCK_SHA256,
    },
    authorization: { ...allowManifest.authorization },
    contract: CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_PLAN_CONTRACT,
    dependencyBoundary,
    effects: inspectionEffects(dependencyBoundary),
    excludedAuxiliaryEvidenceLane: {
      ...allowManifest.excludedAuxiliaryEvidenceLane,
    },
    findings: [
      "DATABASE_APPLY_FORBIDDEN",
      "EXTERNAL_PREDECESSOR_EVIDENCE_UNRESOLVED",
      "FILESYSTEM_MATERIALIZATION_FORBIDDEN",
      "PRODUCTION_AUTHORIZATION_ABSENT",
      "RUNTIME_ROLE_BINDINGS_UNRESOLVED",
      "POSTGRESQL_REHEARSAL_RUNNER_REQUIRED",
    ],
    inspectionChain,
    migrations: internalMigrations.map(
      ({
        byteLength,
        name,
        ordinal,
        sha256: digest,
        sourceDirectory,
        sourceKind,
      }) => ({
        byteLength,
        name,
        ordinal,
        sha256: digest,
        sourceDirectory,
        sourceKind,
      }),
    ),
    refreezeManifestSha256: CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256,
    status: "FROZEN_IN_MEMORY_ASSEMBLY_PLANNED",
    verified: true,
  };
  const assemblyPlanDigest = sha256(canonicalJson(publicPlan));
  return {
    allowManifest,
    internalMigrations,
    migrationLockText: migrationLockBytes.toString("utf8"),
    plan: deepFreeze({ ...publicPlan, assemblyPlanDigest }),
  };
}

async function inspectInternal(dependencies) {
  try {
    return (await loadVerifiedBundle(dependencies)).plan;
  } catch (error) {
    if (error instanceof Current180Current190DisposableAssemblyError) {
      return blockedReport(
        error.findings,
        dependencies.dependencyBoundary,
        error.findings.includes("ALLOW_MANIFEST_BYTES_DRIFT")
          ? null
          : undefined,
      );
    }
    return blockedReport(
      ["DISPOSABLE_ASSEMBLY_INSPECTION_FAILED"],
      dependencies.dependencyBoundary,
    );
  }
}

function assertEmptyOptions(options, code) {
  if (!exactKeys(options, [])) {
    fail(code, ["OPTIONS_SHAPE_INVALID"]);
  }
}

export async function inspectCurrent180Current190DisposableReleaseAssembly(
  options = {},
) {
  assertEmptyOptions(options, "DISPOSABLE_ASSEMBLY_ARGUMENTS_INVALID");
  return inspectInternal({
    dependencyBoundary: BUILTIN_DEPENDENCY_BOUNDARY,
    listEntries: builtinListEntries,
    pathInfo: builtinPathInfo,
    readBytes: (path) => readFile(path),
  });
}

export async function inspectCurrent180Current190DisposableReleaseAssemblyForTestOnly(
  options = {},
) {
  const descriptors = allowedKeyDescriptors(options, [
    "listEntries",
    "pathInfo",
    "readBytes",
  ]);
  if (
    descriptors === null ||
    (Object.hasOwn(descriptors, "listEntries") &&
      typeof descriptors.listEntries.value !== "function") ||
    (Object.hasOwn(descriptors, "readBytes") &&
      typeof descriptors.readBytes.value !== "function") ||
    (Object.hasOwn(descriptors, "pathInfo") &&
      typeof descriptors.pathInfo.value !== "function")
  ) {
    fail("DISPOSABLE_ASSEMBLY_TEST_ARGUMENTS_INVALID", [
      "TEST_ONLY_OPTIONS_SHAPE_INVALID",
    ]);
  }
  return inspectInternal({
    dependencyBoundary: TEST_ONLY_DEPENDENCY_BOUNDARY,
    listEntries: Object.hasOwn(descriptors, "listEntries")
      ? descriptors.listEntries.value
      : builtinListEntries,
    pathInfo: Object.hasOwn(descriptors, "pathInfo")
      ? descriptors.pathInfo.value
      : builtinPathInfo,
    readBytes: Object.hasOwn(descriptors, "readBytes")
      ? descriptors.readBytes.value
      : (path) => readFile(path),
  });
}

function entryManifestDigest(entries) {
  return sha256(
    `${entries
      .map(({ path, sha256: digest }) => `${path} ${digest}`)
      .join("\n")}\n`,
  );
}

export async function assembleCurrent180Current190InMemoryArtifact(options) {
  if (
    !exactKeys(options, ["allowContract", "assemblyPlanDigest"]) ||
    options.allowContract !==
      CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_CONTRACT ||
    typeof options.assemblyPlanDigest !== "string" ||
    !SHA256_PATTERN.test(options.assemblyPlanDigest)
  ) {
    fail("DISPOSABLE_IN_MEMORY_ASSEMBLY_ARGUMENTS_INVALID", [
      "EXACT_IN_MEMORY_ASSEMBLY_ARGUMENTS_REQUIRED",
    ]);
  }

  const bundle = await loadVerifiedBundle({
    dependencyBoundary: BUILTIN_DEPENDENCY_BOUNDARY,
    listEntries: builtinListEntries,
    pathInfo: builtinPathInfo,
    readBytes: (path) => readFile(path),
  });
  if (options.assemblyPlanDigest !== bundle.plan.assemblyPlanDigest) {
    fail("DISPOSABLE_IN_MEMORY_ASSEMBLY_DENIED", [
      "ASSEMBLY_PLAN_DIGEST_MISMATCH",
    ]);
  }

  const entries = [
    {
      byteLength: Buffer.byteLength(IN_MEMORY_SCHEMA_TEXT, "utf8"),
      content: IN_MEMORY_SCHEMA_TEXT,
      path: "schema.prisma",
      sha256: sha256(IN_MEMORY_SCHEMA_TEXT),
      sourceKind: "ASSEMBLER_STATIC_SCHEMA",
    },
    {
      byteLength: Buffer.byteLength(bundle.migrationLockText, "utf8"),
      content: bundle.migrationLockText,
      path: "migrations/migration_lock.toml",
      sha256: sha256(bundle.migrationLockText),
      sourceKind: "CANONICAL_MIGRATION_LOCK_NORMALIZED_TO_LF",
    },
    ...bundle.internalMigrations.map((migration) => ({
      byteLength: migration.byteLength,
      content: migration.content,
      path: `migrations/${migration.name}/migration.sql`,
      sha256: migration.sha256,
      sourceKind: migration.sourceKind,
    })),
  ];
  const manifestDigest = entryManifestDigest(entries);
  const publicArtifact = {
    allowManifestSha256:
      CURRENT180_CURRENT190_DISPOSABLE_ASSEMBLY_ALLOW_MANIFEST_SHA256,
    assemblyBoundary: { ...bundle.allowManifest.assemblyBoundary },
    assemblyPlanDigest: bundle.plan.assemblyPlanDigest,
    authorization: {
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
    },
    contract: CURRENT180_CURRENT190_IN_MEMORY_ARTIFACT_CONTRACT,
    current187EAuxiliaryExcluded: true,
    effects: {
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
    },
    entries,
    entryCount: entries.length,
    entryManifestDigest: manifestDigest,
    migrationCount: EXPECTED_ARTIFACT_COUNT,
    migrationHead: EXPECTED_ARTIFACT_HEAD,
    migrationHeadChecksum: EXPECTED_ARTIFACT_HEAD_SHA256,
    migrationManifestDigest: EXPECTED_ARTIFACT_MANIFEST_DIGEST,
    refreezeManifestSha256: CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256,
    status: "FROZEN_IN_MEMORY_ARTIFACT_ASSEMBLED_NOT_RUNNABLE",
  };
  const inMemoryArtifactDigest = sha256(
    canonicalJson({
      ...publicArtifact,
      entries: entries.map(
        ({ byteLength, path, sha256: digest, sourceKind }) => ({
          byteLength,
          path,
          sha256: digest,
          sourceKind,
        }),
      ),
    }),
  );
  return deepFreeze({ ...publicArtifact, inMemoryArtifactDigest });
}

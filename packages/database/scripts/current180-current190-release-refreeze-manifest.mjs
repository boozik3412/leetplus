import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
  CURRENT180_CURRENT190_RESERVED_ANCHOR,
  CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
  CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
  CURRENT187_SOURCE_VERIFIER_CONTRACT,
  Current180Current190MaterializationPlanError,
  assertCurrent180Current190MaterializationAssemblyAllowed,
  inspectCurrent180Current190ReleaseMaterialization,
} from "./current180-current190-release-materialization-planner.mjs";

export const CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT =
  "CURRENT180_CURRENT190_RELEASE_REFREEZE_MANIFEST_V1";
export const CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256 =
  "55e4a55df4054c22261389d761aac8c34989a6022fefbd9c5f9d5bbb05b42296";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const PROPOSAL_ROOT = join(
  REPOSITORY_ROOT,
  "packages",
  "database",
  "release-proposals",
  "current180-current190",
);
const MANIFEST_PATH = join(PROPOSAL_ROOT, "refreeze-manifest.json");
const ANCHOR_DIRECTORY = join(
  PROPOSAL_ROOT,
  CURRENT180_CURRENT190_RESERVED_ANCHOR,
);
const ANCHOR_SQL_PATH = join(ANCHOR_DIRECTORY, "migration.sql");
const LOGICAL_ORDER = Object.freeze([
  180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190,
]);
const EXPECTED_PLAN_DIGEST =
  "7313c40a0fbcf5d04032ed311588118acae0c296aecb4cce82b70fdbc1fb08a4";
const EXPECTED_SOURCE_ARTIFACT_SET_DIGEST =
  "0b1e2b7451cf87ce40749bc16aff9524005923abb3b0c9718ba2dffb762c57ac";

const BUILTIN_READ_BOUNDARY = deepFreeze({
  callerSuppliedCapabilityInvoked: false,
  externalEffectsUnverified: false,
  mode: "BUILTIN_PINNED_CONTENT_READS",
});
const TEST_ONLY_READ_BOUNDARY = deepFreeze({
  callerSuppliedCapabilityInvoked: true,
  externalEffectsUnverified: true,
  mode: "TEST_ONLY_CALLER_SUPPLIED_READS",
});

export class Current180Current190RefreezeManifestError extends Error {
  constructor(code, findings) {
    super("CURRENT180-CURRENT190 release refreeze verification failed closed.");
    this.name = "Current180Current190RefreezeManifestError";
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    canonicalJson(Object.keys(value).sort(compareText)) ===
      canonicalJson([...expected].sort(compareText))
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function denyAuthorization() {
  return {
    canActivateRoutes: false,
    canAssemble: false,
    canCallExternalProviders: false,
    canDeploy: false,
    canMutateCanonicalMigrations: false,
    canMutateProduction: false,
    canProvisionRoles: false,
    canResolveMigration: false,
    canWrite: false,
    productionApplyAuthorized: false,
  };
}

function denyEffects() {
  return {
    anchorArtifactCreated: false,
    databaseConnectionOpened: false,
    externalProviderCallAttempted: false,
    filesystemWriteAttempted: false,
    migrationArtifactCreated: false,
    migrationCommandExecuted: false,
    productionStateRead: false,
    roleOrGrantMutationAttempted: false,
    routeActivationAttempted: false,
  };
}

function everyValueFalse(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).length > 0 &&
    Object.values(value).every((entry) => entry === false)
  );
}

function blockedReport(findings, dependencyBoundary, manifestSha256 = null) {
  return deepFreeze({
    authorization: denyAuthorization(),
    contract: CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT,
    dependencyBoundary,
    effects: denyEffects(),
    findings: [...new Set(findings)].sort(compareText),
    manifestSha256,
    manifestAndLaneSourcePathProvenanceVerified: false,
    status: "REFREEZE_SOURCE_DRIFT_BLOCKED",
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

function safeRelativeDirectory(relativePath) {
  return (
    typeof relativePath === "string" &&
    relativePath.length > 0 &&
    !relativePath.startsWith("/") &&
    !relativePath.startsWith("\\") &&
    !/^[A-Za-z]:/u.test(relativePath) &&
    !relativePath.split(/[\\/]/u).includes("..")
  );
}

function pathIsWithin(rootPath, candidatePath) {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

async function assertBuiltinRepositoryPath(path, expectedType) {
  const lexicalPath = resolve(path);
  if (!pathIsWithin(REPOSITORY_ROOT, lexicalPath)) {
    throw new Error("BUILTIN_REPOSITORY_PATH_ESCAPE");
  }
  const relativePath = relative(REPOSITORY_ROOT, lexicalPath);
  let currentPath = REPOSITORY_ROOT;
  for (const component of relativePath.split(/[\\/]/u).filter(Boolean)) {
    const currentStat = await lstat(currentPath);
    if (currentStat.isSymbolicLink()) {
      throw new Error("BUILTIN_REPOSITORY_PATH_ANCESTOR_LINK_FORBIDDEN");
    }
    currentPath = join(currentPath, component);
  }
  const [repositoryRealPath, pathStat, resolvedPath] = await Promise.all([
    realpath(REPOSITORY_ROOT),
    lstat(lexicalPath),
    realpath(lexicalPath),
  ]);
  if (
    pathStat.isSymbolicLink() ||
    !pathIsWithin(repositoryRealPath, resolvedPath) ||
    (expectedType === "file" && !pathStat.isFile()) ||
    (expectedType === "directory" && !pathStat.isDirectory())
  ) {
    throw new Error("BUILTIN_REPOSITORY_PATH_PROVENANCE_INVALID");
  }
  return { repositoryRealPath, resolvedPath };
}

async function builtinReadBytes(path) {
  const { resolvedPath } = await assertBuiltinRepositoryPath(path, "file");
  return readFile(resolvedPath);
}

async function builtinListEntries(path) {
  const { repositoryRealPath, resolvedPath } =
    await assertBuiltinRepositoryPath(path, "directory");
  const entries = await readdir(resolvedPath, { withFileTypes: true });
  const verifiedEntries = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(resolvedPath, entry.name);
      const [entryStat, entryRealPath] = await Promise.all([
        lstat(entryPath),
        realpath(entryPath),
      ]);
      if (
        entryStat.isSymbolicLink() ||
        !pathIsWithin(repositoryRealPath, entryRealPath) ||
        !pathIsWithin(resolvedPath, entryRealPath)
      ) {
        throw new Error("BUILTIN_REPOSITORY_ENTRY_PROVENANCE_INVALID");
      }
      return {
        name: entry.name,
        type: entryStat.isFile()
          ? "file"
          : entryStat.isDirectory()
            ? "directory"
            : "other",
      };
    }),
  );
  return verifiedEntries.sort((left, right) =>
    compareText(left.name, right.name),
  );
}

function expectedEntries(sourceFiles) {
  return sourceFiles.map(({ name }) => ({ name, type: "file" }));
}

async function verifySourceDirectory({
  entry,
  findings,
  listEntries,
  readBytes,
}) {
  if (!safeRelativeDirectory(entry?.sourceDirectory)) {
    findings.push(`SOURCE_${entry?.ordinal ?? "UNKNOWN"}_DIRECTORY_INVALID`);
    return null;
  }
  const absoluteDirectory = resolve(REPOSITORY_ROOT, entry.sourceDirectory);
  if (
    absoluteDirectory !== REPOSITORY_ROOT &&
    !absoluteDirectory.startsWith(`${REPOSITORY_ROOT}\\`) &&
    !absoluteDirectory.startsWith(`${REPOSITORY_ROOT}/`)
  ) {
    findings.push(`SOURCE_${entry.ordinal}_DIRECTORY_ESCAPES_REPOSITORY`);
    return null;
  }
  if (!Array.isArray(entry.sourceFiles) || entry.sourceFiles.length === 0) {
    findings.push(`SOURCE_${entry.ordinal}_FILE_MANIFEST_INVALID`);
    return null;
  }
  const expectedNames = [...entry.sourceFiles]
    .map(({ name }) => name)
    .sort(compareText);
  if (
    canonicalJson(expectedNames) !==
      canonicalJson(entry.sourceFiles.map(({ name }) => name) ?? []) ||
    new Set(expectedNames).size !== expectedNames.length
  ) {
    findings.push(`SOURCE_${entry.ordinal}_FILE_ORDER_INVALID`);
  }

  let actualEntries;
  try {
    actualEntries = await listEntries(absoluteDirectory);
  } catch {
    findings.push(`SOURCE_${entry.ordinal}_DIRECTORY_READ_FAILED`);
    return null;
  }
  if (
    canonicalJson(actualEntries) !==
    canonicalJson(expectedEntries(entry.sourceFiles))
  ) {
    findings.push(`SOURCE_${entry.ordinal}_FILE_SET_DRIFT`);
  }

  const actualFiles = [];
  let candidateBytes = null;
  for (const expectedFile of entry.sourceFiles) {
    if (
      !exactKeys(expectedFile, ["name", "sha256"]) ||
      typeof expectedFile.name !== "string" ||
      !/^[0-9a-f]{64}$/u.test(String(expectedFile.sha256 ?? ""))
    ) {
      findings.push(`SOURCE_${entry.ordinal}_FILE_MANIFEST_INVALID`);
      continue;
    }
    let bytes;
    try {
      bytes = Buffer.from(
        await readBytes(join(absoluteDirectory, expectedFile.name)),
      );
    } catch {
      findings.push(`SOURCE_${entry.ordinal}_${expectedFile.name}_READ_FAILED`);
      continue;
    }
    const actualSha256 = sha256(bytes);
    actualFiles.push({ name: expectedFile.name, sha256: actualSha256 });
    if (actualSha256 !== expectedFile.sha256) {
      findings.push(`SOURCE_${entry.ordinal}_${expectedFile.name}_BYTE_DRIFT`);
    }
    if (expectedFile.name === "candidate.json") candidateBytes = bytes;
  }

  if (
    actualFiles.length !== entry.sourceFiles.length ||
    sha256(canonicalJson(actualFiles)) !== entry.sourceDirectorySha256
  ) {
    findings.push(`SOURCE_${entry.ordinal}_DIRECTORY_DIGEST_DRIFT`);
  }
  return candidateBytes;
}

function verifyCandidateMetadata(entry, candidateBytes, findings) {
  if (candidateBytes === null) {
    findings.push(`SOURCE_${entry.ordinal}_CANDIDATE_MISSING`);
    return null;
  }
  const candidate = parseJson(
    candidateBytes,
    `SOURCE_${entry.ordinal}_CANDIDATE_JSON_INVALID`,
    findings,
  );
  if (candidate === null) return null;
  const expectedCandidateDirectory =
    entry.targetDirectory ?? entry.sourceDirectory.split("/").at(-1);
  if (
    candidate.ordinal !== entry.ordinal ||
    candidate.contract !== entry.contract ||
    candidate.candidate !== expectedCandidateDirectory ||
    candidate.migrationSqlSha256 !== entry.migrationSqlSha256 ||
    canonicalJson(candidate.predecessor) !== canonicalJson(entry.predecessor)
  ) {
    findings.push(`SOURCE_${entry.ordinal}_CANDIDATE_CONTRACT_DRIFT`);
  }
  if (
    entry.predecessorEvidence?.externalEvidenceRequired !== true ||
    entry.predecessorEvidence?.resolved !== false ||
    candidate.predecessor?.resolved === true
  ) {
    findings.push(`SOURCE_${entry.ordinal}_PREDECESSOR_GATE_INVALID`);
  }
  if (entry.authorization !== false || entry.effects !== false) {
    findings.push(`SOURCE_${entry.ordinal}_AUTHORITY_INVALID`);
  }
  return candidate;
}

function verifyAnchorCandidate(candidate, findings) {
  if (candidate === null) return;
  if (
    candidate.contract !== CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT ||
    candidate.sourceVerifierContract !== CURRENT187_SOURCE_VERIFIER_CONTRACT ||
    candidate.candidate !== CURRENT180_CURRENT190_RESERVED_ANCHOR ||
    candidate.ordinal !== 187 ||
    candidate.migrationSqlSha256 !==
      CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256 ||
    candidate.status !== "NOT_DEPLOYABLE" ||
    candidate.proposalOnly !== true ||
    candidate.authorization !== false ||
    candidate.effects !== false ||
    candidate.assemblyAuthorized !== false ||
    candidate.productionApplyAuthorized !== false
  ) {
    findings.push("ANCHOR_CANDIDATE_DENY_BOUNDARY_INVALID");
  }
  for (const key of [
    "canActivateApplicationRoute",
    "canCallExternalProviders",
    "canDeploy",
    "canMutateCanonicalMigrations",
    "canMutateProduction",
    "canProvisionRolesOrGrants",
    "canResolveMigration",
    "canWriteDatabase",
  ]) {
    if (candidate[key] !== false) {
      findings.push("ANCHOR_CANDIDATE_DENY_BOUNDARY_INVALID");
    }
  }
}

function verifyManifestStructure(manifest, findings) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.contract !== CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT ||
    manifest?.status !== "NOT_DEPLOYABLE" ||
    manifest?.proposalRoot !==
      "packages/database/release-proposals/current180-current190"
  ) {
    findings.push("REFREEZE_MANIFEST_IDENTITY_INVALID");
  }
  if (canonicalJson(manifest?.logicalOrder) !== canonicalJson(LOGICAL_ORDER)) {
    findings.push("REFREEZE_LOGICAL_ORDER_DRIFT");
  }
  if (
    !everyValueFalse(manifest?.authorization) ||
    canonicalJson(manifest?.authorization) !==
      canonicalJson(denyAuthorization())
  ) {
    findings.push("REFREEZE_AUTHORIZATION_INVALID");
  }
  if (
    !everyValueFalse(manifest?.effects) ||
    canonicalJson(manifest?.effects) !== canonicalJson(denyEffects())
  ) {
    findings.push("REFREEZE_EFFECTS_INVALID");
  }
  if (
    manifest?.predecessorPolicy?.allResolved !== false ||
    manifest?.predecessorPolicy?.candidateMetadataMayResolve !== false ||
    manifest?.predecessorPolicy?.externalEvidenceRequired !== true
  ) {
    findings.push("REFREEZE_PREDECESSOR_POLICY_INVALID");
  }
  if (
    manifest?.materializationPlanner?.contract !==
      CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT ||
    manifest?.materializationPlanner?.planDigest !== EXPECTED_PLAN_DIGEST ||
    manifest?.materializationPlanner?.sourceArtifactSetDigest !==
      EXPECTED_SOURCE_ARTIFACT_SET_DIGEST
  ) {
    findings.push("REFREEZE_PLANNER_BINDING_INVALID");
  }
}

function verifyLaneStructure(manifest, findings) {
  if (!Array.isArray(manifest?.schemaLane)) {
    findings.push("REFREEZE_SCHEMA_LANE_INVALID");
    return;
  }
  if (
    canonicalJson(manifest.schemaLane.map(({ ordinal }) => ordinal)) !==
    canonicalJson(LOGICAL_ORDER)
  ) {
    findings.push("REFREEZE_SCHEMA_LANE_ORDER_DRIFT");
  }
  const lexicalOrder = [...manifest.schemaLane]
    .sort((left, right) =>
      compareText(left.targetDirectory, right.targetDirectory),
    )
    .map(({ ordinal }) => ordinal);
  if (canonicalJson(lexicalOrder) !== canonicalJson(LOGICAL_ORDER)) {
    findings.push("REFREEZE_TARGET_DIRECTORY_ORDER_DRIFT");
  }
  if (
    manifest.schemaLane.filter(({ ordinal }) => ordinal === 187).length !== 1 ||
    manifest.schemaLane.some(
      ({ sourceDirectory }) =>
        sourceDirectory ===
        "packages/database/migration-candidates/20260805050000_identity_mail_ddl_fence_ledger_current187",
    )
  ) {
    findings.push("REFREEZE_CURRENT187_SCHEMA_LANE_INVALID");
  }
  if (
    !Array.isArray(manifest?.auxiliaryEvidenceLane) ||
    manifest.auxiliaryEvidenceLane.length !== 1 ||
    manifest.auxiliaryEvidenceLane[0]?.contract !==
      "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1" ||
    manifest.auxiliaryEvidenceLane[0]?.mustNeverEnterSchemaLane !== true ||
    manifest.auxiliaryEvidenceLane[0]?.databaseBoundary !==
      "SEPARATE_LP_C187E_LOOPBACK_CI_ONLY"
  ) {
    findings.push("REFREEZE_AUXILIARY_EVIDENCE_LANE_INVALID");
  }
}

function plannerSchemaProjection(manifest) {
  return manifest.schemaLane.map((entry) => ({
    contract: entry.contract,
    ordinal: entry.ordinal,
    sourceDirectory:
      entry.sourceKind === "RELEASE_PROPOSAL"
        ? null
        : entry.sourceDirectory.split("/").at(-1),
    sourceSqlSha256:
      entry.sourceKind === "RELEASE_PROPOSAL" ? null : entry.migrationSqlSha256,
    targetDirectory: entry.targetDirectory,
  }));
}

function actualPlannerSchemaProjection(plan) {
  return plan.schemaLane.map(
    ({
      contract,
      ordinal,
      sourceDirectory,
      sourceSqlSha256,
      targetDirectory,
    }) => ({
      contract,
      ordinal,
      sourceDirectory,
      sourceSqlSha256,
      targetDirectory,
    }),
  );
}

function verifyPlannerPlan(plan, manifest, findings) {
  if (
    plan?.contract !== CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT ||
    plan?.status !== "PLAN_COMPLETE_REFREEZE_REQUIRED" ||
    plan?.materializationPlanDigest !== EXPECTED_PLAN_DIGEST ||
    plan?.materializationPlanDigest !==
      manifest.materializationPlanner.planDigest
  ) {
    findings.push("REFREEZE_PLANNER_REPORT_DRIFT");
    return;
  }
  if (
    plan.anchor?.assessment?.valid !== true ||
    plan.anchor?.assessment?.present !== true ||
    plan.anchor?.assessment?.findings?.length !== 0 ||
    plan.anchor?.assessment?.normalizedSqlSha256 !==
      CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256 ||
    plan.anchor?.assessment?.reviewedSqlSha256 !==
      CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256
  ) {
    findings.push("REFREEZE_PLANNER_ANCHOR_REVIEW_DRIFT");
  }
  if (
    !everyValueFalse(plan.authorization) ||
    canonicalJson(plan.authorization) !== canonicalJson(denyAuthorization()) ||
    !everyValueFalse(plan.effects) ||
    canonicalJson(plan.effects) !== canonicalJson(denyEffects())
  ) {
    findings.push("REFREEZE_PLANNER_AUTHORITY_INVALID");
  }
  if (
    canonicalJson(actualPlannerSchemaProjection(plan)) !==
    canonicalJson(plannerSchemaProjection(manifest))
  ) {
    findings.push("REFREEZE_PLANNER_SCHEMA_LANE_DRIFT");
  }
  const schemaByOrdinal = new Map(
    manifest.schemaLane.map((entry) => [entry.ordinal, entry]),
  );
  const expectedPredecessorResolutionGraph = [
    {
      ordinal: 187,
      plannedResolution: [
        "CURRENT187_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTATION_V1",
        "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1",
        CURRENT187_SOURCE_VERIFIER_CONTRACT,
        CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
      ],
      requiredContract:
        manifest.auxiliaryEvidenceLane[0].predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
    {
      ordinal: 188,
      plannedResolution: [CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT],
      requiredContract: schemaByOrdinal.get(188)?.predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
    {
      ordinal: 189,
      plannedResolution: [schemaByOrdinal.get(188)?.contract],
      requiredContract: schemaByOrdinal.get(189)?.predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
    {
      ordinal: 190,
      plannedResolution: [schemaByOrdinal.get(189)?.contract],
      requiredContract: schemaByOrdinal.get(190)?.predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
  ];
  if (
    canonicalJson(plan.predecessorResolutionGraph) !==
    canonicalJson(expectedPredecessorResolutionGraph)
  ) {
    findings.push("REFREEZE_PLANNER_PREDECESSOR_GATE_INVALID");
  }
  if (
    plan.evidenceLane?.length !== 1 ||
    plan.evidenceLane[0]?.contract !==
      manifest.auxiliaryEvidenceLane[0].contract ||
    plan.evidenceLane[0]?.sourceSqlSha256 !==
      manifest.auxiliaryEvidenceLane[0].migrationSqlSha256 ||
    plan.evidenceLane[0]?.mustNeverEnterPrismaSchemaLane !== true
  ) {
    findings.push("REFREEZE_PLANNER_EVIDENCE_LANE_DRIFT");
  }

  let assemblyDenied = false;
  try {
    assertCurrent180Current190MaterializationAssemblyAllowed(plan);
  } catch (error) {
    assemblyDenied =
      error instanceof Current180Current190MaterializationPlanError &&
      error.code === "CURRENT180_CURRENT190_MATERIALIZATION_ASSEMBLY_DENIED";
  }
  if (!assemblyDenied) findings.push("REFREEZE_ASSEMBLY_NOT_DENIED");
}

async function inspectInternal({
  dependencyBoundary,
  listEntries,
  plannerInspect,
  readBytes,
}) {
  let manifestBytes;
  try {
    manifestBytes = Buffer.from(await readBytes(MANIFEST_PATH));
  } catch {
    return blockedReport(["REFREEZE_MANIFEST_READ_FAILED"], dependencyBoundary);
  }
  const actualManifestSha256 = sha256(manifestBytes);
  if (actualManifestSha256 !== CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256) {
    return blockedReport(
      ["REFREEZE_MANIFEST_BYTES_DRIFT"],
      dependencyBoundary,
      actualManifestSha256,
    );
  }

  const findings = [];
  const manifest = parseJson(
    manifestBytes,
    "REFREEZE_MANIFEST_JSON_INVALID",
    findings,
  );
  if (manifest === null) {
    return blockedReport(findings, dependencyBoundary, actualManifestSha256);
  }
  verifyManifestStructure(manifest, findings);
  verifyLaneStructure(manifest, findings);
  if (
    !Array.isArray(manifest.schemaLane) ||
    !Array.isArray(manifest.auxiliaryEvidenceLane)
  ) {
    return blockedReport(findings, dependencyBoundary, actualManifestSha256);
  }

  let anchorCandidate = null;
  for (const entry of [
    ...manifest.schemaLane,
    ...manifest.auxiliaryEvidenceLane,
  ]) {
    const candidateBytes = await verifySourceDirectory({
      entry,
      findings,
      listEntries,
      readBytes,
    });
    const candidate = verifyCandidateMetadata(entry, candidateBytes, findings);
    if (entry.sourceKind === "RELEASE_PROPOSAL") anchorCandidate = candidate;
  }
  verifyAnchorCandidate(anchorCandidate, findings);

  let anchorSql;
  try {
    anchorSql = normalizeText(
      Buffer.from(await readBytes(ANCHOR_SQL_PATH)).toString("utf8"),
    );
  } catch {
    findings.push("ANCHOR_SQL_READ_FAILED");
  }
  if (
    typeof anchorSql !== "string" ||
    sha256(anchorSql) !== CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256
  ) {
    findings.push("ANCHOR_SQL_REVIEWED_DIGEST_DRIFT");
  }
  if (findings.length > 0 || anchorCandidate === null) {
    return blockedReport(findings, dependencyBoundary, actualManifestSha256);
  }

  const anchorProposal = {
    contract: anchorCandidate.contract,
    directory: anchorCandidate.candidate,
    ordinal: anchorCandidate.ordinal,
    predecessor: anchorCandidate.predecessor,
    sourceVerifierContract: anchorCandidate.sourceVerifierContract,
    sql: anchorSql,
    sqlSha256: anchorCandidate.migrationSqlSha256,
  };
  let plan;
  try {
    plan = await plannerInspect({ anchorProposal });
  } catch {
    return blockedReport(
      ["REFREEZE_PLANNER_INVOCATION_FAILED"],
      dependencyBoundary,
      actualManifestSha256,
    );
  }
  verifyPlannerPlan(plan, manifest, findings);
  if (findings.length > 0) {
    return blockedReport(findings, dependencyBoundary, actualManifestSha256);
  }

  return deepFreeze({
    anchorSqlSha256: CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
    authorization: denyAuthorization(),
    contract: CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT,
    dependencyBoundary,
    effects: denyEffects(),
    findings: [
      "ASSEMBLY_FORBIDDEN",
      "EXTERNAL_PREDECESSOR_EVIDENCE_REQUIRED",
      "PRODUCTION_AUTHORIZATION_ABSENT",
      "SEPARATE_REVIEWED_ASSEMBLER_REQUIRED",
    ],
    logicalOrder: [...LOGICAL_ORDER],
    manifestSha256: actualManifestSha256,
    materializationPlanDigest: plan.materializationPlanDigest,
    manifestAndLaneSourcePathProvenanceVerified:
      dependencyBoundary.mode === "BUILTIN_PINNED_CONTENT_READS",
    status: "REFREEZE_VERIFIED_NOT_DEPLOYABLE",
    verified: true,
  });
}

export async function inspectCurrent180Current190ReleaseRefreezeManifest() {
  return inspectInternal({
    dependencyBoundary: BUILTIN_READ_BOUNDARY,
    listEntries: builtinListEntries,
    plannerInspect: inspectCurrent180Current190ReleaseMaterialization,
    readBytes: builtinReadBytes,
  });
}

export async function inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly(
  options = {},
) {
  if (
    !exactKeys(
      options,
      ["listEntries", "plannerInspect", "readBytes"].filter((key) =>
        Object.hasOwn(options, key),
      ),
    ) ||
    (Object.hasOwn(options, "listEntries") &&
      typeof options.listEntries !== "function") ||
    (Object.hasOwn(options, "plannerInspect") &&
      typeof options.plannerInspect !== "function") ||
    (Object.hasOwn(options, "readBytes") &&
      typeof options.readBytes !== "function")
  ) {
    throw new Current180Current190RefreezeManifestError(
      "REFREEZE_TEST_ARGUMENTS_INVALID",
      ["TEST_ONLY_OPTIONS_SHAPE_INVALID"],
    );
  }
  return inspectInternal({
    dependencyBoundary: TEST_ONLY_READ_BOUNDARY,
    listEntries: options.listEntries ?? builtinListEntries,
    plannerInspect:
      options.plannerInspect ??
      inspectCurrent180Current190ReleaseMaterialization,
    readBytes: options.readBytes ?? ((path) => readFile(path)),
  });
}

export function assertCurrent180Current190RefreezeAssemblyAllowed(report) {
  const findings = Array.isArray(report?.findings)
    ? report.findings
    : ["REFREEZE_REPORT_INVALID"];
  throw new Current180Current190RefreezeManifestError(
    "CURRENT180_CURRENT190_REFREEZE_ASSEMBLY_DENIED",
    [...findings, "SEPARATE_REVIEWED_ASSEMBLER_REQUIRED"],
  );
}

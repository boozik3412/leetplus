import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isProxy } from "node:util/types";

import {
  CURRENT180_CURRENT190_REHEARSAL_CONTRACT,
  Current180Current190ReleaseRehearsalBlockedError,
  inspectCurrent180Current190ReleaseRehearsal,
} from "./current180-current190-release-rehearsal-blocker.mjs";

export const CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT =
  "CURRENT180_CURRENT190_RELEASE_MATERIALIZATION_PLAN_V1";
export const CURRENT180_CURRENT190_RESERVED_ANCHOR =
  "20260805010000_identity_mail_cluster_application_admission_current187";
export const CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT =
  "IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1";
export const CURRENT187_SOURCE_VERIFIER_CONTRACT =
  "CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1";
export const CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256 =
  "24de1c767af0b0bd9d386c9c2df11455743bd0ee041edfd2ca17cdba7e01c2e7";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const DETECTOR_FILE = "current180-current190-release-rehearsal-blocker.mjs";
const DETECTOR_NORMALIZED_SHA256 =
  "e5249159473deec3dfb230bfd75666dada72547c830a6d73e6ca19f547122a79";
const SOURCE_ARTIFACT_SET_DIGEST =
  "7b2d29eb70674dd62450c322f33b2a689f64dd110a4c85e123b8bc517887919a";
const SOURCE_BLOCKER_DIGEST =
  "ddec0c400a08f04183ffc0348fd202cfa509973cd7b37973b4290eb482076916";
const SOURCE_CURRENT187_TOOLING_DIGEST =
  "56b8179eba18d891a15e569b090bb78685856650326752a181cb025850a94a61";
const SOURCE_PREVIOUS_FOUNDATION_TOOLING_DIGEST =
  "8141c8c5ac28967ca28b0f2aec91eb27c1df1250f41ce378bff114c9a863d817";
const CURRENT187_E_DIRECTORY =
  "20260805050000_identity_mail_ddl_fence_ledger_current187";
const CURRENT187_E_SQL_SHA256 =
  "dd5f4db5aecef2c537251bc5262063c1012a1383aec0d0137e7d8b9536f8bb63";
const CURRENT186_DIRECTORY =
  "20260804190000_identity_mail_duty_role_runtime_boundary_v2";
const CURRENT186_SQL_SHA256 =
  "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd";
const CURRENT186_MANIFEST_DIGEST =
  "d5143b06ab4e21ec99d5a6c600aa257effffd7ba4cdbbb156650ebdd378ffd16";
const SAFE_INSPECTION_DATABASE_URL =
  "postgresql://release_materialization@127.0.0.1:55432/lp_c180190_0123456789abcdef0123456789abcdef_ci";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

const BUILTIN_DEPENDENCY_BOUNDARY = deepFreeze({
  callerSuppliedCapabilityInvoked: false,
  externalEffectsUnverified: false,
  mode: "BUILTIN_PINNED_REPOSITORY_READS",
});

const LOGICAL_ORDINALS = Object.freeze([
  180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190,
]);
const SOURCE_SCHEMA_ORDINALS = new Set([
  180, 181, 182, 183, 184, 185, 186, 188, 189, 190,
]);
const EXPECTED_SOURCE_PRISMA_ORDER = Object.freeze([
  180, 181, 182, 183, 184, 185, 186, 188, 189, 190, 187,
]);
const EXPECTED_BLOCKER_CODES = Object.freeze([
  "DISPOSABLE_DATABASE_GUARD_INTERSECTION_EMPTY",
  "EXPLICIT_DUTY_ROLE_BINDING_REQUIRED",
  "PREVIOUS_FOUNDATION_INVENTORY_GATES_REJECT_STACK",
  "PRISMA_DIRECTORY_ORDER_CONFLICT",
  "REQUIRED_CONTRACT_NOT_MATERIALIZED_IN_CANDIDATE_CHAIN",
  "REQUIRED_CONTRACT_NOT_MATERIALIZED_IN_CANDIDATE_CHAIN",
  "UNRESOLVED_PREDECESSOR_CONTRACT",
  "UNRESOLVED_PREDECESSOR_CONTRACT",
  "UNRESOLVED_PREDECESSOR_CONTRACT",
  "UNRESOLVED_PREDECESSOR_CONTRACT",
]);

const RESERVED_ANCHOR_PREDECESSOR = deepFreeze({
  count: 187,
  head: CURRENT186_DIRECTORY,
  headChecksum: CURRENT186_SQL_SHA256,
  manifestDigest: CURRENT186_MANIFEST_DIGEST,
});

const ROLE_BINDING_REQUIREMENTS = deepFreeze([
  {
    expectedName: null,
    key: "admissionScanner",
    requiredEvidence: "LIVE_LOGIN_NAME_OID_AND_CLUSTER_CATALOG_ATTESTATION",
  },
  {
    expectedName: null,
    key: "applicationRuntime",
    requiredEvidence: "LIVE_LOGIN_NAME_OID_HBA_POOLER_AND_SERVICE_MAPPING",
  },
  {
    expectedName: "identity_mail_enrollment_coordinator",
    key: "current186Coordinator",
    requiredEvidence: "LIVE_LOGIN_NAME_OID_AND_CURRENT186_ACL_EPOCH",
  },
  {
    expectedName: "identity_mail_schema_owner",
    key: "current186SchemaOwner",
    requiredEvidence: "LIVE_NOLOGIN_NAME_OID_AND_CURRENT186_ACL_EPOCH",
  },
  {
    expectedName: "identity_mail_worker_v2",
    key: "current186Worker",
    requiredEvidence: "LIVE_LOGIN_NAME_OID_AND_CURRENT186_ACL_EPOCH",
  },
  {
    expectedName: null,
    key: "databaseOwner",
    requiredEvidence: "LIVE_DATABASE_OWNER_NAME_OID",
  },
  {
    expectedName: null,
    key: "ddlFenceAttestor",
    requiredEvidence: "INDEPENDENT_SIGNING_AUTHORITY_AND_ARTIFACT_DIGEST",
  },
  {
    expectedName: null,
    key: "ddlFenceConsumer",
    requiredEvidence: "LIVE_LOGIN_NAME_OID_AND_EXECUTE_ONLY_ACL",
  },
  {
    expectedName: null,
    key: "ddlFenceRevoker",
    requiredEvidence: "DISTINCT_LIVE_LOGIN_NAME_OID_AND_EXECUTE_ONLY_ACL",
  },
  {
    expectedName: null,
    key: "migrationExecutor",
    requiredEvidence: "LIVE_LOGIN_NAME_OID_HBA_AND_TLS_BINDING",
  },
  {
    expectedName: null,
    key: "objectCreator",
    requiredEvidence: "LIVE_NAME_OID_AND_DEFAULT_ACL_INVENTORY",
  },
]);

export class Current180Current190MaterializationPlanError extends Error {
  constructor(code, findings) {
    super("CURRENT180-CURRENT190 materialization planning failed closed.");
    this.name = "Current180Current190MaterializationPlanError";
    this.code = code;
    this.findings = Object.freeze([...new Set(findings)].sort());
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
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(value, expected) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.every((key) => typeof key === "string") &&
    ownKeys.every((key) => Object.hasOwn(descriptors[key], "value")) &&
    JSON.stringify(ownKeys.sort(compareText)) ===
      JSON.stringify([...expected].sort(compareText))
  );
}

function isDataOnlyJsonValue(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.some((key) => typeof key !== "string") ||
      ownKeys.some(
        (key) => key !== "length" && !Object.hasOwn(descriptors[key], "value"),
      ) ||
      Object.keys(value).length !== value.length
    ) {
      return false;
    }
    return value.every((entry) => isDataOnlyJsonValue(entry, seen));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.some((key) => typeof key !== "string") ||
    ownKeys.some(
      (key) =>
        !descriptors[key].enumerable ||
        !Object.hasOwn(descriptors[key], "value"),
    )
  ) {
    return false;
  }
  return ownKeys.every((key) =>
    isDataOnlyJsonValue(descriptors[key].value, seen),
  );
}

function assertPlannerOptions(options, allowedKeys) {
  const optionsShapeValid = exactKeys(
    options,
    options !== null &&
      typeof options === "object" &&
      !Array.isArray(options) &&
      !isProxy(options)
      ? Reflect.ownKeys(options).filter((key) => typeof key === "string")
      : [],
  );
  const actualKeys = optionsShapeValid ? Object.keys(options) : [];
  if (
    !optionsShapeValid ||
    actualKeys.some((key) => !allowedKeys.includes(key))
  ) {
    throw new Current180Current190MaterializationPlanError(
      "MATERIALIZATION_ARGUMENTS_INVALID",
      ["OPTIONS_SHAPE_INVALID"],
    );
  }
}

function containsExactContract(value, contract) {
  const escaped = contract.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "u").test(
    value,
  );
}

function blockedReport(
  findings,
  detectorDigest = null,
  dependencyBoundary = BUILTIN_DEPENDENCY_BOUNDARY,
) {
  return deepFreeze({
    authorization: denyAuthorization(),
    contract: CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
    dependencyBoundary,
    detectorDigest,
    effects: denyEffects(),
    findings: [...new Set(findings)].sort(compareText),
    status: "SOURCE_DRIFT_BLOCKED",
  });
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

function sourceSchemaDisposition(ordinal) {
  if (ordinal <= 186) {
    return {
      disposition: "COORDINATED_REFREEZE_REQUIRED",
      reasons: [
        "EXACT_PREDECESSOR_REPIN_REQUIRED",
        ordinal <= 185
          ? "REHEARSAL_DATABASE_GUARD_MUST_NOT_REACH_PRODUCTION"
          : "REHEARSAL_CONFIRMATION_MUST_NOT_AUTHORIZE_PRODUCTION",
      ].sort(compareText),
    };
  }
  return {
    disposition: "REVIEWED_REFREEZE_REQUIRED",
    reasons: [
      "DORMANT_NONCANONICAL_SOURCE",
      "EMBEDDED_PREDECESSOR_ENFORCEMENT_ABSENT",
      "RUNTIME_ROLE_GRANTS_ABSENT",
    ],
  };
}

function schemaLane(artifactsByOrdinal) {
  return LOGICAL_ORDINALS.map((ordinal) => {
    if (ordinal === 187) {
      return {
        contract: CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
        disposition: "NEW_ADMISSION_ANCHOR_REQUIRED",
        ordinal,
        predecessor: RESERVED_ANCHOR_PREDECESSOR,
        sourceDirectory: null,
        sourceSqlSha256: null,
        targetDirectory: CURRENT180_CURRENT190_RESERVED_ANCHOR,
      };
    }
    const artifact = artifactsByOrdinal.get(ordinal);
    const disposition = sourceSchemaDisposition(ordinal);
    return {
      contract: artifact.contract,
      ...disposition,
      ordinal,
      sourceDirectory: artifact.directory,
      sourceSqlSha256: artifact.sqlSha256,
      targetDirectory: artifact.targetDirectory,
    };
  });
}

function predecessorResolutionGraph(artifactsByOrdinal) {
  return deepFreeze([
    {
      ordinal: 187,
      plannedResolution: [
        "CURRENT187_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTATION_V1",
        "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1",
        CURRENT187_SOURCE_VERIFIER_CONTRACT,
        CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
      ],
      requiredContract:
        artifactsByOrdinal.get(187).predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
    {
      ordinal: 188,
      plannedResolution: [CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT],
      requiredContract:
        artifactsByOrdinal.get(188).predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
    {
      ordinal: 189,
      plannedResolution: [artifactsByOrdinal.get(188).contract],
      requiredContract:
        artifactsByOrdinal.get(189).predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
    {
      ordinal: 190,
      plannedResolution: [artifactsByOrdinal.get(189).contract],
      requiredContract:
        artifactsByOrdinal.get(190).predecessor.requiredContract,
      resolved: false,
      resolutionMayNotComeFromCandidateMetadata: true,
    },
  ]);
}

function inspectAnchorProposal(proposal) {
  if (proposal === undefined) {
    return deepFreeze({ findings: [], present: false, valid: false });
  }
  const findings = [];
  if (
    !isDataOnlyJsonValue(proposal) ||
    !exactKeys(proposal, [
      "contract",
      "directory",
      "ordinal",
      "predecessor",
      "sourceVerifierContract",
      "sql",
      "sqlSha256",
    ])
  ) {
    return deepFreeze({
      findings: ["ANCHOR_PROPOSAL_SHAPE_INVALID"],
      present: true,
      valid: false,
    });
  }
  const normalizedSql = normalizeText(proposal.sql);
  const actualSqlSha256 = sha256(normalizedSql);
  if (proposal.directory !== CURRENT180_CURRENT190_RESERVED_ANCHOR) {
    findings.push("ANCHOR_DIRECTORY_INVALID");
  }
  if (proposal.ordinal !== 187) findings.push("ANCHOR_ORDINAL_INVALID");
  if (proposal.contract !== CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT) {
    findings.push("ANCHOR_CONTRACT_INVALID");
  }
  if (proposal.sourceVerifierContract !== CURRENT187_SOURCE_VERIFIER_CONTRACT) {
    findings.push("ANCHOR_SOURCE_VERIFIER_CONTRACT_INVALID");
  }
  if (
    canonicalJson(proposal.predecessor) !==
    canonicalJson(RESERVED_ANCHOR_PREDECESSOR)
  ) {
    findings.push("ANCHOR_PREDECESSOR_INVALID");
  }
  if (
    typeof proposal.sql !== "string" ||
    proposal.sql.length === 0 ||
    !SHA256_PATTERN.test(String(proposal.sqlSha256 ?? "")) ||
    proposal.sqlSha256 !== actualSqlSha256
  ) {
    findings.push("ANCHOR_SQL_DIGEST_INVALID");
  }
  if (actualSqlSha256 !== CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256) {
    findings.push("ANCHOR_SQL_NOT_REVIEWED");
  }
  if (
    !containsExactContract(
      normalizedSql,
      CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
    )
  ) {
    findings.push("ANCHOR_SQL_ADMISSION_CONTRACT_MISSING");
  }
  if (
    !containsExactContract(normalizedSql, CURRENT187_SOURCE_VERIFIER_CONTRACT)
  ) {
    findings.push("ANCHOR_SQL_SOURCE_VERIFIER_CONTRACT_MISSING");
  }
  if (proposal.sqlSha256 === CURRENT187_E_SQL_SHA256) {
    findings.push("CURRENT187_E_SQL_REUSE_FORBIDDEN");
  }
  for (const [finding, pattern] of [
    ["ANCHOR_SYNTHETIC_DATABASE_GUARD_FORBIDDEN", /lp_c187e_/iu],
    ["ANCHOR_SYNTHETIC_CONFIRMATION_FORBIDDEN", /current187e_confirmation/iu],
    ["ANCHOR_ROLE_DDL_FORBIDDEN", /\bCREATE\s+ROLE\b/iu],
    ["ANCHOR_PUBLIC_GRANT_FORBIDDEN", /\bGRANT\b[^;]*\bTO\s+PUBLIC\b/iu],
    [
      "ANCHOR_PRISMA_HISTORY_WRITE_FORBIDDEN",
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE|DROP\s+TABLE|COPY)\s+(?:public\.)?"?_prisma_migrations"?/iu,
    ],
    [
      "ANCHOR_MIGRATE_RESOLVE_SPOOF_FORBIDDEN",
      /\b(?:prisma\s+)?migrate\s+resolve\b/iu,
    ],
    ["ANCHOR_DYNAMIC_SQL_FORBIDDEN", /\bEXECUTE\b/iu],
    [
      "ANCHOR_NETWORK_OR_PROVIDER_IO_FORBIDDEN",
      /\b(?:https?|smtp|telegram):/iu,
    ],
  ]) {
    if (pattern.test(normalizedSql)) findings.push(finding);
  }
  return deepFreeze({
    findings: [...new Set(findings)].sort(compareText),
    normalizedSqlByteLength: Buffer.byteLength(normalizedSql, "utf8"),
    normalizedSqlSha256: actualSqlSha256,
    present: true,
    reviewedSqlSha256: CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
    valid: findings.length === 0,
  });
}

async function reservedAnchorPresent(repositoryRoot, listDirectoryEntries) {
  const databaseDirectory = join(repositoryRoot, "packages", "database");
  const directories = [
    join(databaseDirectory, "migration-candidates"),
    join(databaseDirectory, "prisma", "migrations"),
  ];
  const entries = await Promise.all(
    directories.map((directory) => listDirectoryEntries(directory)),
  );
  return entries.some((directoryEntries) =>
    directoryEntries.some(
      (entry) => entry.name === CURRENT180_CURRENT190_RESERVED_ANCHOR,
    ),
  );
}

function assertDetectorReport(report) {
  return (
    report?.contract === CURRENT180_CURRENT190_REHEARSAL_CONTRACT &&
    report?.status === "BLOCKED" &&
    report?.artifactIntegrityVerified === true &&
    report?.artifactSetDigest === SOURCE_ARTIFACT_SET_DIGEST &&
    report?.blockerDigest === SOURCE_BLOCKER_DIGEST &&
    report?.current187ToolingDigest === SOURCE_CURRENT187_TOOLING_DIGEST &&
    report?.previousFoundationToolingDigest ===
      SOURCE_PREVIOUS_FOUNDATION_TOOLING_DIGEST &&
    canonicalJson(report.logicalOrder) === canonicalJson(LOGICAL_ORDINALS) &&
    canonicalJson(report.prismaDirectoryOrder) ===
      canonicalJson(EXPECTED_SOURCE_PRISMA_ORDER) &&
    canonicalJson(report.blockers.map(({ code }) => code)) ===
      canonicalJson(EXPECTED_BLOCKER_CODES)
  );
}

async function inspectCurrent180Current190ReleaseMaterializationInternal({
  anchorProposal,
  dependencyBoundary,
  listDirectoryEntries,
  readText,
  repositoryRoot,
}) {
  const block = (findings, detectorDigest = null) =>
    blockedReport(findings, detectorDigest, dependencyBoundary);
  const detectorPath = join(
    repositoryRoot,
    "packages",
    "database",
    "scripts",
    DETECTOR_FILE,
  );
  let detectorDigest;
  try {
    detectorDigest = sha256(normalizeText(await readText(detectorPath)));
  } catch {
    return block(["DETECTOR_READ_FAILED"]);
  }
  if (detectorDigest !== DETECTOR_NORMALIZED_SHA256) {
    return block(["DETECTOR_SOURCE_DRIFT"], detectorDigest);
  }

  let detectorReport;
  try {
    detectorReport = await inspectCurrent180Current190ReleaseRehearsal({
      databaseUrl: SAFE_INSPECTION_DATABASE_URL,
      nodeEnv: "test",
      readText,
      repositoryRoot,
    });
  } catch (error) {
    const findings =
      error instanceof Current180Current190ReleaseRehearsalBlockedError
        ? error.findings.map((finding) => `SOURCE_${finding}`)
        : ["SOURCE_INSPECTION_FAILED"];
    return block(findings, detectorDigest);
  }
  if (!assertDetectorReport(detectorReport)) {
    return block(["DETECTOR_REPORT_DRIFT"], detectorDigest);
  }

  const artifactsByOrdinal = new Map(
    detectorReport.artifacts.map((artifact) => [artifact.ordinal, artifact]),
  );
  if (
    artifactsByOrdinal.size !== LOGICAL_ORDINALS.length ||
    LOGICAL_ORDINALS.some((ordinal) => !artifactsByOrdinal.has(ordinal)) ||
    [...SOURCE_SCHEMA_ORDINALS].some(
      (ordinal) => ordinal === 187 || !artifactsByOrdinal.has(ordinal),
    )
  ) {
    return block(["SOURCE_ORDINAL_SET_DRIFT"], detectorDigest);
  }

  let current187Sql;
  try {
    current187Sql = normalizeText(
      await readText(
        join(
          repositoryRoot,
          "packages",
          "database",
          "migration-candidates",
          CURRENT187_E_DIRECTORY,
          "migration.sql",
        ),
      ),
    );
  } catch {
    return block(["CURRENT187_E_SOURCE_READ_FAILED"], detectorDigest);
  }
  if (
    sha256(current187Sql) !== CURRENT187_E_SQL_SHA256 ||
    !current187Sql.includes("not a Prisma migration") ||
    !current187Sql.includes("^lp_c187e_[0-9a-f]{12}_ci$") ||
    current187Sql.includes('"_prisma_migrations"')
  ) {
    return block(["CURRENT187_E_AUXILIARY_BOUNDARY_DRIFT"], detectorDigest);
  }

  let anchorAlreadyPresent;
  try {
    anchorAlreadyPresent = await reservedAnchorPresent(
      repositoryRoot,
      listDirectoryEntries,
    );
  } catch {
    return block(["CANDIDATE_DIRECTORY_READ_FAILED"], detectorDigest);
  }
  if (anchorAlreadyPresent) {
    return block(["UNREVIEWED_RESERVED_ANCHOR_PRESENT"], detectorDigest);
  }

  const anchorProposalAssessment = inspectAnchorProposal(anchorProposal);
  const plannedSchemaLane = schemaLane(artifactsByOrdinal);
  if (
    canonicalJson(plannedSchemaLane.map(({ ordinal }) => ordinal)) !==
      canonicalJson(LOGICAL_ORDINALS) ||
    canonicalJson(
      [...plannedSchemaLane]
        .sort((left, right) =>
          compareText(left.targetDirectory, right.targetDirectory),
        )
        .map(({ ordinal }) => ordinal),
    ) !== canonicalJson(LOGICAL_ORDINALS)
  ) {
    return block(["PLANNED_PRISMA_ORDER_INVALID"], detectorDigest);
  }

  const publicPlan = {
    anchor: {
      assessment: anchorProposalAssessment,
      contract: CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
      currentArtifactPresent: false,
      directory: CURRENT180_CURRENT190_RESERVED_ANCHOR,
      ordinal: 187,
      predecessor: RESERVED_ANCHOR_PREDECESSOR,
      sourceVerifierContract: CURRENT187_SOURCE_VERIFIER_CONTRACT,
    },
    authorization: denyAuthorization(),
    canonical: detectorReport.canonical,
    contract: CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
    dependencyBoundary,
    effects: denyEffects(),
    evidenceLane: [
      {
        contract: artifactsByOrdinal.get(187).contract,
        databaseBoundary: "SEPARATE_LP_C187E_LOOPBACK_CI_ONLY",
        disposition: "AUXILIARY_SYNTHETIC_EVIDENCE_ONLY",
        mustNeverEnterPrismaSchemaLane: true,
        ordinal: 187,
        sourceDirectory: CURRENT187_E_DIRECTORY,
        sourceSqlSha256: CURRENT187_E_SQL_SHA256,
      },
    ],
    findings: [
      "COORDINATED_REFREEZE_REQUIRED",
      "CURRENT187_ADMISSION_ANCHOR_REQUIRED",
      "EXACT_LIVE_ROLE_BINDINGS_REQUIRED",
      "EXTERNAL_PREDECESSOR_EVIDENCE_REQUIRED",
      "SEPARATE_REVIEWED_ASSEMBLER_REQUIRED",
    ],
    historicalFoundationValidation: {
      defaultGlobalInventoryMayNotAuthorizeMaterialization: true,
      digest: SOURCE_PREVIOUS_FOUNDATION_TOOLING_DIGEST,
      disposition: "PINNED_HISTORICAL_SOURCE_EVIDENCE_ONLY",
      toolsMustRemainUnchanged: true,
    },
    predecessorResolutionGraph: predecessorResolutionGraph(artifactsByOrdinal),
    roleBindingRequirements: ROLE_BINDING_REQUIREMENTS.map((requirement) => ({
      ...requirement,
      credentialsAccepted: false,
      exactNameOidRequired: true,
      status: "MISSING_LIVE_ATTESTATION",
    })),
    schemaLane: plannedSchemaLane,
    source: {
      artifactSetDigest: SOURCE_ARTIFACT_SET_DIGEST,
      blockerDigest: SOURCE_BLOCKER_DIGEST,
      current187ToolingDigest: SOURCE_CURRENT187_TOOLING_DIGEST,
      detectorDigest,
      detectorReportContract: CURRENT180_CURRENT190_REHEARSAL_CONTRACT,
      frozenCandidateBytesMayChange: false,
      previousFoundationToolingDigest:
        SOURCE_PREVIOUS_FOUNDATION_TOOLING_DIGEST,
    },
    status: "PLAN_COMPLETE_REFREEZE_REQUIRED",
  };
  const materializationPlanDigest = sha256(canonicalJson(publicPlan));
  return deepFreeze({ ...publicPlan, materializationPlanDigest });
}

export async function inspectCurrent180Current190ReleaseMaterialization(
  options = {},
) {
  assertPlannerOptions(options, ["anchorProposal"]);
  return inspectCurrent180Current190ReleaseMaterializationInternal({
    anchorProposal: options.anchorProposal,
    dependencyBoundary: BUILTIN_DEPENDENCY_BOUNDARY,
    listDirectoryEntries: (directory) =>
      readdir(directory, { withFileTypes: true }),
    readText: (path) => readFile(path, "utf8"),
    repositoryRoot: DEFAULT_REPOSITORY_ROOT,
  });
}

export async function inspectCurrent180Current190ReleaseMaterializationForTestOnly(
  options = {},
) {
  assertPlannerOptions(options, [
    "anchorProposal",
    "listDirectoryEntries",
    "readText",
    "repositoryRoot",
  ]);
  if (typeof options.readText !== "function") {
    throw new Current180Current190MaterializationPlanError(
      "MATERIALIZATION_ARGUMENTS_INVALID",
      ["READ_TEXT_INVALID"],
    );
  }
  if (
    Object.hasOwn(options, "listDirectoryEntries") &&
    typeof options.listDirectoryEntries !== "function"
  ) {
    throw new Current180Current190MaterializationPlanError(
      "MATERIALIZATION_ARGUMENTS_INVALID",
      ["LIST_DIRECTORY_ENTRIES_INVALID"],
    );
  }
  if (
    typeof options.repositoryRoot !== "string" ||
    options.repositoryRoot.length === 0
  ) {
    throw new Current180Current190MaterializationPlanError(
      "MATERIALIZATION_ARGUMENTS_INVALID",
      ["REPOSITORY_ROOT_INVALID"],
    );
  }
  return inspectCurrent180Current190ReleaseMaterializationInternal({
    anchorProposal: options.anchorProposal,
    dependencyBoundary: deepFreeze({
      callerSuppliedCapabilityInvoked: true,
      externalEffectsUnverified: true,
      mode: "CALLER_SUPPLIED_TEST_ONLY_READ_CAPABILITY",
    }),
    listDirectoryEntries:
      options.listDirectoryEntries ??
      ((directory) => readdir(directory, { withFileTypes: true })),
    readText: options.readText,
    repositoryRoot: resolve(options.repositoryRoot),
  });
}

export function assertCurrent180Current190MaterializationAssemblyAllowed(plan) {
  const findings = Array.isArray(plan?.findings)
    ? plan.findings
    : ["MATERIALIZATION_PLAN_INVALID"];
  throw new Current180Current190MaterializationPlanError(
    "CURRENT180_CURRENT190_MATERIALIZATION_ASSEMBLY_DENIED",
    [...findings, "SEPARATE_REVIEWED_ASSEMBLER_REQUIRED"],
  );
}

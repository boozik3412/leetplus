import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
  CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
  CURRENT180_CURRENT190_RESERVED_ANCHOR,
  CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
  CURRENT187_SOURCE_VERIFIER_CONTRACT,
  Current180Current190MaterializationPlanError,
  assertCurrent180Current190MaterializationAssemblyAllowed,
  inspectCurrent180Current190ReleaseMaterialization,
  inspectCurrent180Current190ReleaseMaterializationForTestOnly,
} from "./current180-current190-release-materialization-planner.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const CURRENT187_E_SQL_PATH = join(
  REPOSITORY_ROOT,
  "packages",
  "database",
  "migration-candidates",
  "20260805050000_identity_mail_ddl_fence_ledger_current187",
  "migration.sql",
);
const REVIEWED_ANCHOR_SQL_PATH = join(
  REPOSITORY_ROOT,
  "packages",
  "database",
  "release-proposals",
  "current180-current190",
  CURRENT180_CURRENT190_RESERVED_ANCHOR,
  "migration.sql",
);
const RESERVED_PREDECESSOR = Object.freeze({
  count: 187,
  head: "20260804190000_identity_mail_duty_role_runtime_boundary_v2",
  headChecksum:
    "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd",
  manifestDigest:
    "d5143b06ab4e21ec99d5a6c600aa257effffd7ba4cdbbb156650ebdd378ffd16",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value) {
  return String(value).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

const REVIEWED_ANCHOR_SQL = normalizeText(
  await readFile(REVIEWED_ANCHOR_SQL_PATH, "utf8"),
);

function proposal(overrides = {}) {
  const sql = overrides.sql ?? REVIEWED_ANCHOR_SQL;
  return {
    contract: CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
    directory: CURRENT180_CURRENT190_RESERVED_ANCHOR,
    ordinal: 187,
    predecessor: { ...RESERVED_PREDECESSOR },
    sourceVerifierContract: CURRENT187_SOURCE_VERIFIER_CONTRACT,
    sql,
    sqlSha256: sha256(normalizeText(sql)),
    ...overrides,
  };
}

test("builds the exact deny-only two-lane refreeze plan from frozen sources", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization();
  assert.equal(
    value.contract,
    CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
  );
  assert.equal(value.status, "PLAN_COMPLETE_REFREEZE_REQUIRED");
  assert.equal(
    value.materializationPlanDigest,
    "8d3605a49988acbb4b8e012505648c6e7af5ca9b1d64fc4ce37f44afa208bf1f",
  );
  assert.deepEqual(
    value.schemaLane.map(({ ordinal }) => ordinal),
    [180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190],
  );
  assert.deepEqual(
    [...value.schemaLane]
      .sort((left, right) =>
        left.targetDirectory < right.targetDirectory
          ? -1
          : left.targetDirectory > right.targetDirectory
            ? 1
            : 0,
      )
      .map(({ ordinal }) => ordinal),
    [180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190],
  );
  assert.equal(value.evidenceLane.length, 1);
  assert.deepEqual(value.evidenceLane[0], {
    contract: "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1",
    databaseBoundary: "SEPARATE_LP_C187E_LOOPBACK_CI_ONLY",
    disposition: "AUXILIARY_SYNTHETIC_EVIDENCE_ONLY",
    mustNeverEnterPrismaSchemaLane: true,
    ordinal: 187,
    sourceDirectory: "20260805050000_identity_mail_ddl_fence_ledger_current187",
    sourceSqlSha256:
      "dd5f4db5aecef2c537251bc5262063c1012a1383aec0d0137e7d8b9536f8bb63",
  });
  assert.equal(
    value.schemaLane.some(
      ({ sourceDirectory }) =>
        sourceDirectory ===
        "20260805050000_identity_mail_ddl_fence_ledger_current187",
    ),
    false,
  );
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(value.schemaLane));
  assert(Object.isFrozen(value.roleBindingRequirements));
});

test("reserves an absent CURRENT187 admission anchor without treating absence as an error", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization();
  assert.deepEqual(value.anchor, {
    assessment: { findings: [], present: false, valid: false },
    contract: CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
    currentArtifactPresent: false,
    directory: CURRENT180_CURRENT190_RESERVED_ANCHOR,
    ordinal: 187,
    predecessor: RESERVED_PREDECESSOR,
    sourceVerifierContract: CURRENT187_SOURCE_VERIFIER_CONTRACT,
  });
  const anchorLane = value.schemaLane.find(({ ordinal }) => ordinal === 187);
  assert.deepEqual(anchorLane, {
    contract: CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
    disposition: "NEW_ADMISSION_ANCHOR_REQUIRED",
    ordinal: 187,
    predecessor: RESERVED_PREDECESSOR,
    sourceDirectory: null,
    sourceSqlSha256: null,
    targetDirectory: CURRENT180_CURRENT190_RESERVED_ANCHOR,
  });
});

test("keeps every authority and observable effect denied", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization();
  assert.deepEqual(value.authorization, {
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
  });
  assert.deepEqual(value.effects, {
    anchorArtifactCreated: false,
    databaseConnectionOpened: false,
    externalProviderCallAttempted: false,
    filesystemWriteAttempted: false,
    migrationArtifactCreated: false,
    migrationCommandExecuted: false,
    productionStateRead: false,
    roleOrGrantMutationAttempted: false,
    routeActivationAttempted: false,
  });
  assert.throws(
    () => assertCurrent180Current190MaterializationAssemblyAllowed(value),
    (error) => {
      assert(error instanceof Current180Current190MaterializationPlanError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_MATERIALIZATION_ASSEMBLY_DENIED",
      );
      assert(error.findings.includes("SEPARATE_REVIEWED_ASSEMBLER_REQUIRED"));
      return true;
    },
  );
});

test("marks CURRENT180-CURRENT186 for coordinated refreeze and CURRENT188-CURRENT190 for reviewed refreeze", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization();
  for (const ordinal of [180, 181, 182, 183, 184, 185, 186]) {
    const entry = value.schemaLane.find(
      (candidate) => candidate.ordinal === ordinal,
    );
    assert.equal(entry.disposition, "COORDINATED_REFREEZE_REQUIRED");
    assert(entry.reasons.includes("EXACT_PREDECESSOR_REPIN_REQUIRED"));
  }
  for (const ordinal of [188, 189, 190]) {
    const entry = value.schemaLane.find(
      (candidate) => candidate.ordinal === ordinal,
    );
    assert.equal(entry.disposition, "REVIEWED_REFREEZE_REQUIRED");
    assert.deepEqual(entry.reasons, [
      "DORMANT_NONCANONICAL_SOURCE",
      "EMBEDDED_PREDECESSOR_ENFORCEMENT_ABSENT",
      "RUNTIME_ROLE_GRANTS_ABSENT",
    ]);
  }
  assert.equal(value.source.frozenCandidateBytesMayChange, false);
  assert.equal(
    value.historicalFoundationValidation
      .defaultGlobalInventoryMayNotAuthorizeMaterialization,
    true,
  );
  assert.equal(
    value.historicalFoundationValidation.toolsMustRemainUnchanged,
    true,
  );
});

test("keeps every external predecessor unresolved until separately verified evidence exists", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization();
  assert.deepEqual(
    value.predecessorResolutionGraph.map(
      ({ ordinal, requiredContract, resolved }) => ({
        ordinal,
        requiredContract,
        resolved,
      }),
    ),
    [
      {
        ordinal: 187,
        requiredContract:
          "CURRENT187_INDEPENDENT_TECHNICAL_DDL_FENCE_ATTESTATION_V1",
        resolved: false,
      },
      {
        ordinal: 188,
        requiredContract:
          "IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1",
        resolved: false,
      },
      {
        ordinal: 189,
        requiredContract: "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
        resolved: false,
      },
      {
        ordinal: 190,
        requiredContract: "IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1",
        resolved: false,
      },
    ],
  );
  assert(
    value.predecessorResolutionGraph.every(
      ({ resolutionMayNotComeFromCandidateMetadata }) =>
        resolutionMayNotComeFromCandidateMetadata === true,
    ),
  );
});

test("requires exact live role/OID evidence and accepts no credential material", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization();
  assert.deepEqual(
    value.roleBindingRequirements.map(({ key }) => key),
    [
      "admissionScanner",
      "applicationRuntime",
      "current186Coordinator",
      "current186SchemaOwner",
      "current186Worker",
      "databaseOwner",
      "ddlFenceAttestor",
      "ddlFenceConsumer",
      "ddlFenceRevoker",
      "migrationExecutor",
      "objectCreator",
    ],
  );
  for (const requirement of value.roleBindingRequirements) {
    assert.equal(requirement.credentialsAccepted, false);
    assert.equal(requirement.exactNameOidRequired, true);
    assert.equal(requirement.status, "MISSING_LIVE_ATTESTATION");
    assert.equal(Object.hasOwn(requirement, "password"), false);
    assert.equal(Object.hasOwn(requirement, "databaseUrl"), false);
  }
});

test("the exact reviewed anchor proposal is digest-bound but cannot authorize assembly", async () => {
  const value = await inspectCurrent180Current190ReleaseMaterialization({
    anchorProposal: proposal(),
  });
  assert.equal(value.status, "PLAN_COMPLETE_REFREEZE_REQUIRED");
  assert.deepEqual(value.anchor.assessment, {
    findings: [],
    normalizedSqlByteLength: Buffer.byteLength(REVIEWED_ANCHOR_SQL, "utf8"),
    normalizedSqlSha256: CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
    present: true,
    reviewedSqlSha256: CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
    valid: true,
  });
  assert.equal(value.anchor.currentArtifactPresent, false);
  assert.equal(value.authorization.canAssemble, false);
  assert.equal(value.authorization.canDeploy, false);
});

test("binds the reviewed anchor SHA into the plan digest and rejects substitution", async () => {
  const reviewed = await inspectCurrent180Current190ReleaseMaterialization({
    anchorProposal: proposal(),
  });
  const substitutedSql = REVIEWED_ANCHOR_SQL.replace(
    "Proposal-only admission anchor",
    "Substituted admission anchor",
  );
  const substituted = await inspectCurrent180Current190ReleaseMaterialization({
    anchorProposal: proposal({
      sql: substitutedSql,
      sqlSha256: sha256(substitutedSql),
    }),
  });
  assert.equal(reviewed.anchor.assessment.valid, true);
  assert.equal(substituted.anchor.assessment.valid, false);
  assert(
    substituted.anchor.assessment.findings.includes("ANCHOR_SQL_NOT_REVIEWED"),
  );
  assert.notEqual(
    reviewed.materializationPlanDigest,
    substituted.materializationPlanDigest,
  );
});

test("rejects malformed, reordered, reparented or relabeled anchor proposals", async () => {
  const cases = [
    [
      "ANCHOR_PROPOSAL_SHAPE_INVALID",
      { ...proposal(), productionApplyAuthorized: true },
    ],
    ["ANCHOR_DIRECTORY_INVALID", proposal({ directory: "20260805060000_bad" })],
    ["ANCHOR_ORDINAL_INVALID", proposal({ ordinal: 188 })],
    ["ANCHOR_CONTRACT_INVALID", proposal({ contract: "CURRENT187_ALIAS" })],
    [
      "ANCHOR_SOURCE_VERIFIER_CONTRACT_INVALID",
      proposal({ sourceVerifierContract: "CURRENT187_UNVERIFIED" }),
    ],
    [
      "ANCHOR_PREDECESSOR_INVALID",
      proposal({ predecessor: { ...RESERVED_PREDECESSOR, count: 185 } }),
    ],
    ["ANCHOR_SQL_DIGEST_INVALID", proposal({ sqlSha256: "a".repeat(64) })],
  ];
  for (const [expected, anchorProposal] of cases) {
    const value = await inspectCurrent180Current190ReleaseMaterialization({
      anchorProposal,
    });
    assert.equal(value.status, "PLAN_COMPLETE_REFREEZE_REQUIRED");
    assert.equal(value.anchor.assessment.valid, false);
    assert(
      value.anchor.assessment.findings.includes(expected),
      `${expected}: ${JSON.stringify(value.anchor.assessment)}`,
    );
    assert.equal(value.authorization.canAssemble, false);
  }
});

test("requires both exact contracts in anchor SQL instead of trusting proposal metadata", async () => {
  const missingAdmissionSql = [
    "BEGIN;",
    `-- Materializes ${CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT}_ALIAS.`,
    `-- Verifies source ${CURRENT187_SOURCE_VERIFIER_CONTRACT}.`,
    "COMMIT;",
    "",
  ].join("\n");
  const missingAdmission =
    await inspectCurrent180Current190ReleaseMaterialization({
      anchorProposal: proposal({
        sql: missingAdmissionSql,
        sqlSha256: sha256(missingAdmissionSql),
      }),
    });
  assert.deepEqual(missingAdmission.anchor.assessment.findings, [
    "ANCHOR_SQL_ADMISSION_CONTRACT_MISSING",
    "ANCHOR_SQL_NOT_REVIEWED",
  ]);

  const missingVerifierSql = [
    "BEGIN;",
    `-- Materializes ${CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT}.`,
    `-- Verifies source ${CURRENT187_SOURCE_VERIFIER_CONTRACT}_ALIAS.`,
    "COMMIT;",
    "",
  ].join("\n");
  const missingVerifier =
    await inspectCurrent180Current190ReleaseMaterialization({
      anchorProposal: proposal({
        sql: missingVerifierSql,
        sqlSha256: sha256(missingVerifierSql),
      }),
    });
  assert.deepEqual(missingVerifier.anchor.assessment.findings, [
    "ANCHOR_SQL_NOT_REVIEWED",
    "ANCHOR_SQL_SOURCE_VERIFIER_CONTRACT_MISSING",
  ]);
});

test("forbids migration-history writes and migrate-resolve spoofing in anchor SQL", async () => {
  const cases = [
    [
      "ANCHOR_PRISMA_HISTORY_WRITE_FORBIDDEN",
      'UPDATE public."_prisma_migrations" SET "finished_at" = now();',
    ],
    [
      "ANCHOR_MIGRATE_RESOLVE_SPOOF_FORBIDDEN",
      "-- prisma migrate resolve --applied forged_anchor",
    ],
    [
      "ANCHOR_DYNAMIC_SQL_FORBIDDEN",
      `EXECUTE 'UP' || 'DATE public."_prisma_migrations" SET "finished_at" = now()';`,
    ],
  ];
  for (const [expected, unsafeLine] of cases) {
    const sql = [
      "BEGIN;",
      `-- Materializes ${CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT}.`,
      `-- Verifies source ${CURRENT187_SOURCE_VERIFIER_CONTRACT}.`,
      unsafeLine,
      "COMMIT;",
      "",
    ].join("\n");
    const value = await inspectCurrent180Current190ReleaseMaterialization({
      anchorProposal: proposal({ sql, sqlSha256: sha256(sql) }),
    });
    assert.equal(value.anchor.assessment.valid, false);
    assert(value.anchor.assessment.findings.includes(expected));
  }
});

test("forbids CURRENT187-E reuse and unsafe role, PUBLIC, synthetic or network content in an anchor proposal", async () => {
  const current187Sql = await readFile(CURRENT187_E_SQL_PATH, "utf8");
  const reused = await inspectCurrent180Current190ReleaseMaterialization({
    anchorProposal: proposal({
      sql: current187Sql,
      sqlSha256: sha256(normalizeText(current187Sql)),
    }),
  });
  assert.equal(reused.anchor.assessment.valid, false);
  assert(
    reused.anchor.assessment.findings.includes(
      "CURRENT187_E_SQL_REUSE_FORBIDDEN",
    ),
  );
  assert(
    reused.anchor.assessment.findings.includes(
      "ANCHOR_SYNTHETIC_DATABASE_GUARD_FORBIDDEN",
    ),
  );

  const unsafeSql = [
    "BEGIN;",
    `-- Materializes ${CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT}.`,
    `-- Verifies source ${CURRENT187_SOURCE_VERIFIER_CONTRACT}.`,
    "CREATE ROLE unsafe_role;",
    "GRANT SELECT ON TABLE unsafe_table TO PUBLIC;",
    "SELECT 'lp_c187e_deadbeefdead_ci';",
    "SELECT current_setting('leetplus.current187e_confirmation');",
    "SELECT 'https://provider.invalid';",
    "COMMIT;",
    "",
  ].join("\n");
  const unsafe = await inspectCurrent180Current190ReleaseMaterialization({
    anchorProposal: proposal({
      sql: unsafeSql,
      sqlSha256: sha256(unsafeSql),
    }),
  });
  assert.deepEqual(unsafe.anchor.assessment.findings, [
    "ANCHOR_NETWORK_OR_PROVIDER_IO_FORBIDDEN",
    "ANCHOR_PUBLIC_GRANT_FORBIDDEN",
    "ANCHOR_ROLE_DDL_FORBIDDEN",
    "ANCHOR_SQL_NOT_REVIEWED",
    "ANCHOR_SYNTHETIC_CONFIRMATION_FORBIDDEN",
    "ANCHOR_SYNTHETIC_DATABASE_GUARD_FORBIDDEN",
  ]);
});

test("fails closed on detector, candidate and canonical source drift", async () => {
  const defaultRead = (path) => readFile(path, "utf8");
  const detectorDrift =
    await inspectCurrent180Current190ReleaseMaterializationForTestOnly({
      repositoryRoot: REPOSITORY_ROOT,
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          "current180-current190-release-rehearsal-blocker.mjs",
        )
          ? `${source}\n// drift\n`
          : source;
      },
    });
  assert.equal(detectorDrift.status, "SOURCE_DRIFT_BLOCKED");
  assert.deepEqual(detectorDrift.findings, ["DETECTOR_SOURCE_DRIFT"]);

  const candidateDrift =
    await inspectCurrent180Current190ReleaseMaterializationForTestOnly({
      repositoryRoot: REPOSITORY_ROOT,
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          join(
            "20260805040000_guest_portal_session_current190",
            "migration.sql",
          ),
        )
          ? `${source}\n-- drift\n`
          : source;
      },
    });
  assert.equal(candidateDrift.status, "SOURCE_DRIFT_BLOCKED");
  assert(candidateDrift.findings.includes("SOURCE_CURRENT190_SQL_SHA_DRIFT"));

  const canonicalDrift =
    await inspectCurrent180Current190ReleaseMaterializationForTestOnly({
      repositoryRoot: REPOSITORY_ROOT,
      readText: async (path) => {
        const source = await defaultRead(path);
        return path.endsWith(
          join(
            "20260804120000_guest_game_max_pending_rewards",
            "migration.sql",
          ),
        )
          ? `${source}\n-- drift\n`
          : source;
      },
    });
  assert.equal(canonicalDrift.status, "SOURCE_DRIFT_BLOCKED");
  assert(canonicalDrift.findings.includes("SOURCE_CANONICAL_HEAD_SHA_DRIFT"));
});

test("treats every reserved-anchor name collision as present regardless of entry type", async () => {
  for (const alternateType of ["file", "symlink", "junction", "other"]) {
    const value =
      await inspectCurrent180Current190ReleaseMaterializationForTestOnly({
        listDirectoryEntries: async (directory) => {
          const entries = await readdir(directory, { withFileTypes: true });
          return directory.endsWith(join("prisma", "migrations"))
            ? [
                ...entries,
                {
                  alternateType,
                  name: CURRENT180_CURRENT190_RESERVED_ANCHOR,
                },
              ]
            : entries;
        },
        readText: (path) => readFile(path, "utf8"),
        repositoryRoot: REPOSITORY_ROOT,
      });
    assert.equal(value.status, "SOURCE_DRIFT_BLOCKED");
    assert.deepEqual(value.findings, ["UNREVIEWED_RESERVED_ANCHOR_PRESENT"]);
  }
});

test("rejects invalid options without reflecting caller values", async () => {
  await assert.rejects(
    inspectCurrent180Current190ReleaseMaterialization({
      unexpectedSecret: "do-not-reflect",
    }),
    (error) => {
      assert(error instanceof Current180Current190MaterializationPlanError);
      assert.equal(error.code, "MATERIALIZATION_ARGUMENTS_INVALID");
      assert.deepEqual(error.findings, ["OPTIONS_SHAPE_INVALID"]);
      assert.doesNotMatch(error.message, /do-not-reflect/u);
      return true;
    },
  );

  await assert.rejects(
    inspectCurrent180Current190ReleaseMaterialization({
      readText: async () => "caller-owned-effect",
    }),
    (error) => {
      assert(error instanceof Current180Current190MaterializationPlanError);
      assert.equal(error.code, "MATERIALIZATION_ARGUMENTS_INVALID");
      assert.deepEqual(error.findings, ["OPTIONS_SHAPE_INVALID"]);
      return true;
    },
  );
});

test("does not invoke caller-owned accessors or proxy traps while validating proposals", async () => {
  let optionGetterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "anchorProposal", {
    enumerable: true,
    get() {
      optionGetterCalls += 1;
      return proposal();
    },
  });
  await assert.rejects(
    inspectCurrent180Current190ReleaseMaterialization(accessorOptions),
    (error) => {
      assert(error instanceof Current180Current190MaterializationPlanError);
      assert.equal(error.code, "MATERIALIZATION_ARGUMENTS_INVALID");
      assert.deepEqual(error.findings, ["OPTIONS_SHAPE_INVALID"]);
      return true;
    },
  );
  assert.equal(optionGetterCalls, 0);

  let predecessorGetterCalls = 0;
  const accessorPredecessor = {
    head: RESERVED_PREDECESSOR.head,
    headChecksum: RESERVED_PREDECESSOR.headChecksum,
    manifestDigest: RESERVED_PREDECESSOR.manifestDigest,
  };
  Object.defineProperty(accessorPredecessor, "count", {
    enumerable: true,
    get() {
      predecessorGetterCalls += 1;
      return RESERVED_PREDECESSOR.count;
    },
  });
  const accessorValue = await inspectCurrent180Current190ReleaseMaterialization(
    {
      anchorProposal: proposal({ predecessor: accessorPredecessor }),
    },
  );
  assert.deepEqual(accessorValue.anchor.assessment.findings, [
    "ANCHOR_PROPOSAL_SHAPE_INVALID",
  ]);
  assert.equal(predecessorGetterCalls, 0);

  let proxyTrapCalls = 0;
  const proxiedProposal = new Proxy(proposal(), {
    getOwnPropertyDescriptor(target, property) {
      proxyTrapCalls += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    ownKeys(target) {
      proxyTrapCalls += 1;
      return Reflect.ownKeys(target);
    },
  });
  const proxyValue = await inspectCurrent180Current190ReleaseMaterialization({
    anchorProposal: proxiedProposal,
  });
  assert.deepEqual(proxyValue.anchor.assessment.findings, [
    "ANCHOR_PROPOSAL_SHAPE_INVALID",
  ]);
  assert.equal(proxyTrapCalls, 0);
});

test("marks caller-supplied source readers as test-only with unverified external effects", async () => {
  const value =
    await inspectCurrent180Current190ReleaseMaterializationForTestOnly({
      readText: (path) => readFile(path, "utf8"),
      repositoryRoot: REPOSITORY_ROOT,
    });
  assert.deepEqual(value.dependencyBoundary, {
    callerSuppliedCapabilityInvoked: true,
    externalEffectsUnverified: true,
    mode: "CALLER_SUPPLIED_TEST_ONLY_READ_CAPABILITY",
  });
});

test("implementation imports no writer, database, process, network or provider client", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "current180-current190-release-materialization-planner.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /node:child_process|@prisma|PrismaClient|from\s+["']pg["']|node:http|node:https|nodemailer|fetch\s*\(/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:writeFile|appendFile|mkdir|copyFile|cp|rename|unlink|rm|rmdir)\s*\(/u,
  );
  assert.doesNotMatch(source, /execFile|spawnSync|process\.env/u);
  assert.match(source, /join\(databaseDirectory, "prisma", "migrations"\)/u);
});

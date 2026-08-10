import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
  CURRENT180_CURRENT190_RESERVED_ANCHOR,
  CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
  CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
  CURRENT187_SOURCE_VERIFIER_CONTRACT,
  inspectCurrent180Current190ReleaseMaterialization,
} from "./current180-current190-release-materialization-planner.mjs";
import {
  CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT,
  CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256,
  Current180Current190RefreezeManifestError,
  assertCurrent180Current190RefreezeAssemblyAllowed,
  inspectCurrent180Current190ReleaseRefreezeManifest,
  inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly,
} from "./current180-current190-release-refreeze-manifest.mjs";

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
const ANCHOR_CANDIDATE_PATH = join(ANCHOR_DIRECTORY, "candidate.json");
const ANCHOR_SQL_PATH = join(ANCHOR_DIRECTORY, "migration.sql");
const EXPECTED_LOGICAL_ORDER = Object.freeze([
  180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190,
]);
const EXPECTED_PLAN_DIGEST =
  "55fc45e1d284c82fd738ddde8d3c7f9028fc8c8a955f546f7af2f13d4ee9763c";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

async function listEntries(path) {
  return (await readdir(path, { withFileTypes: true }))
    .map((entry) => ({
      name: entry.name,
      type: entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : "other",
    }))
    .sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
}

test("verifies the exact immutable refreeze proposal while keeping it nondeployable", async () => {
  const value = await inspectCurrent180Current190ReleaseRefreezeManifest();
  assert.equal(
    value.contract,
    CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT,
  );
  assert.equal(value.status, "REFREEZE_VERIFIED_NOT_DEPLOYABLE");
  assert.equal(value.verified, true);
  assert.equal(
    value.manifestSha256,
    CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256,
  );
  assert.equal(
    value.anchorSqlSha256,
    CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
  );
  assert.equal(value.materializationPlanDigest, EXPECTED_PLAN_DIGEST);
  assert.deepEqual(value.logicalOrder, EXPECTED_LOGICAL_ORDER);
  assert.deepEqual(value.findings, [
    "ASSEMBLY_FORBIDDEN",
    "EXTERNAL_PREDECESSOR_EVIDENCE_REQUIRED",
    "PRODUCTION_AUTHORIZATION_ABSENT",
    "SEPARATE_REVIEWED_ASSEMBLER_REQUIRED",
  ]);
  assert(Object.values(value.authorization).every((entry) => entry === false));
  assert(Object.values(value.effects).every((entry) => entry === false));
  assert.equal(value.dependencyBoundary.callerSuppliedCapabilityInvoked, false);
  assert.equal(value.dependencyBoundary.externalEffectsUnverified, false);
  assert.equal(value.manifestAndLaneSourcePathProvenanceVerified, true);
  assert(Object.isFrozen(value));
  assert(Object.isFrozen(value.authorization));
  assert(Object.isFrozen(value.logicalOrder));
});

test("pins the manifest bytes and every file in every source directory", async () => {
  const manifestBytes = await readFile(MANIFEST_PATH);
  assert.equal(
    sha256(manifestBytes),
    CURRENT180_CURRENT190_REFREEZE_MANIFEST_SHA256,
  );
  const manifest = JSON.parse(manifestBytes);
  assert.equal(
    manifest.contract,
    CURRENT180_CURRENT190_REFREEZE_MANIFEST_CONTRACT,
  );
  assert.equal(manifest.status, "NOT_DEPLOYABLE");
  for (const entry of [
    ...manifest.schemaLane,
    ...manifest.auxiliaryEvidenceLane,
  ]) {
    const directory = resolve(REPOSITORY_ROOT, entry.sourceDirectory);
    assert.deepEqual(await listEntries(directory), [
      ...entry.sourceFiles.map(({ name }) => ({ name, type: "file" })),
    ]);
    const actualFiles = [];
    for (const file of entry.sourceFiles) {
      const actualSha256 = sha256(await readFile(join(directory, file.name)));
      assert.equal(actualSha256, file.sha256, `${entry.ordinal}/${file.name}`);
      actualFiles.push({ name: file.name, sha256: actualSha256 });
    }
    assert.equal(
      sha256(canonicalJson(actualFiles)),
      entry.sourceDirectorySha256,
      String(entry.ordinal),
    );
  }
});

test("pins the logical and lexical schema lane and isolates CURRENT187-E", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.deepEqual(
    manifest.schemaLane.map(({ ordinal }) => ordinal),
    EXPECTED_LOGICAL_ORDER,
  );
  assert.deepEqual(
    [...manifest.schemaLane]
      .sort((left, right) =>
        left.targetDirectory.localeCompare(right.targetDirectory, "en"),
      )
      .map(({ ordinal }) => ordinal),
    EXPECTED_LOGICAL_ORDER,
  );
  assert.equal(
    manifest.schemaLane.some(({ contract }) =>
      contract.includes("DDL_FENCE_LEDGER_SYNTHETIC_CI"),
    ),
    false,
  );
  assert.equal(manifest.auxiliaryEvidenceLane.length, 1);
  assert.equal(
    manifest.auxiliaryEvidenceLane[0].contract,
    "CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1",
  );
  assert.equal(
    manifest.auxiliaryEvidenceLane[0].mustNeverEnterSchemaLane,
    true,
  );
});

test("keeps every predecessor externally evidence-gated", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.deepEqual(manifest.predecessorPolicy, {
    allResolved: false,
    candidateMetadataMayResolve: false,
    externalEvidenceRequired: true,
  });
  for (const entry of [
    ...manifest.schemaLane,
    ...manifest.auxiliaryEvidenceLane,
  ]) {
    assert.equal(entry.predecessorEvidence.externalEvidenceRequired, true);
    assert.equal(entry.predecessorEvidence.resolved, false);
    assert.notEqual(entry.predecessor?.resolved, true);
    assert.equal(entry.authorization, false);
    assert.equal(entry.effects, false);
  }
});

test("binds the anchor metadata to both exact contracts and the exact CURRENT186 predecessor", async () => {
  const candidate = JSON.parse(await readFile(ANCHOR_CANDIDATE_PATH, "utf8"));
  assert.equal(candidate.status, "NOT_DEPLOYABLE");
  assert.equal(candidate.authorization, false);
  assert.equal(candidate.effects, false);
  assert.equal(candidate.proposalOnly, true);
  assert.equal(candidate.assemblyAuthorized, false);
  assert.equal(candidate.productionApplyAuthorized, false);
  assert.equal(
    candidate.contract,
    CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
  );
  assert.equal(
    candidate.sourceVerifierContract,
    CURRENT187_SOURCE_VERIFIER_CONTRACT,
  );
  assert.equal(
    candidate.migrationSqlSha256,
    CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
  );
  assert.deepEqual(candidate.predecessor, {
    count: 187,
    head: "20260804190000_identity_mail_duty_role_runtime_boundary_v2",
    headChecksum:
      "7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd",
    manifestDigest:
      "d5143b06ab4e21ec99d5a6c600aa257effffd7ba4cdbbb156650ebdd378ffd16",
  });
});

test("keeps anchor SQL read-only, reviewed and rollback-only", async () => {
  const sql = await readFile(ANCHOR_SQL_PATH, "utf8");
  assert.equal(sha256(sql), CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256);
  assert.match(sql, /SET TRANSACTION READ ONLY;/u);
  assert.match(sql, /FROM public\."_prisma_migrations"/u);
  assert.match(sql, /completed_count IS DISTINCT FROM 186/u);
  assert.match(sql, /ROLLBACK;\s*$/u);
  assert.doesNotMatch(sql, /\bCOMMIT\b/u);
  assert.doesNotMatch(
    sql,
    /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|COPY|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|EXECUTE)\b/iu,
  );
  assert.match(
    sql,
    new RegExp(CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT, "u"),
  );
  assert.match(sql, new RegExp(CURRENT187_SOURCE_VERIFIER_CONTRACT, "u"));
});

test("calls the existing materialization planner with the reviewed proposal", async () => {
  let proposalSeen = null;
  const value =
    await inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
      plannerInspect: async ({ anchorProposal }) => {
        proposalSeen = anchorProposal;
        return inspectCurrent180Current190ReleaseMaterialization({
          anchorProposal,
        });
      },
    });
  assert.equal(value.verified, true);
  assert.equal(value.dependencyBoundary.callerSuppliedCapabilityInvoked, true);
  assert.equal(value.dependencyBoundary.externalEffectsUnverified, true);
  assert.equal(
    proposalSeen.contract,
    CURRENT180_CURRENT190_RESERVED_ANCHOR_CONTRACT,
  );
  assert.equal(
    proposalSeen.sourceVerifierContract,
    CURRENT187_SOURCE_VERIFIER_CONTRACT,
  );
  assert.equal(
    proposalSeen.sqlSha256,
    CURRENT180_CURRENT190_REVIEWED_ANCHOR_SQL_SHA256,
  );
  assert.equal(proposalSeen.directory, CURRENT180_CURRENT190_RESERVED_ANCHOR);
});

test("fails closed on any manifest byte drift before trusting its contents", async () => {
  const value =
    await inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
      readBytes: async (path) => {
        const bytes = await readFile(path);
        return path === MANIFEST_PATH
          ? Buffer.concat([bytes, Buffer.from("\n")])
          : bytes;
      },
    });
  assert.equal(value.status, "REFREEZE_SOURCE_DRIFT_BLOCKED");
  assert.equal(value.verified, false);
  assert.deepEqual(value.findings, ["REFREEZE_MANIFEST_BYTES_DRIFT"]);
  assert(Object.values(value.authorization).every((entry) => entry === false));
});

test("fails closed on source candidate and SQL byte drift", async () => {
  for (const suffix of ["candidate.json", "migration.sql"]) {
    const sourceSuffix = join(
      "20260805040000_guest_portal_session_current190",
      suffix,
    );
    const value =
      await inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
        readBytes: async (path) => {
          const bytes = await readFile(path);
          return path.endsWith(sourceSuffix)
            ? Buffer.concat([bytes, Buffer.from("\n")])
            : bytes;
        },
      });
    assert.equal(value.status, "REFREEZE_SOURCE_DRIFT_BLOCKED");
    assert(
      value.findings.includes(`SOURCE_190_${suffix}_BYTE_DRIFT`),
      JSON.stringify(value),
    );
    assert(value.findings.includes("SOURCE_190_DIRECTORY_DIGEST_DRIFT"));
  }
});

test("fails closed on an unmanifested source-directory entry", async () => {
  const target = resolve(
    REPOSITORY_ROOT,
    "packages/database/migration-candidates/20260805030000_identity_employee_invite_mail_boundary_current189",
  );
  const value =
    await inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
      listEntries: async (path) => {
        const entries = await listEntries(path);
        return path === target
          ? [...entries, { name: "unexpected.bin", type: "file" }]
          : entries;
      },
    });
  assert.equal(value.status, "REFREEZE_SOURCE_DRIFT_BLOCKED");
  assert(value.findings.includes("SOURCE_189_FILE_SET_DRIFT"));
});

test("fails closed when the planner report no longer matches the pinned plan", async () => {
  const value =
    await inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
      plannerInspect: async ({ anchorProposal }) => {
        const plan = await inspectCurrent180Current190ReleaseMaterialization({
          anchorProposal,
        });
        return { ...plan, materializationPlanDigest: "0".repeat(64) };
      },
    });
  assert.equal(value.status, "REFREEZE_SOURCE_DRIFT_BLOCKED");
  assert.deepEqual(value.findings, ["REFREEZE_PLANNER_REPORT_DRIFT"]);
});

test("requires the exact four-entry predecessor resolution graph", async () => {
  const value =
    await inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
      plannerInspect: async ({ anchorProposal }) => {
        const plan = await inspectCurrent180Current190ReleaseMaterialization({
          anchorProposal,
        });
        return { ...plan, predecessorResolutionGraph: [] };
      },
    });
  assert.equal(value.status, "REFREEZE_SOURCE_DRIFT_BLOCKED");
  assert.deepEqual(value.findings, [
    "REFREEZE_PLANNER_PREDECESSOR_GATE_INVALID",
  ]);
  assert.equal(value.manifestAndLaneSourcePathProvenanceVerified, false);
});

test("denies assembly even for a fully verified refreeze report", async () => {
  const value = await inspectCurrent180Current190ReleaseRefreezeManifest();
  assert.throws(
    () => assertCurrent180Current190RefreezeAssemblyAllowed(value),
    (error) => {
      assert(error instanceof Current180Current190RefreezeManifestError);
      assert.equal(
        error.code,
        "CURRENT180_CURRENT190_REFREEZE_ASSEMBLY_DENIED",
      );
      assert(error.findings.includes("SEPARATE_REVIEWED_ASSEMBLER_REQUIRED"));
      return true;
    },
  );
});

test("keeps the reserved anchor outside migration-candidates and canonical migrations", async () => {
  await assert.rejects(
    access(
      join(
        REPOSITORY_ROOT,
        "packages/database/migration-candidates",
        CURRENT180_CURRENT190_RESERVED_ANCHOR,
      ),
    ),
  );
  await assert.rejects(
    access(
      join(
        REPOSITORY_ROOT,
        "packages/database/prisma/migrations",
        CURRENT180_CURRENT190_RESERVED_ANCHOR,
      ),
    ),
  );
});

test("rejects malformed test-only options without reflecting caller data", async () => {
  await assert.rejects(
    inspectCurrent180Current190ReleaseRefreezeManifestForTestOnly({
      unexpectedSecret: "do-not-reflect",
    }),
    (error) => {
      assert(error instanceof Current180Current190RefreezeManifestError);
      assert.equal(error.code, "REFREEZE_TEST_ARGUMENTS_INVALID");
      assert.deepEqual(error.findings, ["TEST_ONLY_OPTIONS_SHAPE_INVALID"]);
      assert.doesNotMatch(error.message, /do-not-reflect/u);
      return true;
    },
  );
});

test("implementation imports no writer, database, process, network or provider client", async () => {
  const source = await readFile(
    join(
      SCRIPT_DIRECTORY,
      "current180-current190-release-refreeze-manifest.mjs",
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
  assert.match(source, /lstat, readFile, readdir, realpath/u);
  assert.match(source, /pathIsWithin/u);
  assert.match(source, /BUILTIN_REPOSITORY_PATH_ANCESTOR_LINK_FORBIDDEN/u);
  assert.match(source, /BUILTIN_REPOSITORY_PATH_PROVENANCE_INVALID/u);
  assert.match(source, /plannerInspect\(\{ anchorProposal \}\)/u);
  assert.match(source, /inspectCurrent180Current190ReleaseMaterialization,/u);
});

test("manifest remains deny-only and bound to the reviewed planner contract", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  assert.equal(
    manifest.materializationPlanner.contract,
    CURRENT180_CURRENT190_MATERIALIZATION_PLAN_CONTRACT,
  );
  assert.equal(
    manifest.materializationPlanner.planDigest,
    EXPECTED_PLAN_DIGEST,
  );
  assert(
    Object.values(manifest.authorization).every((entry) => entry === false),
  );
  assert(Object.values(manifest.effects).every((entry) => entry === false));
});

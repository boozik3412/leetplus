#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";

const EXPECTED_OPERATIONAL_SCRIPTS = [
  "packages/database/scripts/canonical-prisma-deploy.mjs",
  "packages/database/scripts/current-network-access-scope-classification.cli.mjs",
  "packages/database/scripts/current-network-access-scope-classification.mjs",
  "packages/database/scripts/current-release-restored-copy-runtime-acceptance.cli.mjs",
  "packages/database/scripts/current-release-restored-copy-runtime-acceptance.mjs",
  "packages/database/scripts/founder-pilot-activation-role-deployment.cli.mjs",
  "packages/database/scripts/founder-pilot-activation-role-deployment.mjs",
  "packages/database/scripts/founder-pilot-activation-role-network-acceptance.cli.mjs",
  "packages/database/scripts/founder-pilot-activation-role-network-acceptance.mjs",
  "packages/database/scripts/founder-pilot-mail-tenant-enrollment.cli.mjs",
  "packages/database/scripts/founder-pilot-mail-tenant-enrollment.mjs",
  "packages/database/scripts/founder-pilot-current188-legacy-ownership-upgrade.cli.mjs",
  "packages/database/scripts/founder-pilot-current188-legacy-ownership-upgrade.mjs",
  "packages/database/scripts/founder-pilot-current188-production-upgrade.cli.mjs",
  "packages/database/scripts/founder-pilot-current188-production-upgrade.mjs",
  "packages/database/scripts/founder-pilot-production-history-production.cli.mjs",
  "packages/database/scripts/founder-pilot-production-history-production.mjs",
  "packages/database/scripts/founder-pilot-production-history-rehearsal.cli.mjs",
  "packages/database/scripts/founder-pilot-production-history-rehearsal.mjs",
  "packages/database/scripts/founder-pilot-restored-copy-preflight.cli.mjs",
  "packages/database/scripts/founder-pilot-restored-copy-preflight.mjs",
  "packages/database/scripts/guest-support-current189-production-upgrade.cli.mjs",
  "packages/database/scripts/guest-support-current189-production-upgrade.mjs",
  "packages/database/scripts/identity-mail-worker-enrollment.cli.mjs",
  "packages/database/scripts/identity-mail-worker-enrollment.mjs",
  "packages/database/scripts/parallel-backup-restored-copy-evidence.cli.mjs",
  "packages/database/scripts/parallel-backup-restored-copy-evidence.mjs",
  "packages/database/scripts/run-current-release-restored-copy-acceptance.sh",
  "packages/database/scripts/runtime-function-enrollment.cli.mjs",
  "packages/database/scripts/runtime-function-enrollment.mjs",
  "packages/database/scripts/shared-beta-admission-provenance-catalog.mjs",
  "packages/database/scripts/staff-attachment-backfill-dry-run.mjs",
  "packages/database/scripts/staff-attachment-reconciliation.cli.mjs",
  "packages/database/scripts/staff-attachment-reconciliation.mjs",
  "packages/database/scripts/staff-task-integrity-migration-state.mjs",
];

const MANIFEST_NAME = "SHA256SUMS";
const MANIFEST_PATH = `./${MANIFEST_NAME}`;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const EXPECTED_NODE_VERSION = "22";
const EXPECTED_PNPM_VERSION = "10.33.2";
const EXPECTED_DATABASE_DEPLOY_COMMAND =
  "node scripts/canonical-prisma-deploy.mjs";
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const IMPACT_RECEIPT_SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RUNTIME_ELIGIBLE_LANES = new Set(["L1_RUNTIME", "L2_SCHEMA_SECURITY"]);
const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/u;
const REQUIRED_CORE_FILES = [
  "./apps/api/dist/main.js",
  "./apps/api/package.json",
  "./apps/web/.next/BUILD_ID",
  "./apps/web/next.config.ts",
  "./apps/web/package.json",
  "./package.json",
  "./packages/database/package.json",
  "./packages/database/prisma/migrations/migration_lock.toml",
  "./packages/database/prisma/schema.prisma",
  "./pnpm-lock.yaml",
  "./pnpm-workspace.yaml",
];
const compareUtf8 = (left, right) =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

function fail(message) {
  throw new Error(`verify-runtime-release-artifact: ${message}`);
}

function parseArguments(argv) {
  let releaseRoot;
  let expectedReleaseSha;
  let expectedEffectiveLane;
  let expectedImpactReceiptSha256;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (
      argument === "--release-root" ||
      argument === "--expected-release-sha" ||
      argument === "--expected-effective-lane" ||
      argument === "--expected-impact-receipt-sha256"
    ) {
      if (seen.has(argument)) fail(`duplicate argument: ${argument}`);
      seen.add(argument);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`${argument} requires one value`);
      }
      if (argument === "--release-root") releaseRoot = value;
      else if (argument === "--expected-release-sha") expectedReleaseSha = value;
      else if (argument === "--expected-effective-lane") expectedEffectiveLane = value;
      else expectedImpactReceiptSha256 = value;
      index += 1;
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }
  if (!releaseRoot) fail("--release-root is required");
  if (!RELEASE_SHA_PATTERN.test(expectedReleaseSha ?? "")) {
    fail("--expected-release-sha must be 40 lowercase hexadecimal characters");
  }
  if ((expectedEffectiveLane === undefined) !== (expectedImpactReceiptSha256 === undefined)) {
    fail("expected admission lane and impact receipt digest must be provided together");
  }
  if (
    expectedEffectiveLane !== undefined &&
    (!RUNTIME_ELIGIBLE_LANES.has(expectedEffectiveLane) ||
      !IMPACT_RECEIPT_SHA256_PATTERN.test(expectedImpactReceiptSha256))
  ) {
    fail("expected admission lane is invalid");
  }
  return {
    expectedEffectiveLane,
    expectedImpactReceiptSha256,
    expectedReleaseSha,
    releaseRoot,
  };
}

function assertSafePath(relativePath, source) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath !== relativePath.normalize("NFC") ||
    /[\\\p{Cc}]/u.test(relativePath)
  ) {
    fail(
      `${source} path is not canonical UTF-8: ${JSON.stringify(relativePath)}`,
    );
  }
  const components = relativePath.split("/");
  if (
    components.some(
      (component) =>
        component.length === 0 || component === "." || component === "..",
    )
  ) {
    fail(
      `${source} path has an unsafe component: ${JSON.stringify(relativePath)}`,
    );
  }
}

function walkArtifactTree(
  root,
  directory = root,
  relativeDirectory = "",
  tree = { directoryPaths: [], regularPaths: [] },
) {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareUtf8(left.name, right.name));
  for (const entry of entries) {
    assertSafePath(entry.name, "artifact entry");
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    assertSafePath(relativePath, "artifact entry");
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const stat = fs.lstatSync(absolutePath);
    if (stat.isDirectory()) {
      tree.directoryPaths.push(`./${relativePath}`);
      walkArtifactTree(root, absolutePath, relativePath, tree);
      continue;
    }
    if (!stat.isFile())
      fail(`artifact entry is not a regular file: ${relativePath}`);
    if (stat.nlink !== 1)
      fail(`artifact regular file has shared hardlinks: ${relativePath}`);
    tree.regularPaths.push(`./${relativePath}`);
  }
  return tree;
}

function readManifest(root) {
  const manifestAbsolutePath = path.join(root, MANIFEST_NAME);
  const stat = fs.lstatSync(manifestAbsolutePath);
  if (!stat.isFile() || stat.nlink !== 1) {
    fail("root SHA256SUMS must be one regular, non-hardlinked file");
  }
  const bytes = fs.readFileSync(manifestAbsolutePath);
  if (bytes.length === 0 || bytes.length > MAX_MANIFEST_BYTES) {
    fail("root SHA256SUMS has an invalid size");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("root SHA256SUMS is not valid UTF-8");
  }
  if (!text.endsWith("\n")) {
    fail("root SHA256SUMS must end with exactly one complete line");
  }

  const entries = [];
  const seenPaths = new Set();
  let priorPath;
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  (\.\/.+)$/u.exec(line);
    if (!match)
      fail(`root SHA256SUMS line is not canonical: ${JSON.stringify(line)}`);
    const [, digest, manifestPath] = match;
    const relativePath = manifestPath.slice(2);
    assertSafePath(relativePath, "manifest");
    if (manifestPath === MANIFEST_PATH)
      fail("root SHA256SUMS must not hash itself");
    if (seenPaths.has(manifestPath)) {
      fail(`root SHA256SUMS contains a duplicate path: ${manifestPath}`);
    }
    if (priorPath !== undefined && compareUtf8(priorPath, manifestPath) >= 0) {
      fail("root SHA256SUMS paths are not in canonical byte order");
    }
    priorPath = manifestPath;
    seenPaths.add(manifestPath);
    entries.push({ digest, manifestPath, relativePath });
  }
  return { bytes, entries };
}

function assertExactTree(root, manifestEntries, actualPaths) {
  const manifestPaths = manifestEntries.map(({ manifestPath }) => manifestPath);
  if (
    actualPaths.length !== manifestPaths.length ||
    actualPaths.some((actualPath, index) => actualPath !== manifestPaths[index])
  ) {
    const manifestSet = new Set(manifestPaths);
    const actualSet = new Set(actualPaths);
    const unlisted = actualPaths.find(
      (candidate) => !manifestSet.has(candidate),
    );
    const absent = manifestPaths.find((candidate) => !actualSet.has(candidate));
    fail(
      `root SHA256SUMS path set differs from the regular-file tree` +
        `${unlisted ? `; unlisted=${unlisted}` : ""}` +
        `${absent ? `; absent=${absent}` : ""}`,
    );
  }

  for (const { digest, manifestPath, relativePath } of manifestEntries) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const actualDigest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(absolutePath))
      .digest("hex");
    if (actualDigest !== digest)
      fail(`root SHA256SUMS digest mismatch: ${manifestPath}`);
  }
}

function assertExactDirectories(manifestEntries, actualDirectoryPaths) {
  const expectedDirectorySet = new Set();
  for (const { relativePath } of manifestEntries) {
    const components = relativePath.split("/");
    for (let length = 1; length < components.length; length += 1) {
      expectedDirectorySet.add(`./${components.slice(0, length).join("/")}`);
    }
  }
  const expectedDirectoryPaths = [...expectedDirectorySet].sort(compareUtf8);
  if (
    actualDirectoryPaths.length !== expectedDirectoryPaths.length ||
    actualDirectoryPaths.some(
      (actualPath, index) => actualPath !== expectedDirectoryPaths[index],
    )
  ) {
    const actualSet = new Set(actualDirectoryPaths);
    const unlisted = actualDirectoryPaths.find(
      (candidate) => !expectedDirectorySet.has(candidate),
    );
    const absent = expectedDirectoryPaths.find(
      (candidate) => !actualSet.has(candidate),
    );
    fail(
      `runtime directory set differs from manifest-derived parent directories` +
        `${unlisted ? `; unlisted=${unlisted}` : ""}` +
        `${absent ? `; absent=${absent}` : ""}`,
    );
  }
}

function assertNoForbiddenRuntimePaths(actualPaths, actualDirectoryPaths) {
  const forbidden = [...actualPaths, ...actualDirectoryPaths]
    .sort(compareUtf8)
    .find((candidate) => {
      const relativePath = candidate.slice(2);
      const components = relativePath.split("/");
      return (
        components.includes("node_modules") ||
        relativePath === "apps/web/.next/cache" ||
        relativePath.startsWith("apps/web/.next/cache/") ||
        relativePath === "apps/web/.next/dev" ||
        relativePath.startsWith("apps/web/.next/dev/")
      );
    });
  if (forbidden) fail(`forbidden runtime artifact path: ${forbidden}`);
}

function assertCoreTopology(root, actualPaths, expectedReleaseSha) {
  const actualSet = new Set(actualPaths);
  for (const requiredPath of REQUIRED_CORE_FILES) {
    if (!actualSet.has(requiredPath)) {
      fail(`required runtime path is missing: ${requiredPath}`);
    }
  }

  const publicPrefix = "./apps/web/public/";
  if (!actualPaths.some((candidate) => candidate.startsWith(publicPrefix))) {
    fail(
      "Web public content must contain at least one manifest-bound regular file",
    );
  }

  const buildId = fs.readFileSync(
    path.join(root, "apps", "web", ".next", "BUILD_ID"),
    "utf8",
  );
  if (buildId !== expectedReleaseSha && buildId !== `${expectedReleaseSha}\n`) {
    fail("Web BUILD_ID does not match the exact release SHA");
  }

  const migrationPrefix = "./packages/database/prisma/migrations/";
  const migrationNames = [];
  for (const candidate of actualPaths.filter((value) =>
    value.startsWith(migrationPrefix),
  )) {
    if (candidate === `${migrationPrefix}migration_lock.toml`) continue;
    const match =
      /^\.\/packages\/database\/prisma\/migrations\/([^/]+)\/migration\.sql$/u.exec(
        candidate,
      );
    if (!match || !MIGRATION_NAME_PATTERN.test(match[1])) {
      fail(`Prisma migration tree contains an unexpected path: ${candidate}`);
    }
    migrationNames.push(match[1]);
  }
  migrationNames.sort(compareUtf8);
  if (migrationNames.length === 0)
    fail("Prisma migration tree must not be empty");
  if (new Set(migrationNames).size !== migrationNames.length) {
    fail("Prisma migration tree contains a duplicate migration identity");
  }

  let rootPackage;
  try {
    rootPackage = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    );
  } catch {
    fail("root package.json is not valid JSON");
  }
  if (
    rootPackage === null ||
    Array.isArray(rootPackage) ||
    typeof rootPackage !== "object" ||
    rootPackage.packageManager !== `pnpm@${EXPECTED_PNPM_VERSION}`
  ) {
    fail("root package.json does not pin the exact release pnpm version");
  }

  let databasePackage;
  try {
    databasePackage = JSON.parse(
      fs.readFileSync(
        path.join(root, "packages", "database", "package.json"),
        "utf8",
      ),
    );
  } catch {
    fail("database package.json is not valid JSON");
  }
  if (
    databasePackage === null ||
    Array.isArray(databasePackage) ||
    typeof databasePackage !== "object" ||
    databasePackage.scripts?.["db:deploy"] !==
      EXPECTED_DATABASE_DEPLOY_COMMAND ||
    databasePackage.scripts?.["predb:deploy"] !== undefined ||
    databasePackage.scripts?.["postdb:deploy"] !== undefined
  ) {
    fail(
      "database deploy command is not the exact canonical artifact boundary",
    );
  }

  return {
    databaseMigration: migrationNames.at(-1),
    databaseMigrationCount: migrationNames.length,
  };
}

function assertOperationalScriptIdentity(actualPaths) {
  const prefix = "./packages/database/scripts/";
  const actualScripts = actualPaths
    .filter((candidate) => candidate.startsWith(prefix))
    .map((candidate) => candidate.slice(2))
    .sort(compareUtf8);
  const expectedScripts = [...EXPECTED_OPERATIONAL_SCRIPTS].sort(compareUtf8);
  if (
    actualScripts.length !== expectedScripts.length ||
    actualScripts.some(
      (actualPath, index) => actualPath !== expectedScripts[index],
    )
  ) {
    const expectedSet = new Set(expectedScripts);
    const actualSet = new Set(actualScripts);
    const unexpected = actualScripts.find(
      (candidate) => !expectedSet.has(candidate),
    );
    const missing = expectedScripts.find(
      (candidate) => !actualSet.has(candidate),
    );
    fail(
      `operational script identity set is not exact` +
        `${unexpected ? `; unexpected=${unexpected}` : ""}` +
        `${missing ? `; missing=${missing}` : ""}`,
    );
  }
}

function assertProvenance(
  root,
  expectedReleaseSha,
  migrationIdentity,
  expectedEffectiveLane,
  expectedImpactReceiptSha256,
) {
  const provenancePath = path.join(root, "release-provenance.json");
  let provenance;
  try {
    provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  } catch {
    fail("release-provenance.json is not valid JSON");
  }
  if (
    provenance === null ||
    Array.isArray(provenance) ||
    typeof provenance !== "object"
  ) {
    fail("release-provenance.json must contain one JSON object");
  }
  if (
    !RUNTIME_ELIGIBLE_LANES.has(provenance.effectiveLane) ||
    !IMPACT_RECEIPT_SHA256_PATTERN.test(provenance.impactReceiptSha256 ?? "")
  ) {
    fail("release provenance admission lane is invalid");
  }
  const expectedFields = {
    canonicalPrismaDeployScriptCount: 1,
    canonicalPrismaDeployScriptsIncluded: true,
    currentNetworkAccessScopeClassificationScriptCount: 2,
    currentNetworkAccessScopeClassificationScriptsIncluded: true,
    currentReleaseRuntimeAcceptanceScriptCount: 3,
    currentReleaseRuntimeAcceptanceScriptsIncluded: true,
    databaseMigration: migrationIdentity.databaseMigration,
    databaseMigrationCount: migrationIdentity.databaseMigrationCount,
    effectiveLane: provenance.effectiveLane,
    founderPilotOperationalScriptCount: 18,
    founderPilotOperationalScriptsIncluded: true,
    impactReceiptSha256: provenance.impactReceiptSha256,
    nodeVersion: EXPECTED_NODE_VERSION,
    operationalScriptCount: 35,
    parallelBackupRestoredCopyEvidenceScriptCount: 2,
    parallelBackupRestoredCopyEvidenceScriptsIncluded: true,
    pnpmVersion: EXPECTED_PNPM_VERSION,
    releaseSha: expectedReleaseSha,
    runtimeEnrollmentOperationalScriptCount: 6,
    runtimeEnrollmentOperationalScriptsIncluded: true,
    runtimePackageManifestsIncluded: true,
    staffAttachmentReconciliationScriptCount: 3,
    staffAttachmentReconciliationScriptsIncluded: true,
    webPublicAssetsIncluded: true,
  };
  const expectedKeys = Object.keys(expectedFields).sort(compareUtf8);
  const actualKeys = Object.keys(provenance).sort(compareUtf8);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((actualKey, index) => actualKey !== expectedKeys[index])
  ) {
    const expectedSet = new Set(expectedKeys);
    const actualSet = new Set(actualKeys);
    const unexpected = actualKeys.find(
      (candidate) => !expectedSet.has(candidate),
    );
    const missing = expectedKeys.find((candidate) => !actualSet.has(candidate));
    fail(
      `release provenance key set is not exact` +
        `${unexpected ? `; unexpected=${unexpected}` : ""}` +
        `${missing ? `; missing=${missing}` : ""}`,
    );
  }
  for (const [key, value] of Object.entries(expectedFields)) {
    if (provenance?.[key] !== value) {
      fail(`release provenance field is not exact: ${key}`);
    }
  }
  if (
    expectedEffectiveLane !== undefined &&
    (provenance.effectiveLane !== expectedEffectiveLane ||
      provenance.impactReceiptSha256 !== expectedImpactReceiptSha256)
  ) {
    fail("release provenance admission authority differs from the expected handoff");
  }
}

const {
  expectedEffectiveLane,
  expectedImpactReceiptSha256,
  expectedReleaseSha,
  releaseRoot,
} = parseArguments(
  process.argv.slice(2),
);
const unresolvedRoot = path.resolve(releaseRoot);
const rootStat = fs.lstatSync(unresolvedRoot);
if (!rootStat.isDirectory())
  fail("release root must be a directory, not a symlink");
const root = fs.realpathSync.native(unresolvedRoot);
if (root !== unresolvedRoot) {
  fail("release root and every ancestor must be canonical and symlink-free");
}

const { bytes: manifestBytes, entries: manifestEntries } = readManifest(root);
const { directoryPaths, regularPaths } = walkArtifactTree(root);
const actualPaths = regularPaths
  .filter((candidate) => candidate !== MANIFEST_PATH)
  .sort(compareUtf8);
directoryPaths.sort(compareUtf8);
assertNoForbiddenRuntimePaths(actualPaths, directoryPaths);
assertExactDirectories(manifestEntries, directoryPaths);
assertExactTree(root, manifestEntries, actualPaths);
assertOperationalScriptIdentity(actualPaths);
const migrationIdentity = assertCoreTopology(
  root,
  actualPaths,
  expectedReleaseSha,
);
assertProvenance(
  root,
  expectedReleaseSha,
  migrationIdentity,
  expectedEffectiveLane,
  expectedImpactReceiptSha256,
);

const manifestDigest = crypto
  .createHash("sha256")
  .update(manifestBytes)
  .digest("hex");
process.stdout.write(
  `RUNTIME_RELEASE_ARTIFACT_INTEGRITY=PASS\n` +
    `RUNTIME_RELEASE_SHA=${expectedReleaseSha}\n` +
    `RUNTIME_RELEASE_MANIFEST_SHA256=${manifestDigest}\n` +
    `RUNTIME_RELEASE_REGULAR_FILE_COUNT=${actualPaths.length}\n` +
    `RUNTIME_RELEASE_OPERATIONAL_SCRIPT_COUNT=${EXPECTED_OPERATIONAL_SCRIPTS.length}\n`,
);

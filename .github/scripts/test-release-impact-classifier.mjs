#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLASSIFIER = path.join(REPOSITORY_ROOT, ".github/scripts/classify-release-impact.mjs");
const RULES = path.join(REPOSITORY_ROOT, "docs/deployment/release-impact-classifier.json");
const EXPECTED_GATES = Object.freeze({
  L0_DOCS: ["FAST_CI", "NON_DEPLOYABLE_RECEIPT"],
  L1_RUNTIME: ["FAST_CI", "FOCUSED_TESTS", "FULL_RELEASE_ADMISSION", "BLUE_GREEN_ROLLOUT"],
  L2_SCHEMA_SECURITY: [
    "FAST_CI",
    "FULL_RELEASE_ADMISSION",
    "FRESH_BACKUP",
    "RESTORED_COPY_ACCEPTANCE",
    "SIGNED_CONTROLLER",
    "BLUE_GREEN_ROLLBACK_POSTCHECK",
  ],
});

function gitEnvironment() {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : os.devNull,
    GIT_OPTIONAL_LOCKS: "0",
  };
}

function runGit(root, argumentsList) {
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", ...argumentsList], {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(),
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `git ${argumentsList.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function writeFile(root, filePath, contents = "fixture\n") {
  const destination = path.join(root, ...filePath.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents, "utf8");
}

function commitAll(root, message) {
  runGit(root, ["add", "--all"]);
  runGit(root, [
    "-c",
    "user.name=LeetPlus CI",
    "-c",
    "user.email=ci@invalid.local",
    "commit",
    "--quiet",
    "--no-gpg-sign",
    "-m",
    message,
  ]);
  return runGit(root, ["rev-parse", "HEAD"]);
}

function createScenario(fixturesRoot, name, changedFiles) {
  const root = path.join(fixturesRoot, name);
  fs.mkdirSync(root, { recursive: true });
  runGit(root, ["init", "--quiet"]);
  writeFile(root, ".fixture-base", "base\n");
  const baseSha = commitAll(root, "base");
  for (const [filePath, contents] of Object.entries(changedFiles)) writeFile(root, filePath, contents);
  const headSha = commitAll(root, name);
  return { root, baseSha, headSha };
}

function runClassifier({ root, baseSha, headSha, receipt, minimumLane = "L0_DOCS", rules = RULES, verify = false }) {
  const receiptArgument = verify ? "--verify-receipt" : "--output";
  return spawnSync(process.execPath, [
    CLASSIFIER,
    "--root",
    root,
    "--rules",
    rules,
    "--base-sha",
    baseSha,
    "--head-sha",
    headSha,
    "--minimum-lane",
    minimumLane,
    receiptArgument,
    receipt,
  ], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
}

function classify(fixturesRoot, name, changedFiles, expectedLane, minimumLane = "L0_DOCS") {
  const scenario = createScenario(fixturesRoot, name, changedFiles);
  const receipt = path.join(fixturesRoot, `${name}.receipt.json`);
  const result = runClassifier({ ...scenario, receipt, minimumLane });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RELEASE_IMPACT_CLASSIFICATION=PASS/);
  const parsed = JSON.parse(fs.readFileSync(receipt, "utf8"));
  assert.equal(parsed.effectiveLane, expectedLane);
  assert.deepEqual(parsed.requiredGates, EXPECTED_GATES[expectedLane]);
  assert.equal(parsed.runtimeArtifactEligible, expectedLane !== "L0_DOCS");
  assert.equal(parsed.changedFileCount, Object.keys(changedFiles).length);
  const verification = runClassifier({ ...scenario, receipt, minimumLane, verify: true });
  assert.equal(verification.status, 0, verification.stderr);
  return { ...scenario, receipt, parsed };
}

const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leetplus-release-impact-"));
try {
  const documentation = classify(
    fixturesRoot,
    "documentation",
    { "docs/deployment/runbook.md": "docs\n", "README.md": "readme\n" },
    "L0_DOCS",
  );
  assert.deepEqual(documentation.parsed.sourceLaneSet, ["L0_DOCS"]);
  assert.equal(documentation.parsed.mixedSourceLanes, false);
  const rejectedOverwrite = runClassifier({ ...documentation });
  assert.notEqual(rejectedOverwrite.status, 0);
  assert.match(rejectedOverwrite.stderr, /output receipt already exists/);

  classify(
    fixturesRoot,
    "ordinary-runtime",
    {
      "apps/api/src/categories/category.service.ts": "export const value = 1;\n",
      "apps/web/src/components/status-card.tsx": "export const StatusCard = () => null;\n",
    },
    "L1_RUNTIME",
  );

  classify(
    fixturesRoot,
    "schema",
    { "packages/database/prisma/migrations/20990101000000_example/migration.sql": "SELECT 1;\n" },
    "L2_SCHEMA_SECURITY",
  );
  classify(
    fixturesRoot,
    "security-contours",
    {
      "apps/api/src/auth/example.ts": "export {};\n",
      "apps/api/src/tenancy/example.ts": "export {};\n",
      "apps/web/src/app/play/page.tsx": "export default function Page() {}\n",
    },
    "L2_SCHEMA_SECURITY",
  );
  classify(fixturesRoot, "unknown", { "unexpected/payload.bin": "opaque\n" }, "L2_SCHEMA_SECURITY");

  const mixed = classify(
    fixturesRoot,
    "mixed",
    {
      "docs/deployment/runbook.md": "docs\n",
      "apps/web/src/components/status-card.tsx": "export const StatusCard = () => null;\n",
    },
    "L2_SCHEMA_SECURITY",
  );
  assert.deepEqual(mixed.parsed.sourceLaneSet, ["L0_DOCS", "L1_RUNTIME"]);
  assert.equal(mixed.parsed.mixedSourceLanes, true);
  assert.equal(mixed.parsed.inferredLane, "L2_SCHEMA_SECURITY");

  const elevated = classify(
    fixturesRoot,
    "manual-elevation",
    { "docs/deployment/runbook.md": "docs\n" },
    "L2_SCHEMA_SECURITY",
    "L2_SCHEMA_SECURITY",
  );
  assert.equal(elevated.parsed.inferredLane, "L0_DOCS");
  assert.equal(elevated.parsed.minimumLane, "L2_SCHEMA_SECURITY");

  const cannotLower = classify(
    fixturesRoot,
    "cannot-lower",
    { "apps/api/src/auth/example.ts": "export {};\n" },
    "L2_SCHEMA_SECURITY",
    "L0_DOCS",
  );
  assert.equal(cannotLower.parsed.inferredLane, "L2_SCHEMA_SECURITY");

  const tampered = JSON.parse(fs.readFileSync(documentation.receipt, "utf8"));
  tampered.effectiveLane = "L1_RUNTIME";
  fs.writeFileSync(documentation.receipt, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
  const rejectedTamper = runClassifier({ ...documentation, verify: true });
  assert.notEqual(rejectedTamper.status, 0);
  assert.match(rejectedTamper.stderr, /does not match the exact base\/head\/rules classification/);

  const ancestryRoot = path.join(fixturesRoot, "non-ancestor");
  fs.mkdirSync(ancestryRoot, { recursive: true });
  runGit(ancestryRoot, ["init", "--quiet"]);
  writeFile(ancestryRoot, ".fixture-base", "base\n");
  const commonSha = commitAll(ancestryRoot, "base");
  runGit(ancestryRoot, ["checkout", "--quiet", "-b", "sibling"]);
  writeFile(ancestryRoot, "docs/sibling.md", "sibling\n");
  const siblingSha = commitAll(ancestryRoot, "sibling");
  runGit(ancestryRoot, ["checkout", "--quiet", "-b", "head", commonSha]);
  writeFile(ancestryRoot, "docs/head.md", "head\n");
  const headSha = commitAll(ancestryRoot, "head");
  const ancestryReceipt = path.join(fixturesRoot, "non-ancestor.receipt.json");
  const rejectedAncestry = runClassifier({
    root: ancestryRoot,
    baseSha: siblingSha,
    headSha,
    receipt: ancestryReceipt,
  });
  assert.notEqual(rejectedAncestry.status, 0);
  assert.match(rejectedAncestry.stderr, /base SHA must be an ancestor/);

  const rejectedHead = runClassifier({
    root: ancestryRoot,
    baseSha: commonSha,
    headSha: commonSha,
    receipt: ancestryReceipt,
  });
  assert.notEqual(rejectedHead.status, 0);
  assert.match(rejectedHead.stderr, /--head-sha must equal checked-out HEAD/);

  const malformedRules = path.join(fixturesRoot, "malformed-rules.json");
  const malformed = JSON.parse(fs.readFileSync(RULES, "utf8"));
  malformed.rules[0] = {};
  fs.writeFileSync(malformedRules, `${JSON.stringify(malformed, null, 2)}\n`, "utf8");
  const malformedReceipt = path.join(fixturesRoot, "malformed.receipt.json");
  const rejectedRules = runClassifier({
    root: documentation.root,
    baseSha: documentation.baseSha,
    headSha: documentation.headSha,
    receipt: malformedReceipt,
    rules: malformedRules,
  });
  assert.notEqual(rejectedRules.status, 0);
  assert.match(rejectedRules.stderr, /rules\.rules\[0\] keys must be exactly/);
  assert.doesNotMatch(rejectedRules.stderr, /TypeError/);
} finally {
  fs.rmSync(fixturesRoot, { force: true, recursive: true });
}

process.stdout.write("RELEASE_IMPACT_CLASSIFIER_TEST=PASS\n");

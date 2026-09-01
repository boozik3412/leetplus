#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IMPACT_CLASSIFIER = path.join(REPOSITORY_ROOT, ".github/scripts/classify-release-impact.mjs");
const CANDIDATE_CLASSIFIER = path.join(REPOSITORY_ROOT, ".github/scripts/classify-release-candidate.mjs");
const RULES = path.join(REPOSITORY_ROOT, "docs/deployment/release-impact-classifier.json");
const REPOSITORY = "boozik3412/leetplus";
const MAIN_REF = "refs/heads/main";
const ZERO_SHA = "0".repeat(40);

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

function writeFile(root, filePath, contents) {
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

function createScenario(fixturesRoot, name, filePath) {
  const root = path.join(fixturesRoot, name);
  fs.mkdirSync(root, { recursive: true });
  runGit(root, ["init", "--quiet"]);
  writeFile(root, ".fixture-base", "base\n");
  const baseSha = commitAll(root, "base");
  writeFile(root, filePath, `${name}\n`);
  const headSha = commitAll(root, name);
  const impactReceipt = path.join(fixturesRoot, `${name}.impact.json`);
  const impact = spawnSync(process.execPath, [
    IMPACT_CLASSIFIER,
    "--root",
    root,
    "--rules",
    RULES,
    "--base-sha",
    baseSha,
    "--head-sha",
    headSha,
    "--minimum-lane",
    "L0_DOCS",
    "--output",
    impactReceipt,
  ], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(impact.status, 0, impact.stderr);
  return { root, baseSha, headSha, impactReceipt };
}

function candidateArguments(scenario, receipt, overrides = {}, verify = false) {
  const eventName = overrides.eventName ?? "push";
  const ref = overrides.ref ?? MAIN_REF;
  const eventBeforeSha = overrides.eventBeforeSha ?? scenario.baseSha;
  const repository = overrides.repository ?? REPOSITORY;
  const workflowRef =
    overrides.workflowRef ?? `${REPOSITORY}/.github/workflows/ci.yml@${eventName === "push" ? MAIN_REF : ref}`;
  const workflowSha = overrides.workflowSha ?? scenario.headSha;
  const impactReceipt = overrides.impactReceipt ?? scenario.impactReceipt;
  return [
    CANDIDATE_CLASSIFIER,
    "--root",
    scenario.root,
    "--release-sha",
    scenario.headSha,
    "--event-name",
    eventName,
    "--ref",
    ref,
    "--event-before-sha",
    eventBeforeSha,
    "--repository",
    repository,
    "--workflow-ref",
    workflowRef,
    "--workflow-sha",
    workflowSha,
    "--impact-receipt",
    impactReceipt,
    verify ? "--verify-receipt" : "--output",
    receipt,
  ];
}

function runCandidate(scenario, receipt, overrides = {}, verify = false) {
  return spawnSync(process.execPath, candidateArguments(scenario, receipt, overrides, verify), {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
}

const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leetplus-release-candidate-"));
try {
  const runtime = createScenario(
    fixturesRoot,
    "runtime-main-push",
    "apps/api/src/categories/release-candidate.fixture.ts",
  );
  const runtimeReceipt = path.join(fixturesRoot, "runtime-main-push.candidate.json");
  const accepted = runCandidate(runtime, runtimeReceipt);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /deployableCandidate=true/u);
  const parsedRuntime = JSON.parse(fs.readFileSync(runtimeReceipt, "utf8"));
  assert.equal(parsedRuntime.deployableCandidate, true);
  assert.equal(parsedRuntime.decision, "EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE");
  assert.equal(parsedRuntime.releaseSha, runtime.headSha);
  assert.equal(parsedRuntime.eventBeforeSha, runtime.baseSha);
  const verified = runCandidate(runtime, runtimeReceipt, {}, true);
  assert.equal(verified.status, 0, verified.stderr);

  const rejectedOverwrite = runCandidate(runtime, runtimeReceipt);
  assert.notEqual(rejectedOverwrite.status, 0);
  assert.match(rejectedOverwrite.stderr, /output receipt already exists/u);

  const docs = createScenario(fixturesRoot, "docs-main-push", "docs/deployment/release-candidate-fixture.md");
  const docsReceipt = path.join(fixturesRoot, "docs-main-push.candidate.json");
  const acceptedDocs = runCandidate(docs, docsReceipt);
  assert.equal(acceptedDocs.status, 0, acceptedDocs.stderr);
  const parsedDocs = JSON.parse(fs.readFileSync(docsReceipt, "utf8"));
  assert.equal(parsedDocs.effectiveLane, "L0_DOCS");
  assert.equal(parsedDocs.runtimeArtifactEligible, false);
  assert.equal(parsedDocs.deployableCandidate, false);
  assert.equal(parsedDocs.decision, "DOCS_ONLY_MAIN_PUSH_NON_DEPLOYABLE");

  for (const [eventName, ref, decision] of [
    ["workflow_dispatch", "refs/heads/codex/manual-validation", "MANUAL_VALIDATION_NON_DEPLOYABLE"],
    ["schedule", MAIN_REF, "SCHEDULED_VALIDATION_NON_DEPLOYABLE"],
  ]) {
    const receipt = path.join(fixturesRoot, `${eventName}.candidate.json`);
    const result = runCandidate(runtime, receipt, { eventName, ref, eventBeforeSha: "" });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(fs.readFileSync(receipt, "utf8"));
    assert.equal(parsed.deployableCandidate, false);
    assert.equal(parsed.decision, decision);
  }

  const invalidCases = [
    [{ ref: "refs/heads/codex/not-main" }, /push admission is allowed only/u],
    [{ eventBeforeSha: ZERO_SHA }, /exact non-zero before SHA/u],
    [{ eventBeforeSha: runtime.headSha }, /impact receipt base must equal/u],
    [{ repository: "attacker/fork" }, /--repository must be exactly/u],
    [{ workflowSha: runtime.baseSha }, /workflow SHA must equal/u],
    [
      { workflowRef: `${REPOSITORY}/.github/workflows/ci.yml@refs/heads/codex/not-main` },
      /exact main workflow ref/u,
    ],
    [{ eventName: "pull_request" }, /is not admitted by the release-candidate contract/u],
  ];
  for (const [overrides, expectedError] of invalidCases) {
    const receipt = path.join(fixturesRoot, `rejected-${invalidCases.indexOf(invalidCases.find((entry) => entry[0] === overrides))}.json`);
    const result = runCandidate(runtime, receipt, overrides);
    assert.notEqual(result.status, 0, `unexpectedly accepted ${JSON.stringify(overrides)}`);
    assert.match(result.stderr, expectedError);
    assert.equal(fs.existsSync(receipt), false);
  }

  const tamperedImpact = path.join(fixturesRoot, "tampered-impact.json");
  const tampered = JSON.parse(fs.readFileSync(runtime.impactReceipt, "utf8"));
  tampered.effectiveLane = "L0_DOCS";
  tampered.runtimeArtifactEligible = false;
  fs.writeFileSync(tamperedImpact, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
  const rejectedTamper = runCandidate(
    runtime,
    path.join(fixturesRoot, "tampered-candidate.json"),
    { impactReceipt: tamperedImpact },
  );
  assert.notEqual(rejectedTamper.status, 0);
  assert.match(rejectedTamper.stderr, /impact receipt re-verification exited/u);

  const changedCandidate = JSON.parse(fs.readFileSync(runtimeReceipt, "utf8"));
  changedCandidate.deployableCandidate = false;
  fs.writeFileSync(runtimeReceipt, `${JSON.stringify(changedCandidate, null, 2)}\n`, "utf8");
  const rejectedCandidateTamper = runCandidate(runtime, runtimeReceipt, {}, true);
  assert.notEqual(rejectedCandidateTamper.status, 0);
  assert.match(rejectedCandidateTamper.stderr, /does not match the exact event\/SHA\/impact authority/u);

  process.stdout.write("RELEASE_CANDIDATE_CLASSIFIER_TEST=PASS\n");
} finally {
  fs.rmSync(fixturesRoot, { recursive: true, force: true });
}

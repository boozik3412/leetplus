#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADAPTER = path.join(REPOSITORY_ROOT, ".github/scripts/classify-release-impact-ci.mjs");

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

function createRepository(fixturesRoot, name) {
  const root = path.join(fixturesRoot, name);
  fs.mkdirSync(root, { recursive: true });
  runGit(root, ["init", "--quiet"]);
  writeFile(root, ".fixture-base", "base\n");
  const baseSha = commitAll(root, "base");
  return { root, baseSha };
}

function runAdapter({ root, headSha, eventName, ref, eventBaseSha = "", output }) {
  return spawnSync(process.execPath, [
    ADAPTER,
    "--root",
    root,
    "--head-sha",
    headSha,
    "--event-name",
    eventName,
    "--ref",
    ref,
    "--event-base-sha",
    eventBaseSha,
    "--output",
    output,
  ], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
}

function readReceipt(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const fixturesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leetplus-release-impact-ci-"));
try {
  const push = createRepository(fixturesRoot, "push");
  writeFile(push.root, "docs/deployment/runbook.md", "docs\n");
  const pushHead = commitAll(push.root, "docs");
  const pushReceipt = path.join(fixturesRoot, "push.receipt.json");
  const acceptedPush = runAdapter({
    root: push.root,
    headSha: pushHead,
    eventName: "push",
    ref: "refs/heads/main",
    eventBaseSha: push.baseSha,
    output: pushReceipt,
  });
  assert.equal(acceptedPush.status, 0, acceptedPush.stderr);
  assert.match(acceptedPush.stdout, /baseSource=PUSH_BEFORE/);
  assert.equal(readReceipt(pushReceipt).effectiveLane, "L0_DOCS");

  const dispatchMain = createRepository(fixturesRoot, "dispatch-main");
  writeFile(dispatchMain.root, "docs/deployment/runbook.md", "docs\n");
  const dispatchMainHead = commitAll(dispatchMain.root, "docs");
  const dispatchMainReceipt = path.join(fixturesRoot, "dispatch-main.receipt.json");
  const acceptedDispatchMain = runAdapter({
    root: dispatchMain.root,
    headSha: dispatchMainHead,
    eventName: "workflow_dispatch",
    ref: "refs/heads/main",
    output: dispatchMainReceipt,
  });
  assert.equal(acceptedDispatchMain.status, 0, acceptedDispatchMain.stderr);
  assert.match(acceptedDispatchMain.stdout, /baseSource=UNSCOPED_EVENT_FAIL_CLOSED/);
  assert.equal(readReceipt(dispatchMainReceipt).minimumLane, "L2_SCHEMA_SECURITY");
  assert.equal(readReceipt(dispatchMainReceipt).effectiveLane, "L2_SCHEMA_SECURITY");

  const dispatchBranch = createRepository(fixturesRoot, "dispatch-branch");
  runGit(dispatchBranch.root, ["update-ref", "refs/remotes/origin/main", dispatchBranch.baseSha]);
  writeFile(dispatchBranch.root, "apps/web/src/components/status-card.tsx", "export const StatusCard = () => null;\n");
  const dispatchBranchHead = commitAll(dispatchBranch.root, "runtime");
  const dispatchBranchReceipt = path.join(fixturesRoot, "dispatch-branch.receipt.json");
  const acceptedDispatchBranch = runAdapter({
    root: dispatchBranch.root,
    headSha: dispatchBranchHead,
    eventName: "workflow_dispatch",
    ref: "refs/heads/codex/example",
    output: dispatchBranchReceipt,
  });
  assert.equal(acceptedDispatchBranch.status, 0, acceptedDispatchBranch.stderr);
  assert.match(acceptedDispatchBranch.stdout, /baseSource=MANUAL_BRANCH_MERGE_BASE/);
  assert.equal(readReceipt(dispatchBranchReceipt).baseSha, dispatchBranch.baseSha);
  assert.equal(readReceipt(dispatchBranchReceipt).effectiveLane, "L1_RUNTIME");

  const diverged = createRepository(fixturesRoot, "diverged");
  runGit(diverged.root, ["checkout", "--quiet", "-b", "main-tip"]);
  writeFile(diverged.root, "docs/main.md", "main\n");
  const eventBaseSha = commitAll(diverged.root, "main tip");
  runGit(diverged.root, ["checkout", "--quiet", "-b", "feature", diverged.baseSha]);
  writeFile(diverged.root, "docs/feature.md", "feature\n");
  const divergedHead = commitAll(diverged.root, "feature");

  const pullRequestReceipt = path.join(fixturesRoot, "pull-request.receipt.json");
  const acceptedPullRequest = runAdapter({
    root: diverged.root,
    headSha: divergedHead,
    eventName: "pull_request",
    ref: "refs/pull/1/head",
    eventBaseSha,
    output: pullRequestReceipt,
  });
  assert.equal(acceptedPullRequest.status, 0, acceptedPullRequest.stderr);
  assert.match(acceptedPullRequest.stdout, /baseSource=PULL_REQUEST_MERGE_BASE/);
  assert.equal(readReceipt(pullRequestReceipt).baseSha, diverged.baseSha);
  assert.equal(readReceipt(pullRequestReceipt).effectiveLane, "L0_DOCS");

  const forcedPushReceipt = path.join(fixturesRoot, "forced-push.receipt.json");
  const acceptedForcedPush = runAdapter({
    root: diverged.root,
    headSha: divergedHead,
    eventName: "push",
    ref: "refs/heads/main",
    eventBaseSha,
    output: forcedPushReceipt,
  });
  assert.equal(acceptedForcedPush.status, 0, acceptedForcedPush.stderr);
  assert.match(acceptedForcedPush.stdout, /baseSource=FORCED_PUSH_MERGE_BASE_FAIL_CLOSED/);
  assert.equal(readReceipt(forcedPushReceipt).minimumLane, "L2_SCHEMA_SECURITY");
  assert.equal(readReceipt(forcedPushReceipt).effectiveLane, "L2_SCHEMA_SECURITY");

  const missingBaseReceipt = path.join(fixturesRoot, "missing-base.receipt.json");
  const rejectedMissingPullRequestBase = runAdapter({
    root: diverged.root,
    headSha: divergedHead,
    eventName: "pull_request",
    ref: "refs/pull/1/head",
    output: missingBaseReceipt,
  });
  assert.notEqual(rejectedMissingPullRequestBase.status, 0);
  assert.match(rejectedMissingPullRequestBase.stderr, /requires an exact non-zero event base SHA/);

  const noMain = createRepository(fixturesRoot, "no-origin-main");
  writeFile(noMain.root, "docs/example.md", "docs\n");
  const noMainHead = commitAll(noMain.root, "docs");
  const noMainReceipt = path.join(fixturesRoot, "no-origin-main.receipt.json");
  const acceptedNoMain = runAdapter({
    root: noMain.root,
    headSha: noMainHead,
    eventName: "workflow_dispatch",
    ref: "refs/heads/codex/example",
    output: noMainReceipt,
  });
  assert.equal(acceptedNoMain.status, 0, acceptedNoMain.stderr);
  assert.match(acceptedNoMain.stdout, /baseSource=MANUAL_BRANCH_WITHOUT_MAIN_FAIL_CLOSED/);
  assert.equal(readReceipt(noMainReceipt).effectiveLane, "L2_SCHEMA_SECURITY");
} finally {
  fs.rmSync(fixturesRoot, { force: true, recursive: true });
}

process.stdout.write("RELEASE_IMPACT_CI_TEST=PASS\n");

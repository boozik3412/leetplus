#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const CLASSIFIER = path.join(SCRIPT_DIRECTORY, "classify-release-impact.mjs");
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const ZERO_SHA = "0".repeat(40);
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

function fail(message) {
  throw new Error(`release impact CI adapter: ${message}`);
}

function parseArguments(argv) {
  let root = DEFAULT_ROOT;
  let headSha = null;
  let eventName = null;
  let ref = null;
  let eventBaseSha = "";
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => argv[++index] ?? fail(`${argument} requires a value`);
    if (argument === "--root") root = path.resolve(takeValue());
    else if (argument === "--head-sha") headSha = takeValue();
    else if (argument === "--event-name") eventName = takeValue();
    else if (argument === "--ref") ref = takeValue();
    else if (argument === "--event-base-sha") eventBaseSha = takeValue();
    else if (argument === "--output") output = path.resolve(takeValue());
    else fail(`unknown argument ${argument}`);
  }
  if (!SHA_PATTERN.test(headSha ?? "")) fail("--head-sha must be an exact lowercase 40-character SHA");
  if (typeof eventName !== "string" || !/^[a-z_]+$/.test(eventName)) fail("--event-name is invalid");
  if (typeof ref !== "string" || ref.length === 0 || ref.length > 512 || /[\u0000-\u001f\u007f]/u.test(ref)) {
    fail("--ref is invalid");
  }
  if (eventBaseSha !== "" && !SHA_PATTERN.test(eventBaseSha)) fail("--event-base-sha is invalid");
  if (output === null) fail("--output is required");
  return { root, headSha, eventName, ref, eventBaseSha, output };
}

function gitEnvironment() {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value === undefined ||
      /^(GIT_|LD_|DYLD_)/i.test(name) ||
      ["BASH_ENV", "ENV", "NODE_OPTIONS", "NODE_PATH"].includes(name)
    ) {
      continue;
    }
    environment[name] = value;
  }
  environment.GIT_CONFIG_NOSYSTEM = "1";
  environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : os.devNull;
  environment.GIT_OPTIONAL_LOCKS = "0";
  environment.LANG = "C";
  environment.LC_ALL = "C";
  return environment;
}

function run(root, executable, argumentsList, label, { acceptedStatuses = [0] } = {}) {
  const result = spawnSync(executable, argumentsList, {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(),
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error) fail(`${label} could not execute: ${result.error.message}`);
  if (result.signal !== null) fail(`${label} was terminated by ${result.signal}`);
  if (!acceptedStatuses.includes(result.status)) {
    fail(`${label} exited ${result.status}${result.stderr.trim() ? `: ${result.stderr.trim().slice(0, 512)}` : ""}`);
  }
  return result;
}

function git(root, argumentsList, label, options) {
  return run(root, "git", ["-c", "core.fsmonitor=false", ...argumentsList], label, options);
}

function exactCommit(root, revision, label, { required = true } = {}) {
  const result = git(root, ["rev-parse", "--verify", `${revision}^{commit}`], label, {
    acceptedStatuses: required ? [0] : [0, 128],
  });
  if (result.status !== 0) return null;
  const sha = result.stdout.trim();
  if (!SHA_PATTERN.test(sha)) fail(`${label} did not resolve to an exact commit SHA`);
  return sha;
}

function isAncestor(root, baseSha, headSha) {
  return git(root, ["merge-base", "--is-ancestor", baseSha, headSha], "base ancestry", {
    acceptedStatuses: [0, 1],
  }).status === 0;
}

function mergeBase(root, leftSha, rightSha, label) {
  const sha = git(root, ["merge-base", leftSha, rightSha], label).stdout.trim();
  if (!SHA_PATTERN.test(sha)) fail(`${label} did not produce an exact SHA`);
  return sha;
}

function conservativeFallback(root, headSha, reason) {
  const parent = exactCommit(root, `${headSha}^`, "fallback parent", { required: false });
  return {
    baseSha: parent ?? headSha,
    minimumLane: "L2_SCHEMA_SECURITY",
    baseSource: reason,
  };
}

function resolveBase(root, options) {
  const { eventName, eventBaseSha, headSha, ref } = options;
  if (eventName === "pull_request") {
    if (eventBaseSha === "" || eventBaseSha === ZERO_SHA) fail("pull_request requires an exact non-zero event base SHA");
    const eventBase = exactCommit(root, eventBaseSha, "pull-request base");
    return {
      baseSha: mergeBase(root, eventBase, headSha, "pull-request merge base"),
      minimumLane: "L0_DOCS",
      baseSource: "PULL_REQUEST_MERGE_BASE",
    };
  }

  if (eventName === "push") {
    if (eventBaseSha !== "" && eventBaseSha !== ZERO_SHA) {
      const eventBase = exactCommit(root, eventBaseSha, "push before", { required: false });
      if (eventBase !== null && isAncestor(root, eventBase, headSha)) {
        return { baseSha: eventBase, minimumLane: "L0_DOCS", baseSource: "PUSH_BEFORE" };
      }
      if (eventBase !== null) {
        return {
          baseSha: mergeBase(root, eventBase, headSha, "forced-push merge base"),
          minimumLane: "L2_SCHEMA_SECURITY",
          baseSource: "FORCED_PUSH_MERGE_BASE_FAIL_CLOSED",
        };
      }
    }
    return conservativeFallback(root, headSha, "PUSH_WITHOUT_TRUSTED_BASE_FAIL_CLOSED");
  }

  if (eventName === "workflow_dispatch" && ref !== "refs/heads/main") {
    const main = exactCommit(root, "refs/remotes/origin/main", "origin/main", { required: false });
    if (main !== null) {
      return {
        baseSha: mergeBase(root, main, headSha, "manual branch merge base"),
        minimumLane: "L0_DOCS",
        baseSource: "MANUAL_BRANCH_MERGE_BASE",
      };
    }
    return conservativeFallback(root, headSha, "MANUAL_BRANCH_WITHOUT_MAIN_FAIL_CLOSED");
  }

  return conservativeFallback(root, headSha, "UNSCOPED_EVENT_FAIL_CLOSED");
}

function invokeClassifier(root, argumentsList, label) {
  const result = run(root, process.execPath, [CLASSIFIER, ...argumentsList], label);
  if (!/RELEASE_IMPACT_CLASSIFICATION=PASS/u.test(result.stdout)) fail(`${label} omitted its PASS marker`);
  return result.stdout.trim();
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const checkedOutHead = exactCommit(options.root, "HEAD", "checked-out HEAD");
  if (checkedOutHead !== options.headSha) fail(`--head-sha must equal checked-out HEAD ${checkedOutHead}`);
  const selection = resolveBase(options.root, options);
  const commonArguments = [
    "--root",
    options.root,
    "--base-sha",
    selection.baseSha,
    "--head-sha",
    options.headSha,
    "--minimum-lane",
    selection.minimumLane,
  ];
  invokeClassifier(options.root, [...commonArguments, "--output", options.output], "classifier write");
  invokeClassifier(options.root, [...commonArguments, "--verify-receipt", options.output], "classifier verification");
  const receipt = JSON.parse(fs.readFileSync(options.output, "utf8"));
  process.stdout.write(
    `RELEASE_IMPACT_CI=PASS baseSource=${selection.baseSource} baseSha=${selection.baseSha} ` +
      `headSha=${options.headSha} effectiveLane=${receipt.effectiveLane} minimumLane=${selection.minimumLane}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

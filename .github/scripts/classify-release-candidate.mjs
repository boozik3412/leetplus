#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIRECTORY, "../..");
const IMPACT_CLASSIFIER = path.join(SCRIPT_DIRECTORY, "classify-release-impact.mjs");
const EXPECTED_REPOSITORY = "boozik3412/leetplus";
const EXPECTED_MAIN_REF = "refs/heads/main";
const EXPECTED_WORKFLOW_PATH = ".github/workflows/ci.yml";
const RECEIPT_TYPE = "LEETPLUS_RELEASE_CANDIDATE_RECEIPT_V1";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ZERO_SHA = "0".repeat(40);
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 32 * 1024 * 1024;

function fail(message) {
  throw new Error(`release candidate classifier: ${message}`);
}

function parseArguments(argv) {
  let root = DEFAULT_ROOT;
  let releaseSha = null;
  let eventName = null;
  let ref = null;
  let eventBeforeSha = "";
  let repository = null;
  let workflowRef = null;
  let workflowSha = null;
  let impactReceipt = null;
  let output = null;
  let verifyReceipt = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => argv[++index] ?? fail(`${argument} requires a value`);
    if (argument === "--root") root = path.resolve(takeValue());
    else if (argument === "--release-sha") releaseSha = takeValue();
    else if (argument === "--event-name") eventName = takeValue();
    else if (argument === "--ref") ref = takeValue();
    else if (argument === "--event-before-sha") eventBeforeSha = takeValue();
    else if (argument === "--repository") repository = takeValue();
    else if (argument === "--workflow-ref") workflowRef = takeValue();
    else if (argument === "--workflow-sha") workflowSha = takeValue();
    else if (argument === "--impact-receipt") impactReceipt = path.resolve(takeValue());
    else if (argument === "--output") output = path.resolve(takeValue());
    else if (argument === "--verify-receipt") verifyReceipt = path.resolve(takeValue());
    else fail(`unknown argument ${argument}`);
  }

  if (!SHA_PATTERN.test(releaseSha ?? "")) fail("--release-sha must be an exact lowercase 40-character SHA");
  if (typeof eventName !== "string" || !/^[a-z_]+$/.test(eventName)) fail("--event-name is invalid");
  if (
    typeof ref !== "string" ||
    ref.length === 0 ||
    ref.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(ref)
  ) {
    fail("--ref is invalid");
  }
  if (eventBeforeSha !== "" && eventBeforeSha !== ZERO_SHA && !SHA_PATTERN.test(eventBeforeSha)) {
    fail("--event-before-sha is invalid");
  }
  if (repository !== EXPECTED_REPOSITORY) fail(`--repository must be exactly ${EXPECTED_REPOSITORY}`);
  if (
    typeof workflowRef !== "string" ||
    !workflowRef.startsWith(`${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@refs/`) ||
    workflowRef.length > 768 ||
    /[\u0000-\u001f\u007f]/u.test(workflowRef)
  ) {
    fail("--workflow-ref is invalid");
  }
  if (!SHA_PATTERN.test(workflowSha ?? "")) fail("--workflow-sha must be an exact lowercase 40-character SHA");
  if (impactReceipt === null) fail("--impact-receipt is required");
  if (output !== null && verifyReceipt !== null) fail("--output and --verify-receipt are mutually exclusive");
  if (output === null && verifyReceipt === null) fail("one of --output or --verify-receipt is required");
  return {
    root,
    releaseSha,
    eventName,
    ref,
    eventBeforeSha,
    repository,
    workflowRef,
    workflowSha,
    impactReceipt,
    output,
    verifyReceipt,
  };
}

function gitEnvironment() {
  const environment = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      value === undefined ||
      /^(GIT_|LD_|DYLD_)/iu.test(name) ||
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
    maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
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

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveRepository(root, releaseSha) {
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch (error) {
    fail(`repository root cannot be resolved: ${error.message}`);
  }
  const reportedRoot = git(realRoot, ["rev-parse", "--show-toplevel"], "repository root").stdout.trim();
  const realReportedRoot = fs.realpathSync(reportedRoot);
  const rootIdentity = fs.statSync(realRoot);
  const reportedIdentity = fs.statSync(realReportedRoot);
  const sameIdentity =
    rootIdentity.ino !== 0 &&
    reportedIdentity.ino !== 0 &&
    rootIdentity.dev === reportedIdentity.dev &&
    rootIdentity.ino === reportedIdentity.ino;
  if (comparablePath(realRoot) !== comparablePath(realReportedRoot) && !sameIdentity) {
    fail("--root must be the Git repository root");
  }
  const checkedOutHead = git(realRoot, ["rev-parse", "HEAD"], "checked-out HEAD").stdout.trim();
  if (checkedOutHead !== releaseSha) fail(`--release-sha must equal checked-out HEAD ${checkedOutHead}`);
  const resolvedHead = git(realRoot, ["rev-parse", "--verify", `${releaseSha}^{commit}`], "release commit").stdout.trim();
  if (resolvedHead !== releaseSha) fail("release SHA does not resolve exactly");
  return realRoot;
}

function readCanonicalJson(filePath, label) {
  let metadata;
  try {
    metadata = fs.lstatSync(filePath);
  } catch (error) {
    fail(`${label} cannot be inspected: ${error.message}`);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    fail(`${label} must be a one-link regular file`);
  }
  if (metadata.size === 0 || metadata.size > MAX_JSON_BYTES) fail(`${label} size is outside the accepted bound`);
  const raw = fs.readFileSync(filePath, "utf8");
  if (raw.includes("\r")) fail(`${label} must use LF line endings`);
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  if (raw !== `${JSON.stringify(value, null, 2)}\n`) {
    fail(`${label} must be canonical two-space JSON with one trailing newline`);
  }
  return { raw, value };
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys are not exact`);
  }
}

function verifyImpactReceipt(root, impactReceipt, releaseSha) {
  const { raw, value } = readCanonicalJson(impactReceipt, "impact receipt");
  exactKeys(
    value,
    [
      "schemaVersion",
      "receiptType",
      "classifierId",
      "rulesSha256",
      "baseSha",
      "headSha",
      "changedFileCount",
      "sourceLaneSet",
      "mixedSourceLanes",
      "inferredLane",
      "minimumLane",
      "effectiveLane",
      "runtimeArtifactEligible",
      "requiredGates",
      "files",
    ],
    "impact receipt",
  );
  if (
    value.schemaVersion !== 1 ||
    value.receiptType !== "LEETPLUS_RELEASE_IMPACT_RECEIPT_V1" ||
    value.classifierId !== "LEETPLUS_RELEASE_IMPACT_V1" ||
    !SHA256_PATTERN.test(value.rulesSha256 ?? "") ||
    !SHA_PATTERN.test(value.baseSha ?? "") ||
    value.headSha !== releaseSha ||
    !["L0_DOCS", "L1_RUNTIME", "L2_SCHEMA_SECURITY"].includes(value.effectiveLane) ||
    typeof value.runtimeArtifactEligible !== "boolean"
  ) {
    fail("impact receipt identity is invalid");
  }
  if (value.runtimeArtifactEligible !== (value.effectiveLane !== "L0_DOCS")) {
    fail("impact receipt artifact eligibility disagrees with its lane");
  }
  const verification = run(
    root,
    process.execPath,
    [
      IMPACT_CLASSIFIER,
      "--root",
      root,
      "--base-sha",
      value.baseSha,
      "--head-sha",
      releaseSha,
      "--minimum-lane",
      value.minimumLane,
      "--verify-receipt",
      impactReceipt,
    ],
    "impact receipt re-verification",
  );
  if (!verification.stdout.includes("RELEASE_IMPACT_CLASSIFICATION=PASS")) {
    fail("impact receipt re-verification omitted its PASS marker");
  }
  return {
    raw,
    baseSha: value.baseSha,
    effectiveLane: value.effectiveLane,
    runtimeArtifactEligible: value.runtimeArtifactEligible,
  };
}

function resolveDecision(root, options, impact) {
  if (options.workflowSha !== options.releaseSha) {
    fail("workflow SHA must equal the exact release SHA");
  }
  if (options.eventName === "push") {
    if (options.ref !== EXPECTED_MAIN_REF) fail("push admission is allowed only for refs/heads/main");
    const expectedWorkflowRef = `${EXPECTED_REPOSITORY}/${EXPECTED_WORKFLOW_PATH}@${EXPECTED_MAIN_REF}`;
    if (options.workflowRef !== expectedWorkflowRef) fail("main push must execute the exact main workflow ref");
    if (!SHA_PATTERN.test(options.eventBeforeSha) || options.eventBeforeSha === ZERO_SHA) {
      fail("main push requires an exact non-zero before SHA");
    }
    const resolvedBefore = git(
      root,
      ["rev-parse", "--verify", `${options.eventBeforeSha}^{commit}`],
      "push before commit",
    ).stdout.trim();
    if (resolvedBefore !== options.eventBeforeSha) fail("push before SHA does not resolve exactly");
    const ancestry = git(
      root,
      ["merge-base", "--is-ancestor", options.eventBeforeSha, options.releaseSha],
      "push ancestry",
      { acceptedStatuses: [0, 1] },
    );
    if (ancestry.status !== 0) fail("push before SHA must be an ancestor of the release SHA");
    if (impact.baseSha !== options.eventBeforeSha) fail("impact receipt base must equal the exact push before SHA");
    if (!impact.runtimeArtifactEligible) {
      return { deployableCandidate: false, decision: "DOCS_ONLY_MAIN_PUSH_NON_DEPLOYABLE" };
    }
    return { deployableCandidate: true, decision: "EXACT_MAIN_PUSH_DEPLOYABLE_CANDIDATE" };
  }

  if (options.eventName === "workflow_dispatch") {
    return { deployableCandidate: false, decision: "MANUAL_VALIDATION_NON_DEPLOYABLE" };
  }
  if (options.eventName === "schedule") {
    return { deployableCandidate: false, decision: "SCHEDULED_VALIDATION_NON_DEPLOYABLE" };
  }
  fail(`event ${options.eventName} is not admitted by the release-candidate contract`);
}

function buildReceipt(root, options, impact) {
  const treeSha = git(root, ["rev-parse", `${options.releaseSha}^{tree}`], "release tree").stdout.trim();
  if (!SHA_PATTERN.test(treeSha)) fail("release tree did not resolve to an exact SHA");
  const decision = resolveDecision(root, options, impact);
  return {
    schemaVersion: 1,
    receiptType: RECEIPT_TYPE,
    releaseSha: options.releaseSha,
    releaseTreeSha: treeSha,
    impactReceiptSha256: crypto.createHash("sha256").update(impact.raw, "utf8").digest("hex"),
    effectiveLane: impact.effectiveLane,
    runtimeArtifactEligible: impact.runtimeArtifactEligible,
    eventName: options.eventName,
    ref: options.ref,
    eventBeforeSha: options.eventBeforeSha,
    repository: options.repository,
    workflowRef: options.workflowRef,
    workflowSha: options.workflowSha,
    deployableCandidate: decision.deployableCandidate,
    decision: decision.decision,
  };
}

function writeExclusiveAtomic(filePath, raw) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) fail("output parent directory is absent");
  if (fs.existsSync(filePath)) fail("output receipt already exists");
  const temporary = path.join(
    parent,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, raw, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporary, filePath);
    fs.rmSync(temporary);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.rmSync(temporary, { force: true });
    } catch {}
    fail(`receipt cannot be written atomically: ${error.message}`);
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolveRepository(options.root, options.releaseSha);
  const impact = verifyImpactReceipt(root, options.impactReceipt, options.releaseSha);
  const receipt = buildReceipt(root, options, impact);
  const rawReceipt = `${JSON.stringify(receipt, null, 2)}\n`;

  if (options.output !== null) {
    writeExclusiveAtomic(options.output, rawReceipt);
  } else {
    const existing = readCanonicalJson(options.verifyReceipt, "release candidate receipt").raw;
    if (existing !== rawReceipt) fail("release candidate receipt does not match the exact event/SHA/impact authority");
  }
  process.stdout.write(
    `RELEASE_CANDIDATE_CLASSIFICATION=PASS releaseSha=${options.releaseSha} ` +
      `effectiveLane=${impact.effectiveLane} deployableCandidate=${receipt.deployableCandidate} ` +
      `decision=${receipt.decision}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

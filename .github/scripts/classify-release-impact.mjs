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
const DEFAULT_RULES = path.join(DEFAULT_ROOT, "docs/deployment/release-impact-classifier.json");
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RECEIPT_TYPE = "LEETPLUS_RELEASE_IMPACT_RECEIPT_V1";
const EXPECTED_LANES = ["L0_DOCS", "L1_RUNTIME", "L2_SCHEMA_SECURITY"];
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
const MAX_CHANGED_FILES = 20_000;
const MAX_GIT_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;

function fail(message) {
  throw new Error(`release impact classifier: ${message}`);
}

function parseArguments(argv) {
  let root = DEFAULT_ROOT;
  let rules = DEFAULT_RULES;
  let baseSha = null;
  let headSha = null;
  let minimumLane = "L0_DOCS";
  let output = null;
  let verifyReceipt = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => argv[++index] ?? fail(`${argument} requires a value`);
    if (argument === "--root") root = path.resolve(takeValue());
    else if (argument === "--rules") rules = path.resolve(takeValue());
    else if (argument === "--base-sha") baseSha = takeValue();
    else if (argument === "--head-sha") headSha = takeValue();
    else if (argument === "--minimum-lane") minimumLane = takeValue();
    else if (argument === "--output") output = path.resolve(takeValue());
    else if (argument === "--verify-receipt") verifyReceipt = path.resolve(takeValue());
    else fail(`unknown argument ${argument}`);
  }

  if (!SHA_PATTERN.test(baseSha ?? "")) fail("--base-sha must be an exact lowercase 40-character SHA");
  if (!SHA_PATTERN.test(headSha ?? "")) fail("--head-sha must be an exact lowercase 40-character SHA");
  if (output !== null && verifyReceipt !== null) fail("--output and --verify-receipt are mutually exclusive");
  if (output === null && verifyReceipt === null) fail("one of --output or --verify-receipt is required");
  return { root, rules, baseSha, headSha, minimumLane, output, verifyReceipt };
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys must be exactly ${wanted.join(", ")}`);
  }
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(`${label} must be exactly ${JSON.stringify(expected)}`);
  }
}

function stringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) fail(`${label} must be an array`);
  if (value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    fail(`${label} must contain non-empty strings`);
  }
  if (new Set(value).size !== value.length) fail(`${label} contains duplicates`);
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
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`${label} cannot be read: ${error.message}`);
  }
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

function matchRule(filePath, rule) {
  const basename = path.posix.basename(filePath);
  const { exactPaths, prefixes, suffixes, basenames } = rule.match;
  return (
    exactPaths.includes(filePath) ||
    prefixes.some((prefix) => filePath.startsWith(prefix)) ||
    suffixes.some((suffix) => filePath.endsWith(suffix)) ||
    basenames.includes(basename)
  );
}

function isCanonicalRepositoryPath(filePath) {
  if (
    filePath.length === 0 ||
    filePath.length > 4096 ||
    filePath.startsWith("/") ||
    filePath.endsWith("/") ||
    filePath.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(filePath)
  ) {
    return false;
  }
  const segments = filePath.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function classifyPath(filePath, rules) {
  if (!isCanonicalRepositoryPath(filePath)) {
    return {
      id: "NON_CANONICAL_PATH",
      lane: "L2_SCHEMA_SECURITY",
      reason: "Non-canonical repository paths fail closed to the schema/security lane",
    };
  }
  const matched = rules.rules.find((rule) => matchRule(filePath, rule));
  return matched ?? rules.defaultRule;
}

function validateMatchBoundary(match, label) {
  for (const exactPath of match.exactPaths) {
    if (!isCanonicalRepositoryPath(exactPath)) fail(`${label}.exactPaths contains a non-canonical path`);
  }
  for (const prefix of match.prefixes) {
    const canonicalCandidate = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    if (!isCanonicalRepositoryPath(canonicalCandidate)) {
      fail(`${label}.prefixes contains a non-canonical path prefix`);
    }
  }
  for (const suffix of match.suffixes) {
    if (!suffix.startsWith(".") || suffix.includes("/") || suffix.includes("\\") || /[\u0000-\u001f\u007f]/u.test(suffix)) {
      fail(`${label}.suffixes contains an invalid suffix`);
    }
  }
  for (const basename of match.basenames) {
    if (
      basename !== path.posix.basename(basename) ||
      basename === "." ||
      basename === ".." ||
      /[\\\u0000-\u001f\u007f]/u.test(basename)
    ) {
      fail(`${label}.basenames contains an invalid basename`);
    }
  }
}

function validateRules(rules) {
  exactKeys(
    rules,
    ["schemaVersion", "classifierId", "laneOrder", "lanes", "mixedLane", "defaultRule", "rules"],
    "rules",
  );
  if (rules.schemaVersion !== 1) fail("rules.schemaVersion must be 1");
  if (rules.classifierId !== "LEETPLUS_RELEASE_IMPACT_V1") fail("rules.classifierId is invalid");
  exactArray(rules.laneOrder, EXPECTED_LANES, "rules.laneOrder");
  exactKeys(rules.lanes, EXPECTED_LANES, "rules.lanes");
  for (const [rank, laneName] of EXPECTED_LANES.entries()) {
    const lane = rules.lanes[laneName];
    exactKeys(lane, ["rank", "runtimeArtifactEligible", "requiredGates"], `rules.lanes.${laneName}`);
    if (lane.rank !== rank) fail(`rules.lanes.${laneName}.rank must be ${rank}`);
    if (lane.runtimeArtifactEligible !== (rank > 0)) {
      fail(`rules.lanes.${laneName}.runtimeArtifactEligible is invalid`);
    }
    stringArray(lane.requiredGates, `rules.lanes.${laneName}.requiredGates`, { allowEmpty: false });
    exactArray(lane.requiredGates, EXPECTED_GATES[laneName], `rules.lanes.${laneName}.requiredGates`);
  }
  if (rules.mixedLane !== "L2_SCHEMA_SECURITY") fail("rules.mixedLane must fail closed to L2_SCHEMA_SECURITY");
  exactKeys(rules.defaultRule, ["id", "lane", "reason"], "rules.defaultRule");
  if (rules.defaultRule.id !== "UNKNOWN_OR_UNCLASSIFIED") {
    fail("rules.defaultRule.id must be UNKNOWN_OR_UNCLASSIFIED");
  }
  if (rules.defaultRule.lane !== "L2_SCHEMA_SECURITY") fail("rules.defaultRule must fail closed to L2_SCHEMA_SECURITY");
  if (typeof rules.defaultRule.reason !== "string" || rules.defaultRule.reason.length === 0 || rules.defaultRule.reason.length > 240) {
    fail("rules.defaultRule.reason is invalid");
  }
  if (!Array.isArray(rules.rules) || rules.rules.length === 0 || rules.rules.length > 100) {
    fail("rules.rules must contain between 1 and 100 entries");
  }
  const ruleIds = new Set();
  for (const [index, rule] of rules.rules.entries()) {
    exactKeys(rule, ["id", "lane", "reason", "match"], `rules.rules[${index}]`);
    if (typeof rule.id !== "string" || !/^[A-Z0-9_]+$/.test(rule.id) || ruleIds.has(rule.id)) {
      fail(`rules.rules[${index}].id is invalid or duplicated`);
    }
    ruleIds.add(rule.id);
    if (!EXPECTED_LANES.includes(rule.lane)) fail(`rules.rules[${index}].lane is invalid`);
    if (typeof rule.reason !== "string" || rule.reason.length === 0 || rule.reason.length > 240) {
      fail(`rules.rules[${index}].reason is invalid`);
    }
    exactKeys(rule.match, ["exactPaths", "prefixes", "suffixes", "basenames"], `rules.rules[${index}].match`);
    for (const key of ["exactPaths", "prefixes", "suffixes", "basenames"]) {
      stringArray(rule.match[key], `rules.rules[${index}].match.${key}`);
    }
    validateMatchBoundary(rule.match, `rules.rules[${index}].match`);
    if (Object.values(rule.match).every((entries) => entries.length === 0)) {
      fail(`rules.rules[${index}] has no match boundary`);
    }
  }
  exactArray(
    rules.rules.map((rule) => rule.id),
    [
      "DOCUMENTATION_ONLY",
      "SCHEMA_SECURITY_AUTHORITY",
      "API_SECURITY_CONTOUR",
      "WEB_SECURITY_CONTOUR",
      "ORDINARY_RUNTIME",
    ],
    "rules.rules ids/order",
  );
  exactArray(
    rules.rules.map((rule) => rule.lane),
    ["L0_DOCS", "L2_SCHEMA_SECURITY", "L2_SCHEMA_SECURITY", "L2_SCHEMA_SECURITY", "L1_RUNTIME"],
    "rules.rules lane order",
  );
  exactArray(rules.rules[0].match.exactPaths, [], "DOCUMENTATION_ONLY.exactPaths");
  exactArray(rules.rules[0].match.prefixes, [], "DOCUMENTATION_ONLY.prefixes");
  exactArray(rules.rules[0].match.suffixes, [".md"], "DOCUMENTATION_ONLY.suffixes");
  exactArray(rules.rules[0].match.basenames, [], "DOCUMENTATION_ONLY.basenames");

  const mandatoryProbes = new Map([
    ["README.md", "L0_DOCS"],
    ["docs/deployment/example.md", "L0_DOCS"],
    [".github/workflows/example.yml", "L2_SCHEMA_SECURITY"],
    ["docs/deployment/example.sh", "L2_SCHEMA_SECURITY"],
    ["packages/database/prisma/schema.prisma", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/auth/example.ts", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/main.ts", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/tenancy/example.ts", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/guest-portal/example.ts", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/guests/example.ts", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/identity-mail-worker/example.ts", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/app/(auth)/login/page.tsx", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/app/api/example/route.ts", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/app/play/page.tsx", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/lib/guest-session-transport.ts", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/lib/landing.ts", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/proxy.ts", "L2_SCHEMA_SECURITY"],
    ["apps/api/src/categories/example.ts", "L1_RUNTIME"],
    ["apps/web/src/components/example.tsx", "L1_RUNTIME"],
    ["apps/api/src/new-security-surface/example.ts", "L2_SCHEMA_SECURITY"],
    ["apps/web/src/lib/new-security-helper.ts", "L2_SCHEMA_SECURITY"],
    ["unexpected/file.bin", "L2_SCHEMA_SECURITY"],
  ]);
  for (const [probePath, expectedLane] of mandatoryProbes) {
    const actualLane = classifyPath(probePath, rules).lane;
    if (actualLane !== expectedLane) {
      fail(`mandatory probe ${probePath} must classify as ${expectedLane}, observed ${actualLane}`);
    }
  }
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

function runGit(root, args, label, { acceptedStatuses = [0], encoding = "utf8" } = {}) {
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd: root,
    encoding,
    env: gitEnvironment(),
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error) fail(`${label} could not execute: ${result.error.message}`);
  if (result.signal !== null) fail(`${label} was terminated by ${result.signal}`);
  if (!acceptedStatuses.includes(result.status)) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : (result.stderr ?? "");
    fail(`${label} exited ${result.status}${stderr.trim() ? `: ${stderr.trim().slice(0, 512)}` : ""}`);
  }
  return result;
}

function resolveRepository(root, baseSha, headSha) {
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch (error) {
    fail(`repository root cannot be resolved: ${error.message}`);
  }
  const reportedRoot = runGit(realRoot, ["rev-parse", "--show-toplevel"], "repository root").stdout.trim();
  let realReportedRoot;
  try {
    realReportedRoot = fs.realpathSync(reportedRoot);
  } catch (error) {
    fail(`reported repository root cannot be resolved: ${error.message}`);
  }
  const comparablePath = (value) => {
    const normalized = path.normalize(value);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  const rootIdentity = fs.statSync(realRoot);
  const reportedRootIdentity = fs.statSync(realReportedRoot);
  const sameDirectoryIdentity =
    rootIdentity.ino !== 0 &&
    reportedRootIdentity.ino !== 0 &&
    rootIdentity.dev === reportedRootIdentity.dev &&
    rootIdentity.ino === reportedRootIdentity.ino;
  if (comparablePath(realReportedRoot) !== comparablePath(realRoot) && !sameDirectoryIdentity) {
    fail("--root must be the Git repository root");
  }
  const checkedOutHead = runGit(realRoot, ["rev-parse", "HEAD"], "checked-out HEAD").stdout.trim();
  if (checkedOutHead !== headSha) fail(`--head-sha must equal checked-out HEAD ${checkedOutHead}`);
  for (const [label, sha] of [["base", baseSha], ["head", headSha]]) {
    const resolved = runGit(realRoot, ["rev-parse", "--verify", `${sha}^{commit}`], `${label} commit`).stdout.trim();
    if (resolved !== sha) fail(`${label} SHA does not resolve exactly`);
  }
  const ancestor = runGit(realRoot, ["merge-base", "--is-ancestor", baseSha, headSha], "base ancestry", {
    acceptedStatuses: [0, 1],
  });
  if (ancestor.status !== 0) fail("base SHA must be an ancestor of head SHA");
  return realRoot;
}

function readChangedFiles(root, baseSha, headSha) {
  const result = runGit(
    root,
    [
      "--no-pager",
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--name-status",
      "-z",
      baseSha,
      headSha,
      "--",
    ],
    "commit diff",
    { encoding: null },
  );
  const raw = result.stdout;
  if (!Buffer.isBuffer(raw)) fail("commit diff did not return bytes");
  if (raw.length === 0) return [];
  if (raw[raw.length - 1] !== 0) fail("commit diff is not NUL terminated");
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch (error) {
    fail(`commit diff contains a non-UTF-8 path: ${error.message}`);
  }
  const tokens = decoded.slice(0, -1).split("\0");
  if (tokens.length % 2 !== 0) fail("commit diff token count is invalid");
  const changedFiles = [];
  const seenPaths = new Set();
  for (let index = 0; index < tokens.length; index += 2) {
    const status = tokens[index];
    const filePath = tokens[index + 1];
    if (!/^[ADMT]$/.test(status)) fail(`unsupported Git change status ${JSON.stringify(status)}`);
    if (seenPaths.has(filePath)) fail(`commit diff contains duplicate path ${JSON.stringify(filePath)}`);
    seenPaths.add(filePath);
    changedFiles.push({ status, path: filePath });
  }
  if (changedFiles.length > MAX_CHANGED_FILES) fail("commit diff exceeds the changed-file bound");
  changedFiles.sort((left, right) => {
    if (left.path !== right.path) return left.path < right.path ? -1 : 1;
    if (left.status === right.status) return 0;
    return left.status < right.status ? -1 : 1;
  });
  return changedFiles;
}

function buildReceipt({ rules, rulesDigest, baseSha, headSha, minimumLane, changedFiles }) {
  if (!EXPECTED_LANES.includes(minimumLane)) fail(`--minimum-lane must be one of ${EXPECTED_LANES.join(", ")}`);
  const laneRank = new Map(EXPECTED_LANES.map((lane, rank) => [lane, rank]));
  const files = changedFiles.map(({ status, path: filePath }) => {
    const classification = classifyPath(filePath, rules);
    return {
      path: filePath,
      status,
      ruleId: classification.id,
      lane: classification.lane,
      reason: classification.reason,
    };
  });
  const sourceLaneSet = [...new Set(files.map((file) => file.lane))]
    .sort((left, right) => laneRank.get(left) - laneRank.get(right));
  const mixedSourceLanes = sourceLaneSet.length > 1;
  const inferredLane =
    files.length === 0
      ? "L0_DOCS"
      : mixedSourceLanes
        ? rules.mixedLane
        : sourceLaneSet[0];
  const effectiveLane =
    laneRank.get(minimumLane) > laneRank.get(inferredLane) ? minimumLane : inferredLane;
  const lane = rules.lanes[effectiveLane];
  return {
    schemaVersion: 1,
    receiptType: RECEIPT_TYPE,
    classifierId: rules.classifierId,
    rulesSha256: rulesDigest,
    baseSha,
    headSha,
    changedFileCount: files.length,
    sourceLaneSet,
    mixedSourceLanes,
    inferredLane,
    minimumLane,
    effectiveLane,
    runtimeArtifactEligible: lane.runtimeArtifactEligible,
    requiredGates: lane.requiredGates,
    files,
  };
}

function writeExclusiveAtomic(filePath, raw) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) fail("output parent directory is absent");
  if (fs.existsSync(filePath)) fail("output receipt already exists");
  const temporary = path.join(parent, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`);
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
  const { raw: rawRules, value: rules } = readCanonicalJson(options.rules, "rules manifest");
  validateRules(rules);
  const root = resolveRepository(options.root, options.baseSha, options.headSha);
  const changedFiles = readChangedFiles(root, options.baseSha, options.headSha);
  const rulesDigest = crypto.createHash("sha256").update(rawRules, "utf8").digest("hex");
  const receipt = buildReceipt({
    rules,
    rulesDigest,
    baseSha: options.baseSha,
    headSha: options.headSha,
    minimumLane: options.minimumLane,
    changedFiles,
  });
  const rawReceipt = `${JSON.stringify(receipt, null, 2)}\n`;

  if (options.output !== null) {
    writeExclusiveAtomic(options.output, rawReceipt);
  } else {
    const existing = readCanonicalJson(options.verifyReceipt, "impact receipt").raw;
    if (existing !== rawReceipt) fail("impact receipt does not match the exact base/head/rules classification");
  }
  process.stdout.write(
    `RELEASE_IMPACT_CLASSIFICATION=PASS classifierId=${rules.classifierId} baseSha=${options.baseSha} ` +
      `headSha=${options.headSha} effectiveLane=${receipt.effectiveLane} changedFiles=${receipt.changedFileCount} ` +
      `rulesSha256=${rulesDigest}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

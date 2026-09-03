#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  constants as fsConstants,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
  fchmodSync,
  fchownSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const CONTRACT_VERSION = "LEETPLUS_RESUMABLE_RELEASE_ORCHESTRATOR_V3";
export const PLAN_DECISION = "PREPARED_NOT_EFFECT_AUTHORIZATION";
export const APPROVAL_DECISION = "EXACT_PLAN_DIGEST_APPLY_AUTHORIZED";
export const COMPLETE_DECISION = "ROLLOUT_PHASES_COMPLETED";
export const PHASES = Object.freeze([
  "HYDRATE",
  "BIND",
  "SMOKE",
  "CUTOVER",
  "POSTCHECK",
]);

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const METRIC_ATTEMPT_FILE = new RegExp(
  "^" + UUID.source.slice(1, -1) + "\\.json$",
  "u",
);
const METRIC_ARCHIVE_MANIFEST_FILE = /^([0-9a-f]{64})\.manifest\.json$/u;
const METRIC_ARCHIVE_SEGMENT_FILE =
  /^([0-9a-f]{64})\.([0-9]{4})\.segment\.json$/u;
const METRIC_ARCHIVE_RECEIPT_FILE = /^([0-9a-f]{64})\.receipt\.json$/u;
const MIGRATION = /^[0-9]{14}_[a-z0-9_]+$/u;
const INVOCATION_ID = /^[0-9a-f]{32}$/u;
const SAFE_RECORD_VALUE = /^[^\0\r\n]{0,8192}$/u;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_OPERATION_ENTRIES = 4096;
const MAX_METRIC_ATTEMPT_ENTRIES = 16384;
const MAX_METRIC_ARCHIVE_FILES = 4096;
const MAX_METRIC_ARCHIVE_BYTES = 128 * 1024 * 1024;
const MAX_METRIC_ARCHIVED_ATTEMPTS = 131072;
const MAX_METRIC_RETENTION_PLAN_ENTRIES = 8192;
const METRIC_ARCHIVE_SEGMENT_ENTRIES = 512;
const METRIC_SAMPLE_MINIMUM = 20;
const MAX_SLOT_ENVIRONMENT_BYTES = 16 * 1024;
const CACHE_PREPARATION_ATTEMPTS = 3;
const CACHE_PREPARATION_RETRY_DELAY_MS = 1000;
const LOOPBACK_READINESS_ATTEMPTS = 12;
const LOOPBACK_READINESS_RETRY_DELAY_MS = 2000;
const CANONICAL_API_BIND_HOST = "127.0.0.1";
const LEGACY_API_BIND_HOST = "localhost";
const TRUSTED_LANES = Object.freeze(["L1_RUNTIME", "L2_SCHEMA_SECURITY"]);
const CONTROL_LANE_LINE =
  /^PRODUCTION_CONTROL_EFFECTIVE_LANE=(L1_RUNTIME|L2_SCHEMA_SECURITY)$/u;
const CONTROL_IMPACT_LINE =
  /^PRODUCTION_CONTROL_IMPACT_RECEIPT_SHA256=([0-9a-f]{64})$/u;
const LEGACY_UNCLASSIFIED_LANE = "LEGACY_UNCLASSIFIED";
const METRIC_FAILURE_PHASES = Object.freeze(["PRECHECK", ...PHASES]);
const METRIC_RETENTION_PLAN_DECISION =
  "METRIC_RETENTION_PREPARED_NOT_EFFECT_AUTHORIZATION";
const METRIC_RETENTION_NOOP_DECISION = "METRIC_RETENTION_NOT_REQUIRED";
const METRIC_RETENTION_APPLIED_DECISION = "METRIC_RETENTION_APPLIED";
const V2_CONTRACT_VERSION = "LEETPLUS_RESUMABLE_RELEASE_ORCHESTRATOR_V2";
const PRODUCTION_ENGINE =
  "/usr/local/libexec/leetplus/resumable-release-orchestrator.mjs";
const PRODUCTION_BOOTSTRAP = "LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP_V1";
const PRODUCTION_CONTROL_INSTALL_LOCK =
  "/run/leetplus-production-control/install.lock";
const PRODUCTION_CONTROL_INSTALL_LOCK_FD = 8;
const SAFE_ENV = Object.freeze({
  PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  TZ: "UTC",
});
const CUTOVER_RECEIPT_KEYS = Object.freeze([
  "ACCEPTED_AT",
  "ACTIVATED_SHA256",
  "ACTIVATED_TARGET",
  "GENERATION",
  "INTENT_RECORDED_AT",
  "PREVIOUS_API_UNIT",
  "PREVIOUS_API_URL",
  "PREVIOUS_MIGRATION",
  "PREVIOUS_MIGRATION_COUNT",
  "PREVIOUS_RELEASE_SHA",
  "PREVIOUS_RUNTIME_KIND",
  "PREVIOUS_SHA256",
  "PREVIOUS_SLOT",
  "PREVIOUS_TARGET",
  "PREVIOUS_WEB_BUILD_ID",
  "PREVIOUS_WEB_UNIT",
  "PREVIOUS_WEB_URL",
  "RECORD_VERSION",
  "RELEASE_SHA",
  "SLOT",
]);
const HYDRATION_RECEIPT_KEYS = Object.freeze([
  "HYDRATED_MANIFEST_SHA256",
  "HYDRATION_INVOCATION_ID",
  "HYDRATION_POLICY_SHA256",
  "HYDRATION_SOURCE_RECEIPT_SHA256",
  "HYDRATION_STAGER_SHA256",
  "HYDRATION_UNIT_SHA256",
  "PUBLICATION_AUTHORIZED",
  "RECORD_VERSION",
  "RELEASE_DIRECTORY",
  "RELEASE_SHA",
  "RELEASE_SLOT",
  "RUNTIME_SWITCHED",
]);
const SLOT_BIND_RECEIPT_KEYS = Object.freeze([
  "ACCEPTED_AT",
  "ACTIVE_SLOT_SAFE_MODE",
  "CREATED_AT",
  "EFFECT_STATE",
  "INTENT_SHA256",
  "OPERATION",
  "OPERATION_ID",
  "PRIOR_HYDRATED_SHA256SUMS_SHA256",
  "PRIOR_HYDRATION_ATTESTATION_SHA256",
  "PRIOR_PROVENANCE_SHA256",
  "PRIOR_RELEASE_SHA",
  "PRIOR_SHA256SUMS_SHA256",
  "PRIOR_STATE",
  "PRIOR_SYMLINK_MANIFEST_SHA256",
  "PRIOR_TARGET",
  "RECORD_KIND",
  "RECORD_VERSION",
  "REQUESTED_HYDRATED_SHA256SUMS_SHA256",
  "REQUESTED_HYDRATION_ATTESTATION_SHA256",
  "REQUESTED_PROVENANCE_SHA256",
  "REQUESTED_RELEASE_SHA",
  "REQUESTED_SHA256SUMS_SHA256",
  "REQUESTED_SYMLINK_MANIFEST_SHA256",
  "REQUESTED_TARGET",
  "SLOT",
  "SOURCE_RECEIPT_SHA256",
]);
const SLOT_ENVIRONMENT_KEYS = Object.freeze([
  "RELEASE_SHA",
  "WEB_BUILD_ID",
  "EXPECTED_DATABASE_MIGRATION",
  "EXPECTED_DATABASE_MIGRATION_COUNT",
  "BUILD_TIME",
  "GUEST_BUG_REPORTING_MODE",
  "GUEST_SUPPORT_SCHEMA_BRIDGE_MODE",
  "API_BIND_HOST",
  "PORT",
  "WEB_PORT",
  "API_URL",
]);

export class ReleaseOrchestratorError extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.name = "ReleaseOrchestratorError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new ReleaseOrchestratorError(reasonCode);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function canonicalJsonByteLength(value) {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}

function compareCanonicalText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalRecordSha256(value) {
  return sha256(canonicalJson(value));
}

function exactKeys(value, expected, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0")
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactString(value, pattern, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !pattern.test(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function exactInteger(value, minimum, maximum, reasonCode) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(reasonCode);
  }
  return value;
}

function exactIso(value, reasonCode) {
  if (typeof value !== "string") fail(reasonCode);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(reasonCode);
  }
  return value;
}

function nowIso(now = () => new Date()) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) {
    fail("ORCHESTRATOR_CLOCK_INVALID");
  }
  return value.toISOString();
}

function usage() {
  return [
    "Usage:",
    "  leetplus-resumable-release-orchestrator prepare \\",
    "    --operation-id <uuid-v4> --release-sha <sha> --slot blue|green \\",
    "    --expected-migration <name> --expected-migration-count <count> \\",
    "    --previous-release-sha <sha> --previous-migration <name> \\",
    "    --previous-migration-count <count> --previous-web-build-id <sha> \\",
    "    [--watchdog-seconds 30]",
    "",
    "  leetplus-resumable-release-orchestrator apply|resume|status \\",
    "    --operation-id <uuid-v4> --plan-sha256 <sha256>",
    "",
    "  leetplus-resumable-release-orchestrator metrics",
    "",
    "  leetplus-resumable-release-orchestrator metrics-retention-plan \\",
    "    --retain-attempt-count <count>",
    "",
    "  leetplus-resumable-release-orchestrator metrics-retention-apply \\",
    "    --retain-attempt-count <count> --plan-sha256 <sha256>",
    "",
    "prepare is read-only apart from a protected nonauthorizing plan. apply is",
    "the explicit effect boundary. resume may continue only that exact approved",
    "plan and validates every terminal phase receipt before proceeding.",
    "metrics is read-only: it reads only canonical root-owned operation and",
    "attempt records; it never contacts runtime services, databases or timers.",
    "metrics-retention-plan is also read-only. metrics-retention-apply is the",
    "explicit root-only archive/delete boundary for one exact plan digest.",
  ].join("\n");
}

function parseArguments(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    return { help: true };
  }
  let mode;
  let testMode = false;
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--unprivileged-test-mode") {
      if (testMode) fail("ORCHESTRATOR_ARGUMENTS_INVALID");
      testMode = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      if (mode !== undefined) fail("ORCHESTRATOR_ARGUMENTS_INVALID");
      mode = argument;
      continue;
    }
    if (values.has(argument)) fail("ORCHESTRATOR_ARGUMENTS_INVALID");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("ORCHESTRATOR_ARGUMENTS_INVALID");
    }
    values.set(argument, value);
    index += 1;
  }
  if (
    ![
      "prepare",
      "apply",
      "resume",
      "status",
      "metrics",
      "metrics-retention-plan",
      "metrics-retention-apply",
    ].includes(mode)
  ) {
    fail("ORCHESTRATOR_ARGUMENTS_INVALID");
  }
  const fixtureRoot = values.get("--fixture-root");
  values.delete("--fixture-root");
  if (testMode) {
    if (!fixtureRoot || !path.isAbsolute(fixtureRoot)) {
      fail("ORCHESTRATOR_TEST_ROOT_INVALID");
    }
  } else if (fixtureRoot !== undefined) {
    fail("ORCHESTRATOR_PRODUCTION_OVERRIDE_FORBIDDEN");
  }
  if (mode === "metrics") {
    if (argv[0] !== "metrics" || values.size !== 0) {
      fail("ORCHESTRATOR_ARGUMENTS_INVALID");
    }
    return { help: false, fixtureRoot, mode, testMode };
  }
  if (mode === "metrics-retention-plan") {
    if (
      argv[0] !== "metrics-retention-plan" ||
      values.size !== 1 ||
      !values.has("--retain-attempt-count")
    ) {
      fail("ORCHESTRATOR_ARGUMENTS_INVALID");
    }
    return {
      help: false,
      fixtureRoot,
      mode,
      retainAttemptCount: exactInteger(
        Number(values.get("--retain-attempt-count")),
        1,
        MAX_METRIC_ATTEMPT_ENTRIES - 1,
        "ORCHESTRATOR_METRIC_RETENTION_COUNT_INVALID",
      ),
      testMode,
    };
  }
  if (mode === "metrics-retention-apply") {
    if (
      argv[0] !== "metrics-retention-apply" ||
      values.size !== 2 ||
      !values.has("--retain-attempt-count") ||
      !values.has("--plan-sha256")
    ) {
      fail("ORCHESTRATOR_ARGUMENTS_INVALID");
    }
    return {
      help: false,
      fixtureRoot,
      mode,
      planSha256: exactString(
        values.get("--plan-sha256") ?? "",
        SHA256,
        "ORCHESTRATOR_METRIC_RETENTION_PLAN_SHA256_INVALID",
      ),
      retainAttemptCount: exactInteger(
        Number(values.get("--retain-attempt-count")),
        1,
        MAX_METRIC_ATTEMPT_ENTRIES - 1,
        "ORCHESTRATOR_METRIC_RETENTION_COUNT_INVALID",
      ),
      testMode,
    };
  }
  const common = ["--operation-id"];
  const expected =
    mode === "prepare"
      ? [
          ...common,
          "--expected-migration",
          "--expected-migration-count",
          "--previous-migration",
          "--previous-migration-count",
          "--previous-release-sha",
          "--previous-web-build-id",
          "--release-sha",
          "--slot",
          "--watchdog-seconds",
        ]
      : [...common, "--plan-sha256"];
  if (mode === "prepare" && !values.has("--watchdog-seconds")) {
    values.set("--watchdog-seconds", "30");
  }
  if (
    values.size !== expected.length ||
    [...values.keys()].some((key) => !expected.includes(key))
  ) {
    fail("ORCHESTRATOR_ARGUMENTS_INVALID");
  }
  const operationId = exactString(
    values.get("--operation-id") ?? "",
    UUID,
    "ORCHESTRATOR_OPERATION_ID_INVALID",
  );
  if (mode !== "prepare") {
    return {
      help: false,
      fixtureRoot,
      mode,
      operationId,
      planSha256: exactString(
        values.get("--plan-sha256") ?? "",
        SHA256,
        "ORCHESTRATOR_PLAN_DIGEST_INVALID",
      ),
      testMode,
    };
  }
  const releaseSha = exactString(
    values.get("--release-sha") ?? "",
    SHA40,
    "ORCHESTRATOR_RELEASE_SHA_INVALID",
  );
  const slot = values.get("--slot");
  if (!["blue", "green"].includes(slot)) fail("ORCHESTRATOR_SLOT_INVALID");
  return {
    help: false,
    expectedMigration: exactString(
      values.get("--expected-migration") ?? "",
      MIGRATION,
      "ORCHESTRATOR_MIGRATION_INVALID",
    ),
    expectedMigrationCount: exactInteger(
      Number(values.get("--expected-migration-count")),
      1,
      999999,
      "ORCHESTRATOR_MIGRATION_COUNT_INVALID",
    ),
    fixtureRoot,
    mode,
    operationId,
    previousMigration: exactString(
      values.get("--previous-migration") ?? "",
      MIGRATION,
      "ORCHESTRATOR_PREVIOUS_MIGRATION_INVALID",
    ),
    previousMigrationCount: exactInteger(
      Number(values.get("--previous-migration-count")),
      1,
      999999,
      "ORCHESTRATOR_PREVIOUS_MIGRATION_COUNT_INVALID",
    ),
    previousReleaseSha: exactString(
      values.get("--previous-release-sha") ?? "",
      SHA40,
      "ORCHESTRATOR_PREVIOUS_RELEASE_SHA_INVALID",
    ),
    previousWebBuildId: exactString(
      values.get("--previous-web-build-id") ?? "",
      SHA40,
      "ORCHESTRATOR_PREVIOUS_WEB_BUILD_ID_INVALID",
    ),
    releaseSha,
    slot,
    testMode,
    watchdogSeconds: exactInteger(
      Number(values.get("--watchdog-seconds")),
      5,
      60,
      "ORCHESTRATOR_WATCHDOG_INVALID",
    ),
  };
}

function buildPaths(args) {
  if (!args.testMode) {
    return {
      authSmoke:
        "/usr/local/libexec/leetplus/verify-legacy-rollback-authenticated-reads.mjs",
      binder: "/usr/local/sbin/leetplus-bind-release-slot",
      cache: "/usr/local/libexec/leetplus/prepare-web-slot-cache.sh",
      cutover: "/usr/local/sbin/leetplus-blue-green-cutover",
      deployReceiptRoot: "/var/lib/leetplus/deploy-receipts",
      installedVerifier:
        "/usr/local/libexec/leetplus/verify-installed-production-control-generation.mjs",
      getent: "/usr/bin/getent",
      nginxRoot: "/etc/nginx/leetplus",
      node: "/usr/bin/node",
      promoter: "/usr/local/sbin/leetplus-promote-release-artifact",
      readiness: "/usr/local/libexec/leetplus/verify-release-readiness.sh",
      releaseRoot: "/srv/leetplus/releases",
      slotRoot: "/srv/leetplus/slots",
      slotEnvironmentRoot: "/etc/leetplus/slots",
      stateRoot: "/var/lib/leetplus/deploy-receipts/release-orchestrator",
      metricsRoot:
        "/var/lib/leetplus/deploy-receipts/release-orchestrator-metrics",
      metricsArchiveRoot:
        "/var/lib/leetplus/deploy-receipts/release-orchestrator-metrics-archive",
      systemctl: "/usr/bin/systemctl",
      systemdUnitRoot: "/etc/systemd/system",
    };
  }
  const root = path.resolve(args.fixtureRoot);
  const commandRoot = path.join(root, "commands");
  return {
    authSmoke: path.join(commandRoot, "auth-smoke"),
    binder: path.join(commandRoot, "bind-release-slot"),
    cache: path.join(commandRoot, "prepare-web-slot-cache"),
    cutover: path.join(commandRoot, "blue-green-cutover"),
    deployReceiptRoot: path.join(root, "var/lib/leetplus/deploy-receipts"),
    installedVerifier: path.join(
      commandRoot,
      "verify-installed-production-control-generation.mjs",
    ),
    getent: path.join(commandRoot, "getent"),
    nginxRoot: path.join(root, "etc/nginx/leetplus"),
    node: process.execPath,
    promoter: path.join(commandRoot, "promote-release-artifact"),
    readiness: path.join(commandRoot, "verify-release-readiness"),
    releaseRoot: path.join(root, "srv/leetplus/releases"),
    slotRoot: path.join(root, "srv/leetplus/slots"),
    slotEnvironmentRoot: path.join(root, "etc/leetplus/slots"),
    stateRoot: path.join(
      root,
      "var/lib/leetplus/deploy-receipts/release-orchestrator",
    ),
    metricsRoot: path.join(
      root,
      "var/lib/leetplus/deploy-receipts/release-orchestrator-metrics",
    ),
    metricsArchiveRoot: path.join(
      root,
      "var/lib/leetplus/deploy-receipts/release-orchestrator-metrics-archive",
    ),
    systemctl: path.join(commandRoot, "systemctl"),
    systemdUnitRoot: path.join(root, "etc/systemd/system"),
  };
}

function validateBootstrap(args) {
  const uid = process.getuid?.();
  if (args.testMode) {
    if (uid === 0) fail("ORCHESTRATOR_TEST_MODE_FORBIDDEN_FOR_ROOT");
    return;
  }
  if (
    uid !== 0 ||
    process.env.LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP !== PRODUCTION_BOOTSTRAP ||
    process.env.LEETPLUS_RESUMABLE_RELEASE_INSTALL_LOCK_FD !== "8" ||
    path.resolve(process.argv[1]) !== PRODUCTION_ENGINE
  ) {
    fail("ORCHESTRATOR_PRODUCTION_BOOTSTRAP_INVALID");
  }
  const unexpected = Object.keys(process.env).filter(
    (key) =>
      ![
        "LANG",
        "LC_ALL",
        "LEETPLUS_RESUMABLE_RELEASE_BOOTSTRAP",
        "LEETPLUS_RESUMABLE_RELEASE_INSTALL_LOCK_FD",
        "PATH",
        "TZ",
      ].includes(key),
  );
  if (
    unexpected.length > 0 ||
    Object.entries(SAFE_ENV).some(([key, value]) => process.env[key] !== value)
  ) {
    fail("ORCHESTRATOR_PRODUCTION_ENVIRONMENT_INVALID");
  }
  const lockPath = lstatSync(PRODUCTION_CONTROL_INSTALL_LOCK);
  const lockDescriptor = fstatSync(PRODUCTION_CONTROL_INSTALL_LOCK_FD);
  if (
    !lockPath.isFile() ||
    lockPath.isSymbolicLink() ||
    lockPath.nlink !== 1 ||
    lockPath.uid !== 0 ||
    lockPath.gid !== 0 ||
    (lockPath.mode & 0o777) !== 0o600 ||
    lockPath.dev !== lockDescriptor.dev ||
    lockPath.ino !== lockDescriptor.ino
  ) {
    fail("ORCHESTRATOR_PRODUCTION_CONTROL_LOCK_INVALID");
  }
  if (["metrics", "metrics-retention-plan"].includes(args.mode)) return;
}

function assertDirectory(directory, args, expectedMode = 0o700) {
  const details = lstatSync(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    fail("ORCHESTRATOR_STATE_DIRECTORY_INVALID");
  }
  if (
    !args.testMode &&
    (details.uid !== 0 ||
      details.gid !== 0 ||
      (details.mode & 0o777) !== expectedMode)
  ) {
    fail("ORCHESTRATOR_STATE_DIRECTORY_INVALID");
  }
}

function ensureStateRoot(paths, args) {
  assertDirectory(paths.deployReceiptRoot, args, 0o700);
  if (!existsSync(paths.stateRoot)) {
    mkdirSync(paths.stateRoot, { mode: 0o700 });
  }
  assertDirectory(paths.stateRoot, args, 0o700);
}

function fileIdentity(details) {
  return [details.dev, details.ino, details.size, details.mtimeMs].join(":");
}

function lstatIfPresent(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function readCanonicalJson(filePath, args, expectedModes = [0o400, 0o600]) {
  const beforePath = lstatSync(filePath);
  if (
    !beforePath.isFile() ||
    beforePath.isSymbolicLink() ||
    beforePath.nlink !== 1 ||
    beforePath.size < 3 ||
    beforePath.size > MAX_JSON_BYTES
  ) {
    fail("ORCHESTRATOR_RECORD_FILE_INVALID");
  }
  if (
    !args.testMode &&
    (beforePath.uid !== 0 || !expectedModes.includes(beforePath.mode & 0o777))
  ) {
    fail("ORCHESTRATOR_RECORD_FILE_INVALID");
  }
  const canonicalPath = realpathSync(filePath);
  if (canonicalPath !== path.resolve(filePath)) {
    fail("ORCHESTRATOR_RECORD_PATH_INVALID");
  }
  const fd = openSync(
    canonicalPath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fstatSync(fd);
    if (fileIdentity(before) !== fileIdentity(beforePath)) {
      fail("ORCHESTRATOR_RECORD_FILE_CHANGED");
    }
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (
      bytes.length !== before.size ||
      fileIdentity(before) !== fileIdentity(after)
    ) {
      fail("ORCHESTRATOR_RECORD_FILE_CHANGED");
    }
    const raw = bytes.toString("utf8");
    if (!Buffer.from(raw, "utf8").equals(bytes)) {
      fail("ORCHESTRATOR_RECORD_JSON_INVALID");
    }
    if (raw.includes("\0") || raw.includes("\r")) {
      fail("ORCHESTRATOR_RECORD_JSON_INVALID");
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      fail("ORCHESTRATOR_RECORD_JSON_INVALID");
    }
    if (raw !== canonicalJson(value)) {
      fail("ORCHESTRATOR_RECORD_NOT_CANONICAL");
    }
    return { sha256: sha256(bytes), value };
  } finally {
    closeSync(fd);
  }
}

function syncDirectory(directory, args) {
  let fd;
  try {
    fd = openSync(directory, fsConstants.O_RDONLY);
    fsyncSync(fd);
  } catch (error) {
    if (!args.testMode) throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function publishCanonicalJson(filePath, value, mode, args) {
  if (existsSync(filePath)) fail("ORCHESTRATOR_RECORD_ALREADY_EXISTS");
  const bytes = canonicalJson(value);
  if (Buffer.byteLength(bytes, "utf8") > MAX_JSON_BYTES) {
    fail("ORCHESTRATOR_RECORD_FILE_INVALID");
  }
  const temporary = filePath + ".new." + process.pid + "." + randomUUID();
  const fd = openSync(
    temporary,
    fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_WRONLY |
      (fsConstants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    writeFileSync(fd, bytes, "utf8");
    fchmodSync(fd, mode);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, filePath);
  syncDirectory(path.dirname(filePath), args);
}

function assertInside(child, parent, reasonCode) {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(reasonCode);
  }
}

function operationDirectory(paths, operationId) {
  return path.join(paths.stateRoot, operationId);
}

function phasePrefix(index, phase) {
  return String(index + 1).padStart(2, "0") + "-" + phase.toLowerCase();
}

function commandEnvironment(args) {
  if (!args.testMode) return { ...SAFE_ENV };
  const result = { ...process.env };
  result.LEETPLUS_ORCHESTRATOR_FIXTURE_ROOT = path.resolve(args.fixtureRoot);
  return result;
}

function runCommand(executable, commandArgs, args, label, timeoutMs) {
  const result = spawnSync(executable, commandArgs, {
    encoding: "utf8",
    env: commandEnvironment(args),
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    stdio: args.testMode
      ? ["ignore", "pipe", "pipe"]
      : [
          "ignore",
          "pipe",
          "pipe",
          "ignore",
          "ignore",
          "ignore",
          "ignore",
          "ignore",
          PRODUCTION_CONTROL_INSTALL_LOCK_FD,
        ],
    timeout: timeoutMs,
    windowsHide: true,
  });
  if (result.error) {
    fail(label + "_OUTCOME_AMBIGUOUS");
  }
  if (result.status !== 0) {
    fail(label + "_FAILED");
  }
  if (
    Buffer.byteLength(result.stdout ?? "", "utf8") > MAX_COMMAND_OUTPUT_BYTES ||
    Buffer.byteLength(result.stderr ?? "", "utf8") > MAX_COMMAND_OUTPUT_BYTES
  ) {
    fail(label + "_OUTPUT_OVERSIZED");
  }
  if ((result.stderr ?? "") !== "") {
    fail(label + "_UNEXPECTED_STDERR");
  }
  return result.stdout ?? "";
}

function parseKeyValueRecord(raw, reasonCode) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.includes("\0") ||
    raw.includes("\r") ||
    !raw.endsWith("\n")
  ) {
    fail(reasonCode);
  }
  const values = new Map();
  for (const line of raw.slice(0, -1).split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) fail(reasonCode);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      !/^[A-Z][A-Z0-9_]*$/u.test(key) ||
      !SAFE_RECORD_VALUE.test(value) ||
      values.has(key)
    ) {
      fail(reasonCode);
    }
    values.set(key, value);
  }
  return values;
}

function exactRecordKeys(values, expected, reasonCode) {
  if (
    [...values.keys()].sort().join("\0") !== [...expected].sort().join("\0")
  ) {
    fail(reasonCode);
  }
}

function readKeyValueFile(
  filePath,
  args,
  reasonCode,
  expectedModes = [0o400, 0o600],
) {
  const details = lstatSync(filePath);
  if (
    !details.isFile() ||
    details.isSymbolicLink() ||
    details.nlink !== 1 ||
    details.size < 3 ||
    details.size > MAX_JSON_BYTES
  ) {
    fail(reasonCode);
  }
  if (
    !args.testMode &&
    (details.uid !== 0 ||
      details.gid !== 0 ||
      !expectedModes.includes(details.mode & 0o777))
  ) {
    fail(reasonCode);
  }
  const canonicalPath = realpathSync(filePath);
  if (canonicalPath !== path.resolve(filePath)) fail(reasonCode);
  const fd = openSync(
    canonicalPath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fstatSync(fd);
    if (fileIdentity(before) !== fileIdentity(details)) fail(reasonCode);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (
      bytes.length !== before.size ||
      fileIdentity(before) !== fileIdentity(after)
    ) {
      fail(reasonCode);
    }
    const raw = bytes.toString("utf8");
    return {
      path: canonicalPath,
      raw,
      sha256: sha256(bytes),
      values: parseKeyValueRecord(raw, reasonCode),
    };
  } finally {
    closeSync(fd);
  }
}

function runtimeGroupGid(paths, args) {
  if (args.testMode) return process.getgid?.();
  const output = runCommand(
    paths.getent,
    ["group", "leetplus-runtime"],
    args,
    "ORCHESTRATOR_RUNTIME_GROUP_LOOKUP",
    30000,
  );
  const match = /^leetplus-runtime:[^:\n]*:([0-9]+):[^\n]*\n$/u.exec(output);
  if (!match) fail("ORCHESTRATOR_RUNTIME_GROUP_INVALID");
  return exactInteger(
    Number(match[1]),
    1,
    2 ** 31 - 1,
    "ORCHESTRATOR_RUNTIME_GROUP_INVALID",
  );
}

function readExactBytes(
  filePath,
  args,
  { expectedGid, expectedMode, expectedUid, maximumBytes, reasonCode },
) {
  const details = lstatSync(filePath);
  if (
    !details.isFile() ||
    details.isSymbolicLink() ||
    details.nlink !== 1 ||
    details.size < 1 ||
    details.size > maximumBytes ||
    details.uid !== expectedUid ||
    details.gid !== expectedGid ||
    (details.mode & 0o777) !== expectedMode
  ) {
    fail(reasonCode);
  }
  const canonicalPath = realpathSync(filePath);
  if (canonicalPath !== path.resolve(filePath)) fail(reasonCode);
  const fd = openSync(
    canonicalPath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fstatSync(fd);
    if (fileIdentity(before) !== fileIdentity(details)) fail(reasonCode);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (
      bytes.length !== before.size ||
      fileIdentity(before) !== fileIdentity(after)
    ) {
      fail(reasonCode);
    }
    const raw = bytes.toString("utf8");
    if (!Buffer.from(raw, "utf8").equals(bytes)) fail(reasonCode);
    return {
      bytes,
      details,
      path: canonicalPath,
      raw,
      sha256: sha256(bytes),
    };
  } finally {
    closeSync(fd);
  }
}

function parseSlotEnvironment(
  raw,
  slot,
  reasonCode,
  { allowLegacyApiBindHost = false } = {},
) {
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.includes("\0") ||
    raw.includes("\r") ||
    !raw.endsWith("\n")
  ) {
    fail(reasonCode);
  }
  const values = new Map();
  for (const line of raw.slice(0, -1).split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail(reasonCode);
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (
      !SLOT_ENVIRONMENT_KEYS.includes(key) ||
      values.has(key) ||
      !SAFE_RECORD_VALUE.test(value)
    ) {
      fail(reasonCode);
    }
    values.set(key, value);
  }
  exactRecordKeys(values, SLOT_ENVIRONMENT_KEYS, reasonCode);
  const expected =
    slot === "blue"
      ? { apiUrl: "http://127.0.0.1:4100", port: "4100", webPort: "3100" }
      : { apiUrl: "http://127.0.0.1:4200", port: "4200", webPort: "3200" };
  if (
    !SHA40.test(values.get("RELEASE_SHA") ?? "") ||
    values.get("WEB_BUILD_ID") !== values.get("RELEASE_SHA") ||
    !MIGRATION.test(values.get("EXPECTED_DATABASE_MIGRATION") ?? "") ||
    !/^[1-9][0-9]{0,8}$/u.test(
      values.get("EXPECTED_DATABASE_MIGRATION_COUNT") ?? "",
    ) ||
    !["OFF", "LIVE"].includes(values.get("GUEST_BUG_REPORTING_MODE")) ||
    !["OFF", "ALLOW_CURRENT_187", "ALLOW_CURRENT_188"].includes(
      values.get("GUEST_SUPPORT_SCHEMA_BRIDGE_MODE"),
    ) ||
    (values.get("GUEST_SUPPORT_SCHEMA_BRIDGE_MODE") !== "OFF" &&
      values.get("GUEST_BUG_REPORTING_MODE") !== "OFF") ||
    (values.get("API_BIND_HOST") !== CANONICAL_API_BIND_HOST &&
      (!allowLegacyApiBindHost ||
        values.get("API_BIND_HOST") !== LEGACY_API_BIND_HOST)) ||
    values.get("PORT") !== expected.port ||
    values.get("WEB_PORT") !== expected.webPort ||
    values.get("API_URL") !== expected.apiUrl
  ) {
    fail(reasonCode);
  }
  exactIso(values.get("BUILD_TIME"), reasonCode);
  return values;
}

function renderSlotEnvironment(slot, values) {
  return (
    [
      "# Protected /etc/leetplus/slots/" + slot + ".env metadata.",
      "RELEASE_SHA=" + values.get("RELEASE_SHA"),
      "WEB_BUILD_ID=" + values.get("WEB_BUILD_ID"),
      "EXPECTED_DATABASE_MIGRATION=" +
        values.get("EXPECTED_DATABASE_MIGRATION"),
      "EXPECTED_DATABASE_MIGRATION_COUNT=" +
        values.get("EXPECTED_DATABASE_MIGRATION_COUNT"),
      "BUILD_TIME=" + values.get("BUILD_TIME"),
      "API_BIND_HOST=" + values.get("API_BIND_HOST"),
      "PORT=" + values.get("PORT"),
      "WEB_PORT=" + values.get("WEB_PORT"),
      "API_URL=" + values.get("API_URL"),
      "GUEST_BUG_REPORTING_MODE=" +
        values.get("GUEST_BUG_REPORTING_MODE"),
      "GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=" +
        values.get("GUEST_SUPPORT_SCHEMA_BRIDGE_MODE"),
      "",
    ].join("\n")
  );
}

function publishExactBytes(
  filePath,
  bytes,
  args,
  { expectedGid, expectedMode, expectedUid, reasonCode },
) {
  if (existsSync(filePath)) {
    const current = readExactBytes(filePath, args, {
      expectedGid,
      expectedMode,
      expectedUid,
      maximumBytes: Math.max(bytes.length, 1),
      reasonCode,
    });
    if (!current.bytes.equals(bytes)) fail(reasonCode);
    return current;
  }
  const temporary = filePath + ".new";
  if (existsSync(temporary)) {
    const staged = readExactBytes(temporary, args, {
      expectedGid,
      expectedMode,
      expectedUid,
      maximumBytes: Math.max(bytes.length, 1),
      reasonCode,
    });
    if (!staged.bytes.equals(bytes)) fail(reasonCode);
  } else {
    const fd = openSync(
      temporary,
      fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_WRONLY |
        (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      writeFileSync(fd, bytes);
      if (!args.testMode) fchownSync(fd, expectedUid, expectedGid);
      fchmodSync(fd, expectedMode);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  renameSync(temporary, filePath);
  syncDirectory(path.dirname(filePath), args);
  return readExactBytes(filePath, args, {
    expectedGid,
    expectedMode,
    expectedUid,
    maximumBytes: Math.max(bytes.length, 1),
    reasonCode,
  });
}

function bindSlotEnvironment(plan, authority, paths, args) {
  const expectedUid = args.testMode ? process.getuid?.() : 0;
  const expectedRuntimeGid = runtimeGroupGid(paths, args);
  const expectedRecordGid = args.testMode ? process.getgid?.() : 0;
  const rootDetails = lstatSync(paths.slotEnvironmentRoot);
  if (
    !rootDetails.isDirectory() ||
    rootDetails.isSymbolicLink() ||
    realpathSync(paths.slotEnvironmentRoot) !==
      path.resolve(paths.slotEnvironmentRoot) ||
    (!args.testMode &&
      (rootDetails.uid !== 0 ||
        rootDetails.gid !== 0 ||
        (rootDetails.mode & 0o777) !== 0o755))
  ) {
    fail("ORCHESTRATOR_SLOT_ENVIRONMENT_ROOT_INVALID");
  }
  const environmentPath = path.join(
    paths.slotEnvironmentRoot,
    plan.targetSlot + ".env",
  );
  const previousPath = path.join(
    operationDirectory(paths, plan.operationId),
    "02-bind-slot-environment.previous.env",
  );
  let previous;
  if (existsSync(previousPath)) {
    previous = readExactBytes(previousPath, args, {
      expectedGid: expectedRecordGid,
      expectedMode: 0o400,
      expectedUid,
      maximumBytes: MAX_SLOT_ENVIRONMENT_BYTES,
      reasonCode: "ORCHESTRATOR_SLOT_ENVIRONMENT_BACKUP_INVALID",
    });
  } else {
    const current = readExactBytes(environmentPath, args, {
      expectedGid: expectedRuntimeGid,
      expectedMode: 0o440,
      expectedUid,
      maximumBytes: MAX_SLOT_ENVIRONMENT_BYTES,
      reasonCode: "ORCHESTRATOR_SLOT_ENVIRONMENT_INVALID",
    });
    parseSlotEnvironment(
      current.raw,
      plan.targetSlot,
      "ORCHESTRATOR_SLOT_ENVIRONMENT_INVALID",
      { allowLegacyApiBindHost: true },
    );
    previous = publishExactBytes(previousPath, current.bytes, args, {
      expectedGid: expectedRecordGid,
      expectedMode: 0o400,
      expectedUid,
      reasonCode: "ORCHESTRATOR_SLOT_ENVIRONMENT_BACKUP_INVALID",
    });
  }
  const previousValues = parseSlotEnvironment(
    previous.raw,
    plan.targetSlot,
    "ORCHESTRATOR_SLOT_ENVIRONMENT_BACKUP_INVALID",
    { allowLegacyApiBindHost: true },
  );
  const expectedPreviousReleaseSha =
    authority.priorState === "BOUND"
      ? authority.priorReleaseSha
      : plan.previousReleaseSha;
  if (
    previousValues.get("RELEASE_SHA") !== expectedPreviousReleaseSha ||
    previousValues.get("EXPECTED_DATABASE_MIGRATION") !==
      plan.previousMigration ||
    Number(previousValues.get("EXPECTED_DATABASE_MIGRATION_COUNT")) !==
      plan.previousMigrationCount
  ) {
    fail("ORCHESTRATOR_SLOT_ENVIRONMENT_LINEAGE_INVALID");
  }
  const targetValues = new Map(previousValues);
  targetValues.set("RELEASE_SHA", plan.releaseSha);
  targetValues.set("WEB_BUILD_ID", plan.releaseSha);
  targetValues.set("EXPECTED_DATABASE_MIGRATION", plan.expectedMigration);
  targetValues.set(
    "EXPECTED_DATABASE_MIGRATION_COUNT",
    String(plan.expectedMigrationCount),
  );
  targetValues.set("BUILD_TIME", plan.preparedAt);
  targetValues.set("API_BIND_HOST", CANONICAL_API_BIND_HOST);
  const apiBindHostNormalization =
    previousValues.get("API_BIND_HOST") === LEGACY_API_BIND_HOST
      ? "LEGACY_LOCALHOST_TO_IPV4_LOOPBACK"
      : "NONE";
  const targetBytes = Buffer.from(
    renderSlotEnvironment(plan.targetSlot, targetValues),
    "utf8",
  );
  const current = readExactBytes(environmentPath, args, {
    expectedGid: expectedRuntimeGid,
    expectedMode: 0o440,
    expectedUid,
    maximumBytes: MAX_SLOT_ENVIRONMENT_BYTES,
    reasonCode: "ORCHESTRATOR_SLOT_ENVIRONMENT_INVALID",
  });
  if (!current.bytes.equals(previous.bytes) && !current.bytes.equals(targetBytes)) {
    fail("ORCHESTRATOR_SLOT_ENVIRONMENT_DRIFT");
  }
  const temporary = environmentPath + ".next." + plan.operationId;
  if (current.bytes.equals(previous.bytes)) {
    if (existsSync(temporary)) {
      const staged = readExactBytes(temporary, args, {
        expectedGid: expectedRuntimeGid,
        expectedMode: 0o440,
        expectedUid,
        maximumBytes: MAX_SLOT_ENVIRONMENT_BYTES,
        reasonCode: "ORCHESTRATOR_SLOT_ENVIRONMENT_STAGING_INVALID",
      });
      if (!staged.bytes.equals(targetBytes)) {
        fail("ORCHESTRATOR_SLOT_ENVIRONMENT_STAGING_INVALID");
      }
    } else {
      const fd = openSync(
        temporary,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_WRONLY |
          (fsConstants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        writeFileSync(fd, targetBytes);
        if (!args.testMode) fchownSync(fd, expectedUid, expectedRuntimeGid);
        fchmodSync(fd, 0o440);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    renameSync(temporary, environmentPath);
    syncDirectory(paths.slotEnvironmentRoot, args);
  } else if (existsSync(temporary)) {
    fail("ORCHESTRATOR_SLOT_ENVIRONMENT_STAGING_INVALID");
  }
  const accepted = readExactBytes(environmentPath, args, {
    expectedGid: expectedRuntimeGid,
    expectedMode: 0o440,
    expectedUid,
    maximumBytes: MAX_SLOT_ENVIRONMENT_BYTES,
    reasonCode: "ORCHESTRATOR_SLOT_ENVIRONMENT_INVALID",
  });
  if (!accepted.bytes.equals(targetBytes)) {
    fail("ORCHESTRATOR_SLOT_ENVIRONMENT_NOT_ACCEPTED");
  }
  parseSlotEnvironment(
    accepted.raw,
    plan.targetSlot,
    "ORCHESTRATOR_SLOT_ENVIRONMENT_INVALID",
  );
  return {
    slotEnvironmentApiBindHostNormalization: apiBindHostNormalization,
    slotEnvironmentPath: accepted.path,
    slotEnvironmentPreviousPath: previous.path,
    slotEnvironmentPreviousSha256: previous.sha256,
    slotEnvironmentSha256: accepted.sha256,
  };
}

function verifyInstalledControl(releaseSha, paths, args) {
  const stdout = runCommand(
    paths.node,
    [
      paths.installedVerifier,
      "--release-sha",
      releaseSha,
      "--require-root-authority",
    ],
    args,
    "ORCHESTRATOR_CONTROL_VERIFIER",
    120000,
  );
  const lines = stdout.split("\n");
  const laneMatch = CONTROL_LANE_LINE.exec(lines[14] ?? "");
  const impactMatch = CONTROL_IMPACT_LINE.exec(lines[15] ?? "");
  if (
    lines.length !== 17 ||
    lines[0] !== "PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS" ||
    lines[1] !== "PRODUCTION_CONTROL_RELEASE_SHA=" + releaseSha ||
    lines[13] !== "PRODUCTION_CONTROL_INSTALLED_FILE_COUNT=52" ||
    laneMatch === null ||
    impactMatch === null ||
    lines[16] !== ""
  ) {
    fail("ORCHESTRATOR_CONTROL_ATTESTATION_INVALID");
  }
  return {
    attestationSha256: sha256(stdout),
    effectiveLane: laneMatch[1],
    impactReceiptSha256: impactMatch[1],
  };
}

function assertControlAttestationMatches(control, plan) {
  if (
    control.attestationSha256 !== plan.controlAttestationSha256 ||
    control.effectiveLane !== plan.effectiveLane ||
    control.impactReceiptSha256 !== plan.impactReceiptSha256
  ) {
    fail("ORCHESTRATOR_CONTROL_GENERATION_DRIFT");
  }
}

function latestCutover(paths, args, allowMissing = false) {
  const indexPath = path.join(paths.deployReceiptRoot, "latest-accepted.index");
  if (!existsSync(indexPath)) {
    if (allowMissing) {
      return {
        consumed: false,
        generation: 0,
        receiptPath: "",
        receiptSha256: "",
      };
    }
    fail("ORCHESTRATOR_CUTOVER_INDEX_MISSING");
  }
  const index = readKeyValueFile(
    indexPath,
    args,
    "ORCHESTRATOR_CUTOVER_INDEX_INVALID",
    [0o600],
  );
  const required = [
    "CONSUMED",
    "GENERATION",
    "RECEIPT_PATH",
    "RECEIPT_SHA256",
    "RECORD_VERSION",
  ];
  if (
    [...index.values.keys()].sort().join("\0") !== required.sort().join("\0") ||
    index.values.get("RECORD_VERSION") !== "2" ||
    !/^[1-9][0-9]{0,8}$/u.test(index.values.get("GENERATION") ?? "") ||
    !SHA256.test(index.values.get("RECEIPT_SHA256") ?? "") ||
    !["true", "false"].includes(index.values.get("CONSUMED"))
  ) {
    fail("ORCHESTRATOR_CUTOVER_INDEX_INVALID");
  }
  const receiptPath = path.resolve(index.values.get("RECEIPT_PATH"));
  assertInside(
    receiptPath,
    paths.deployReceiptRoot,
    "ORCHESTRATOR_CUTOVER_RECEIPT_OUTSIDE_ROOT",
  );
  const receipt = readKeyValueFile(
    receiptPath,
    args,
    "ORCHESTRATOR_CUTOVER_RECEIPT_INVALID",
    [0o600],
  );
  exactRecordKeys(
    receipt.values,
    CUTOVER_RECEIPT_KEYS,
    "ORCHESTRATOR_CUTOVER_RECEIPT_INVALID",
  );
  const generation = index.values.get("GENERATION");
  const releaseSha = receipt.values.get("RELEASE_SHA") ?? "";
  const slot = receipt.values.get("SLOT") ?? "";
  const filenamePattern = new RegExp(
    "^[0-9]{8}T[0-9]{15}Z-g" +
      generation +
      "-" +
      releaseSha +
      "-" +
      slot +
      "\\.receipt$",
    "u",
  );
  const previousRuntimeKind = receipt.values.get("PREVIOUS_RUNTIME_KIND") ?? "";
  const previousMigrationCount =
    receipt.values.get("PREVIOUS_MIGRATION_COUNT") ?? "";
  const previousCountValid =
    /^[1-9][0-9]{0,8}$/u.test(previousMigrationCount) ||
    (previousRuntimeKind === "LEGACY_SAFE" && previousMigrationCount === "0");
  if (
    receipt.sha256 !== index.values.get("RECEIPT_SHA256") ||
    receipt.values.get("RECORD_VERSION") !== "3" ||
    receipt.values.get("GENERATION") !== generation ||
    !SHA40.test(releaseSha) ||
    !["blue", "green"].includes(slot) ||
    !filenamePattern.test(path.basename(receiptPath)) ||
    !SHA256.test(receipt.values.get("ACTIVATED_SHA256") ?? "") ||
    !SHA256.test(receipt.values.get("PREVIOUS_SHA256") ?? "") ||
    !SHA40.test(receipt.values.get("PREVIOUS_RELEASE_SHA") ?? "") ||
    !previousCountValid ||
    !["SLOT", "LEGACY_SAFE"].includes(previousRuntimeKind) ||
    receipt.values.get("PREVIOUS_WEB_BUILD_ID") !==
      receipt.values.get("PREVIOUS_RELEASE_SHA")
  ) {
    fail("ORCHESTRATOR_CUTOVER_RECEIPT_INVALID");
  }
  return {
    consumed: index.values.get("CONSUMED") === "true",
    generation: Number(generation),
    activatedTarget: receipt.values.get("ACTIVATED_TARGET"),
    previousMigration: receipt.values.get("PREVIOUS_MIGRATION"),
    previousMigrationCount: Number(previousMigrationCount),
    previousReleaseSha: receipt.values.get("PREVIOUS_RELEASE_SHA"),
    previousSlot: receipt.values.get("PREVIOUS_SLOT"),
    previousTarget: receipt.values.get("PREVIOUS_TARGET"),
    previousWebBuildId: receipt.values.get("PREVIOUS_WEB_BUILD_ID"),
    receiptPath,
    receiptSha256: receipt.sha256,
    releaseSha,
    slot,
  };
}

function latestSlotBinding(slot, releaseSha, paths, args) {
  const root = path.join(paths.deployReceiptRoot, "slot-links");
  const indexPath = path.join(root, slot + ".latest");
  if (!existsSync(indexPath)) return null;
  const index = readKeyValueFile(
    indexPath,
    args,
    "ORCHESTRATOR_SLOT_INDEX_INVALID",
    [0o600],
  );
  exactRecordKeys(
    index.values,
    [
      "OPERATION_ID",
      "RECEIPT_PATH",
      "RECEIPT_SHA256",
      "RECORD_KIND",
      "RECORD_VERSION",
      "SLOT",
      "UPDATED_AT",
    ],
    "ORCHESTRATOR_SLOT_INDEX_INVALID",
  );
  if (
    index.values.get("RECORD_VERSION") !== "1" ||
    index.values.get("RECORD_KIND") !== "SLOT_LINK_LATEST" ||
    index.values.get("SLOT") !== slot ||
    !SHA256.test(index.values.get("RECEIPT_SHA256") ?? "")
  ) {
    fail("ORCHESTRATOR_SLOT_INDEX_INVALID");
  }
  const receiptPath = path.resolve(index.values.get("RECEIPT_PATH"));
  assertInside(receiptPath, root, "ORCHESTRATOR_SLOT_RECEIPT_OUTSIDE_ROOT");
  const receipt = readKeyValueFile(
    receiptPath,
    args,
    "ORCHESTRATOR_SLOT_RECEIPT_INVALID",
    [0o600],
  );
  exactRecordKeys(
    receipt.values,
    SLOT_BIND_RECEIPT_KEYS,
    "ORCHESTRATOR_SLOT_RECEIPT_INVALID",
  );
  const requestedTarget = path.join(paths.releaseRoot, releaseSha);
  if (
    receipt.sha256 !== index.values.get("RECEIPT_SHA256") ||
    receipt.values.get("RECORD_VERSION") !== "1" ||
    receipt.values.get("RECORD_KIND") !== "SLOT_LINK_RECEIPT" ||
    receipt.values.get("OPERATION") !== "BIND" ||
    receipt.values.get("OPERATION_ID") !== index.values.get("OPERATION_ID") ||
    receipt.values.get("SLOT") !== slot ||
    receipt.values.get("REQUESTED_RELEASE_SHA") !== releaseSha ||
    receipt.values.get("REQUESTED_TARGET") !== requestedTarget ||
    !SHA256.test(receipt.values.get("INTENT_SHA256") ?? "") ||
    !SHA256.test(receipt.values.get("REQUESTED_SHA256SUMS_SHA256") ?? "") ||
    !SHA256.test(
      receipt.values.get("REQUESTED_HYDRATED_SHA256SUMS_SHA256") ?? "",
    ) ||
    !SHA256.test(
      receipt.values.get("REQUESTED_SYMLINK_MANIFEST_SHA256") ?? "",
    ) ||
    !SHA256.test(receipt.values.get("REQUESTED_PROVENANCE_SHA256") ?? "") ||
    !SHA256.test(
      receipt.values.get("REQUESTED_HYDRATION_ATTESTATION_SHA256") ?? "",
    ) ||
    receipt.values.get("EFFECT_STATE") !== "REQUESTED_BOUND"
  ) {
    return null;
  }
  const priorState = receipt.values.get("PRIOR_STATE");
  const priorReleaseSha = receipt.values.get("PRIOR_RELEASE_SHA") ?? "";
  const priorTarget = receipt.values.get("PRIOR_TARGET") ?? "";
  const priorDigests = [
    "PRIOR_SHA256SUMS_SHA256",
    "PRIOR_HYDRATED_SHA256SUMS_SHA256",
    "PRIOR_SYMLINK_MANIFEST_SHA256",
    "PRIOR_PROVENANCE_SHA256",
    "PRIOR_HYDRATION_ATTESTATION_SHA256",
  ].map((key) => receipt.values.get(key) ?? "");
  if (
    !["ABSENT", "BOUND"].includes(priorState) ||
    receipt.values.get("SOURCE_RECEIPT_SHA256") !== "" ||
    receipt.values.get("ACTIVE_SLOT_SAFE_MODE") !== "false" ||
    (priorState === "ABSENT" &&
      (priorReleaseSha !== "" ||
        priorTarget !== "" ||
        priorDigests.some((value) => value !== ""))) ||
    (priorState === "BOUND" &&
      (!SHA40.test(priorReleaseSha) ||
        priorTarget !== path.join(paths.releaseRoot, priorReleaseSha) ||
        priorDigests.some((value) => !SHA256.test(value))))
  ) {
    fail("ORCHESTRATOR_SLOT_RECEIPT_INVALID");
  }
  if (
    receiptPath !==
    path.join(
      root,
      slot + "-" + receipt.values.get("OPERATION_ID") + ".bind.receipt",
    )
  ) {
    fail("ORCHESTRATOR_SLOT_RECEIPT_INVALID");
  }
  return {
    priorReleaseSha,
    priorState,
    receiptPath,
    receiptSha256: receipt.sha256,
  };
}

function currentSlotTarget(slot, paths) {
  const slotPath = path.join(paths.slotRoot, slot);
  if (!existsSync(slotPath)) return "";
  const details = lstatSync(slotPath);
  if (!details.isSymbolicLink()) fail("ORCHESTRATOR_SLOT_LINK_INVALID");
  return realpathSync(slotPath);
}

function currentActiveSlot(paths) {
  const activeLink = path.join(paths.nginxRoot, "active-upstreams.conf");
  const details = lstatSync(activeLink);
  if (!details.isSymbolicLink()) {
    fail("ORCHESTRATOR_ACTIVE_RUNTIME_LINK_INVALID");
  }
  const activeTarget = realpathSync(activeLink);
  for (const slot of ["blue", "green"]) {
    if (
      activeTarget === path.join(paths.nginxRoot, "upstreams", slot + ".conf")
    ) {
      return slot;
    }
  }
  fail("ORCHESTRATOR_ACTIVE_RUNTIME_NOT_BLUE_GREEN");
}

function outstandingIntent(root, predicate) {
  if (!existsSync(root)) return false;
  return readdirSync(root).some(predicate);
}

function planUrls(slot) {
  return slot === "blue"
    ? {
        loopbackApi: "http://127.0.0.1:4100",
        loopbackWeb: "http://127.0.0.1:3100",
        publicApi: "https://api.leetplus.ru",
        publicWeb: "https://leetplus.ru",
      }
    : {
        loopbackApi: "http://127.0.0.1:4200",
        loopbackWeb: "http://127.0.0.1:3200",
        publicApi: "https://api.leetplus.ru",
        publicWeb: "https://leetplus.ru",
      };
}

function validatePlan(plan, { allowLegacyLane = false } = {}) {
  const currentKeys = [
    "baselineCutover",
    "contractVersion",
    "controlAttestationSha256",
    "decision",
    "expectedMigration",
    "expectedMigrationCount",
    "effectiveLane",
    "impactReceiptSha256",
    "operationId",
    "preparedAt",
    "previousMigration",
    "previousMigrationCount",
    "previousReleaseSha",
    "previousWebBuildId",
    "releaseSha",
    "schemaVersion",
    "targetSlot",
    "urls",
    "watchdogSeconds",
  ];
  const legacyKeys = currentKeys.filter(
    (key) => !["effectiveLane", "impactReceiptSha256"].includes(key),
  );
  const observedKeys =
    plan !== null && typeof plan === "object" && !Array.isArray(plan)
      ? Object.keys(plan).sort().join("\0")
      : "";
  const isLegacy =
    observedKeys === legacyKeys.slice().sort().join("\0");
  if (isLegacy) {
    if (!allowLegacyLane) fail("ORCHESTRATOR_PLAN_INVALID");
  } else {
    exactKeys(plan, currentKeys, "ORCHESTRATOR_PLAN_INVALID");
  }
  exactKeys(
    plan.baselineCutover,
    ["generation", "receiptPath", "receiptSha256"],
    "ORCHESTRATOR_PLAN_INVALID",
  );
  exactKeys(
    plan.urls,
    ["loopbackApi", "loopbackWeb", "publicApi", "publicWeb"],
    "ORCHESTRATOR_PLAN_INVALID",
  );
  if (
    plan.schemaVersion !== 1 ||
    plan.contractVersion !== CONTRACT_VERSION ||
    plan.decision !== PLAN_DECISION ||
    !UUID.test(plan.operationId ?? "") ||
    !SHA40.test(plan.releaseSha ?? "") ||
    !["blue", "green"].includes(plan.targetSlot) ||
    !MIGRATION.test(plan.expectedMigration ?? "") ||
    !Number.isSafeInteger(plan.expectedMigrationCount) ||
    plan.expectedMigrationCount < 1 ||
    !SHA40.test(plan.previousReleaseSha ?? "") ||
    !MIGRATION.test(plan.previousMigration ?? "") ||
    !Number.isSafeInteger(plan.previousMigrationCount) ||
    plan.previousMigrationCount < 1 ||
    plan.previousWebBuildId !== plan.previousReleaseSha ||
    !Number.isSafeInteger(plan.watchdogSeconds) ||
    plan.watchdogSeconds < 5 ||
    plan.watchdogSeconds > 60 ||
    !SHA256.test(plan.controlAttestationSha256 ?? "") ||
    (!isLegacy && !TRUSTED_LANES.includes(plan.effectiveLane)) ||
    (!isLegacy && !SHA256.test(plan.impactReceiptSha256 ?? "")) ||
    !Number.isSafeInteger(plan.baselineCutover.generation) ||
    plan.baselineCutover.generation < 1 ||
    !SHA256.test(plan.baselineCutover.receiptSha256 ?? "") ||
    typeof plan.baselineCutover.receiptPath !== "string" ||
    canonicalJson(planUrls(plan.targetSlot)) !== canonicalJson(plan.urls)
  ) {
    fail("ORCHESTRATOR_PLAN_INVALID");
  }
  exactIso(plan.preparedAt, "ORCHESTRATOR_PLAN_INVALID");
  return plan;
}

function effectiveLaneForPlan(plan) {
  return TRUSTED_LANES.includes(plan.effectiveLane)
    ? plan.effectiveLane
    : LEGACY_UNCLASSIFIED_LANE;
}

function validateV2MetricPlan(plan) {
  exactKeys(
    plan,
    [
      "baselineCutover",
      "contractVersion",
      "controlAttestationSha256",
      "decision",
      "expectedMigration",
      "expectedMigrationCount",
      "operationId",
      "preparedAt",
      "previousMigration",
      "previousMigrationCount",
      "previousReleaseSha",
      "previousWebBuildId",
      "releaseSha",
      "schemaVersion",
      "targetSlot",
      "urls",
      "watchdogSeconds",
    ],
    "ORCHESTRATOR_LEGACY_V2_PLAN_INVALID",
  );
  exactKeys(
    plan.baselineCutover,
    ["generation", "receiptPath", "receiptSha256"],
    "ORCHESTRATOR_LEGACY_V2_PLAN_INVALID",
  );
  exactKeys(
    plan.urls,
    ["loopbackApi", "loopbackWeb", "publicApi", "publicWeb"],
    "ORCHESTRATOR_LEGACY_V2_PLAN_INVALID",
  );
  if (
    plan.schemaVersion !== 1 ||
    plan.contractVersion !== V2_CONTRACT_VERSION ||
    plan.decision !== PLAN_DECISION ||
    !UUID.test(plan.operationId ?? "") ||
    !SHA40.test(plan.releaseSha ?? "") ||
    !["blue", "green"].includes(plan.targetSlot) ||
    !MIGRATION.test(plan.expectedMigration ?? "") ||
    !Number.isSafeInteger(plan.expectedMigrationCount) ||
    plan.expectedMigrationCount < 1 ||
    !SHA40.test(plan.previousReleaseSha ?? "") ||
    !MIGRATION.test(plan.previousMigration ?? "") ||
    !Number.isSafeInteger(plan.previousMigrationCount) ||
    plan.previousMigrationCount < 1 ||
    plan.previousWebBuildId !== plan.previousReleaseSha ||
    !Number.isSafeInteger(plan.watchdogSeconds) ||
    plan.watchdogSeconds < 5 ||
    plan.watchdogSeconds > 60 ||
    !SHA256.test(plan.controlAttestationSha256 ?? "") ||
    !Number.isSafeInteger(plan.baselineCutover.generation) ||
    plan.baselineCutover.generation < 1 ||
    !SHA256.test(plan.baselineCutover.receiptSha256 ?? "") ||
    typeof plan.baselineCutover.receiptPath !== "string" ||
    canonicalJson(planUrls(plan.targetSlot)) !== canonicalJson(plan.urls)
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_PLAN_INVALID");
  }
  exactIso(plan.preparedAt, "ORCHESTRATOR_LEGACY_V2_PLAN_INVALID");
  return plan;
}

function validatePhaseRecord(
  record,
  recordType,
  phase,
  index,
  plan,
  planSha256,
  previousReceiptSha256,
) {
  const common = [
    "contractVersion",
    "createdAt",
    "operationId",
    "phase",
    "phaseIndex",
    "planSha256",
    "previousPhaseReceiptSha256",
    "recordType",
    "schemaVersion",
  ];
  const expected =
    recordType === "PHASE_INTENT"
      ? common
      : [
          ...common,
          "acceptedAt",
          "controlAttestationSha256",
          "decision",
          "evidenceSha256",
          "intentSha256",
        ];
  exactKeys(record, expected, "ORCHESTRATOR_PHASE_RECORD_INVALID");
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== recordType ||
    record.operationId !== plan.operationId ||
    record.planSha256 !== planSha256 ||
    record.phase !== phase ||
    record.phaseIndex !== index + 1 ||
    record.previousPhaseReceiptSha256 !== previousReceiptSha256
  ) {
    fail("ORCHESTRATOR_PHASE_RECORD_INVALID");
  }
  exactIso(record.createdAt, "ORCHESTRATOR_PHASE_RECORD_INVALID");
  if (
    recordType === "PHASE_RECEIPT" &&
    (!SHA256.test(record.intentSha256 ?? "") ||
      !SHA256.test(record.evidenceSha256 ?? "") ||
      record.controlAttestationSha256 !== plan.controlAttestationSha256 ||
      record.decision !== "PHASE_ACCEPTED")
  ) {
    fail("ORCHESTRATOR_PHASE_RECORD_INVALID");
  }
  if (recordType === "PHASE_RECEIPT") {
    exactIso(record.acceptedAt, "ORCHESTRATOR_PHASE_RECORD_INVALID");
  }
  return record;
}

function validateEvidenceDetails(details, phase, plan) {
  const schemas = {
    HYDRATE: [
      "commandOutputSha256",
      "hydrationReceiptPath",
      "hydrationReceiptSha256",
      "releaseDirectory",
      "releaseSha",
      "targetSlot",
    ],
    BIND: [
      "commandOutputSha256",
      "quiesceIntentSha256",
      "releaseSha",
      "slotEnvironmentApiBindHostNormalization",
      "slotEnvironmentPath",
      "slotEnvironmentPreviousPath",
      "slotEnvironmentPreviousSha256",
      "slotEnvironmentSha256",
      "slotLinkReceiptPath",
      "slotLinkReceiptSha256",
      "targetSlot",
    ],
    SMOKE: [
      "apiInvocationId",
      "authenticatedSmokeSha256",
      "commandOutputSha256",
      "readinessSha256",
      "releaseSha",
      "targetSlot",
      "unmaskIntentSha256",
      "webInvocationId",
    ],
    CUTOVER: [
      "commandOutputSha256",
      "cutoverReceiptPath",
      "cutoverReceiptSha256",
      "generation",
      "releaseSha",
      "targetSlot",
    ],
    POSTCHECK: [
      "authenticatedSmokeSha256",
      "cutoverReceiptSha256",
      "generation",
      "readinessSha256",
      "releaseSha",
      "targetSlot",
    ],
  };
  exactKeys(details, schemas[phase], "ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  for (const [key, value] of Object.entries(details)) {
    if (
      key.endsWith("Sha256") &&
      (typeof value !== "string" || !SHA256.test(value))
    ) {
      fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
    }
    if (
      key.endsWith("Path") &&
      (typeof value !== "string" || !path.isAbsolute(value))
    ) {
      fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
    }
  }
  if (
    phase === "HYDRATE" &&
    (typeof details.releaseDirectory !== "string" ||
      !path.isAbsolute(details.releaseDirectory))
  ) {
    fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  }
  if (
    phase === "BIND" &&
    !["NONE", "LEGACY_LOCALHOST_TO_IPV4_LOOPBACK"].includes(
      details.slotEnvironmentApiBindHostNormalization,
    )
  ) {
    fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  }
  if (
    ["SMOKE"].includes(phase) &&
    (!INVOCATION_ID.test(details.apiInvocationId) ||
      !INVOCATION_ID.test(details.webInvocationId))
  ) {
    fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  }
  if (
    ["CUTOVER", "POSTCHECK"].includes(phase) &&
    details.generation !== plan.baselineCutover.generation + 1
  ) {
    fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  }
}

function validateEvidence(record, phase, index, plan, planSha256) {
  exactKeys(
    record,
    [
      "contractVersion",
      "controlAttestationSha256",
      "details",
      "observedAt",
      "operationId",
      "phase",
      "phaseIndex",
      "planSha256",
      "recordType",
      "schemaVersion",
    ],
    "ORCHESTRATOR_PHASE_EVIDENCE_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== "PHASE_EVIDENCE" ||
    record.operationId !== plan.operationId ||
    record.planSha256 !== planSha256 ||
    record.phase !== phase ||
    record.phaseIndex !== index + 1 ||
    record.controlAttestationSha256 !== plan.controlAttestationSha256 ||
    record.details === null ||
    typeof record.details !== "object" ||
    Array.isArray(record.details)
  ) {
    fail("ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  }
  exactIso(record.observedAt, "ORCHESTRATOR_PHASE_EVIDENCE_INVALID");
  validateEvidenceDetails(record.details, phase, plan);
  if (
    record.details.releaseSha !== plan.releaseSha ||
    record.details.targetSlot !== plan.targetSlot
  ) {
    fail("ORCHESTRATOR_PHASE_EVIDENCE_TARGET_MISMATCH");
  }
  return record;
}

function validateV2MetricPhaseRecord(
  record,
  recordType,
  phase,
  index,
  plan,
  planSha256,
  previousReceiptSha256,
) {
  const common = [
    "contractVersion",
    "createdAt",
    "operationId",
    "phase",
    "phaseIndex",
    "planSha256",
    "previousPhaseReceiptSha256",
    "recordType",
    "schemaVersion",
  ];
  exactKeys(
    record,
    recordType === "PHASE_INTENT"
      ? common
      : [
          ...common,
          "acceptedAt",
          "controlAttestationSha256",
          "decision",
          "evidenceSha256",
          "intentSha256",
        ],
    "ORCHESTRATOR_LEGACY_V2_PHASE_RECORD_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== V2_CONTRACT_VERSION ||
    record.recordType !== recordType ||
    record.operationId !== plan.operationId ||
    record.planSha256 !== planSha256 ||
    record.phase !== phase ||
    record.phaseIndex !== index + 1 ||
    record.previousPhaseReceiptSha256 !== previousReceiptSha256
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_PHASE_RECORD_INVALID");
  }
  exactIso(record.createdAt, "ORCHESTRATOR_LEGACY_V2_PHASE_RECORD_INVALID");
  if (
    recordType === "PHASE_RECEIPT" &&
    (!SHA256.test(record.intentSha256 ?? "") ||
      !SHA256.test(record.evidenceSha256 ?? "") ||
      record.controlAttestationSha256 !== plan.controlAttestationSha256 ||
      record.decision !== "PHASE_ACCEPTED")
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_PHASE_RECORD_INVALID");
  }
  if (recordType === "PHASE_RECEIPT") {
    exactIso(record.acceptedAt, "ORCHESTRATOR_LEGACY_V2_PHASE_RECORD_INVALID");
  }
  return record;
}

function validateV2MetricEvidenceDetails(details, phase, plan) {
  const schemas = {
    HYDRATE: [
      "commandOutputSha256",
      "hydrationReceiptPath",
      "hydrationReceiptSha256",
      "releaseDirectory",
      "releaseSha",
      "targetSlot",
    ],
    BIND: [
      "commandOutputSha256",
      "quiesceIntentSha256",
      "releaseSha",
      "slotLinkReceiptPath",
      "slotLinkReceiptSha256",
      "targetSlot",
    ],
    SMOKE: [
      "apiInvocationId",
      "authenticatedSmokeSha256",
      "commandOutputSha256",
      "readinessSha256",
      "releaseSha",
      "targetSlot",
      "unmaskIntentSha256",
      "webInvocationId",
    ],
    CUTOVER: [
      "commandOutputSha256",
      "cutoverReceiptPath",
      "cutoverReceiptSha256",
      "generation",
      "releaseSha",
      "targetSlot",
    ],
    POSTCHECK: [
      "authenticatedSmokeSha256",
      "cutoverReceiptSha256",
      "generation",
      "readinessSha256",
      "releaseSha",
      "targetSlot",
    ],
  };
  exactKeys(details, schemas[phase], "ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
  for (const [key, value] of Object.entries(details)) {
    if (
      key.endsWith("Sha256") &&
      (typeof value !== "string" || !SHA256.test(value))
    ) {
      fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
    }
    if (
      key.endsWith("Path") &&
      (typeof value !== "string" || !path.isAbsolute(value))
    ) {
      fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
    }
  }
  if (
    phase === "HYDRATE" &&
    (typeof details.releaseDirectory !== "string" ||
      !path.isAbsolute(details.releaseDirectory))
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
  }
  if (
    phase === "SMOKE" &&
    (!INVOCATION_ID.test(details.apiInvocationId) ||
      !INVOCATION_ID.test(details.webInvocationId))
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
  }
  if (
    ["CUTOVER", "POSTCHECK"].includes(phase) &&
    details.generation !== plan.baselineCutover.generation + 1
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
  }
}

function validateV2MetricEvidence(record, phase, index, plan, planSha256) {
  exactKeys(
    record,
    [
      "contractVersion",
      "controlAttestationSha256",
      "details",
      "observedAt",
      "operationId",
      "phase",
      "phaseIndex",
      "planSha256",
      "recordType",
      "schemaVersion",
    ],
    "ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== V2_CONTRACT_VERSION ||
    record.recordType !== "PHASE_EVIDENCE" ||
    record.operationId !== plan.operationId ||
    record.planSha256 !== planSha256 ||
    record.phase !== phase ||
    record.phaseIndex !== index + 1 ||
    record.controlAttestationSha256 !== plan.controlAttestationSha256 ||
    record.details === null ||
    typeof record.details !== "object" ||
    Array.isArray(record.details)
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
  }
  exactIso(record.observedAt, "ORCHESTRATOR_LEGACY_V2_EVIDENCE_INVALID");
  validateV2MetricEvidenceDetails(record.details, phase, plan);
  if (
    record.details.releaseSha !== plan.releaseSha ||
    record.details.targetSlot !== plan.targetSlot
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_EVIDENCE_TARGET_MISMATCH");
  }
  return record;
}

function createPlan(args, paths) {
  ensureStateRoot(paths, args);
  assertNoOtherIncompleteOperation(paths, args, args.operationId);
  const directory = operationDirectory(paths, args.operationId);
  if (existsSync(directory)) fail("ORCHESTRATOR_OPERATION_ALREADY_EXISTS");
  if (
    outstandingIntent(
      paths.deployReceiptRoot,
      (name) => name.endsWith(".intent") && /-g[0-9]+-/u.test(name),
    ) ||
    outstandingIntent(
      path.join(paths.deployReceiptRoot, "slot-links"),
      (name) => name.startsWith(args.slot + "-") && name.endsWith(".intent"),
    )
  ) {
    fail("ORCHESTRATOR_PENDING_CHILD_OPERATION");
  }
  const control = verifyInstalledControl(
    args.releaseSha,
    paths,
    args,
  );
  const baseline = latestCutover(paths, args);
  if (baseline.consumed) fail("ORCHESTRATOR_BASELINE_ROLLBACK_CONSUMED");
  const activeSlot = currentActiveSlot(paths);
  if (activeSlot === args.slot) {
    fail("ORCHESTRATOR_TARGET_SLOT_ALREADY_ACTIVE");
  }
  if (
    args.previousWebBuildId !== args.previousReleaseSha ||
    baseline.releaseSha !== args.previousReleaseSha ||
    baseline.slot !== activeSlot ||
    baseline.activatedTarget !==
      path.join(paths.nginxRoot, "upstreams", activeSlot + ".conf")
  ) {
    fail("ORCHESTRATOR_PREVIOUS_RUNTIME_MISMATCH");
  }
  mkdirSync(directory, { mode: 0o700 });
  assertDirectory(directory, args, 0o700);
  syncDirectory(paths.stateRoot, args);
  const plan = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    operationId: args.operationId,
    releaseSha: args.releaseSha,
    targetSlot: args.slot,
    expectedMigration: args.expectedMigration,
    expectedMigrationCount: args.expectedMigrationCount,
    previousReleaseSha: args.previousReleaseSha,
    previousMigration: args.previousMigration,
    previousMigrationCount: args.previousMigrationCount,
    previousWebBuildId: args.previousWebBuildId,
    urls: planUrls(args.slot),
    watchdogSeconds: args.watchdogSeconds,
    baselineCutover: {
      generation: baseline.generation,
      receiptPath: baseline.receiptPath,
      receiptSha256: baseline.receiptSha256,
    },
    controlAttestationSha256: control.attestationSha256,
    effectiveLane: control.effectiveLane,
    impactReceiptSha256: control.impactReceiptSha256,
    preparedAt: nowIso(),
    decision: PLAN_DECISION,
  };
  validatePlan(plan);
  const planPath = path.join(directory, "plan.json");
  publishCanonicalJson(planPath, plan, 0o400, args);
  return {
    contractVersion: CONTRACT_VERSION,
    decision: PLAN_DECISION,
    operationId: args.operationId,
    planPath,
    planSha256: canonicalRecordSha256(plan),
  };
}

function readPlan(args, paths) {
  ensureStateRoot(paths, args);
  const directory = operationDirectory(paths, args.operationId);
  assertDirectory(directory, args, 0o700);
  assertInside(
    directory,
    paths.stateRoot,
    "ORCHESTRATOR_OPERATION_PATH_INVALID",
  );
  const planPath = path.join(directory, "plan.json");
  const record = readCanonicalJson(planPath, args, [0o400]);
  const plan = validatePlan(record.value);
  if (
    plan.operationId !== args.operationId ||
    record.sha256 !== args.planSha256
  ) {
    fail("ORCHESTRATOR_PLAN_BINDING_MISMATCH");
  }
  return { directory, plan, planPath, planSha256: record.sha256 };
}

function phasePaths(directory, index, phase) {
  const prefix = phasePrefix(index, phase);
  return {
    evidence: path.join(directory, prefix + ".evidence.json"),
    intent: path.join(directory, prefix + ".intent.json"),
    receipt: path.join(directory, prefix + ".receipt.json"),
  };
}

function readCurrentPhaseChain(context, args) {
  let previousReceiptSha256 = "";
  let completed = 0;
  for (let index = 0; index < PHASES.length; index += 1) {
    const phase = PHASES[index];
    const paths = phasePaths(context.directory, index, phase);
    if (!existsSync(paths.receipt)) break;
    const intent = readCanonicalJson(paths.intent, args, [0o600]);
    validatePhaseRecord(
      intent.value,
      "PHASE_INTENT",
      phase,
      index,
      context.plan,
      context.planSha256,
      previousReceiptSha256,
    );
    const evidence = readCanonicalJson(paths.evidence, args, [0o400]);
    validateEvidence(
      evidence.value,
      phase,
      index,
      context.plan,
      context.planSha256,
    );
    const receipt = readCanonicalJson(paths.receipt, args, [0o400]);
    validatePhaseRecord(
      receipt.value,
      "PHASE_RECEIPT",
      phase,
      index,
      context.plan,
      context.planSha256,
      previousReceiptSha256,
    );
    if (
      receipt.value.intentSha256 !== intent.sha256 ||
      receipt.value.evidenceSha256 !== evidence.sha256
    ) {
      fail("ORCHESTRATOR_PHASE_CHAIN_INVALID");
    }
    previousReceiptSha256 = receipt.sha256;
    completed += 1;
  }
  for (let index = completed + 1; index < PHASES.length; index += 1) {
    const phase = PHASES[index];
    const paths = phasePaths(context.directory, index, phase);
    if (
      existsSync(paths.intent) ||
      existsSync(paths.evidence) ||
      existsSync(paths.receipt)
    ) {
      fail("ORCHESTRATOR_FUTURE_PHASE_RECORD_PRESENT");
    }
  }
  let pendingRecord = "NONE";
  if (completed < PHASES.length) {
    const phase = PHASES[completed];
    const paths = phasePaths(context.directory, completed, phase);
    const hasIntent = existsSync(paths.intent);
    const hasEvidence = existsSync(paths.evidence);
    if (hasEvidence && !hasIntent) {
      fail("ORCHESTRATOR_PHASE_RECORD_ORDER_INVALID");
    }
    if (hasIntent) {
      validatePhaseRecord(
        readCanonicalJson(paths.intent, args, [0o600]).value,
        "PHASE_INTENT",
        phase,
        completed,
        context.plan,
        context.planSha256,
        previousReceiptSha256,
      );
      pendingRecord = "INTENT";
    }
    if (hasEvidence) {
      validateEvidence(
        readCanonicalJson(paths.evidence, args, [0o400]).value,
        phase,
        completed,
        context.plan,
        context.planSha256,
      );
      pendingRecord = "EVIDENCE";
    }
  }
  if (
    completed < PHASES.length &&
    existsSync(path.join(context.directory, "final.json"))
  ) {
    fail("ORCHESTRATOR_PREMATURE_FINAL_RECEIPT");
  }
  return { completed, pendingRecord, previousReceiptSha256 };
}

function readV2MetricPhaseChain(context, args) {
  let previousReceiptSha256 = "";
  let completed = 0;
  for (let index = 0; index < PHASES.length; index += 1) {
    const phase = PHASES[index];
    const records = phasePaths(context.directory, index, phase);
    if (!existsSync(records.receipt)) break;
    const intent = readCanonicalJson(records.intent, args, [0o600]);
    validateV2MetricPhaseRecord(
      intent.value,
      "PHASE_INTENT",
      phase,
      index,
      context.plan,
      context.planSha256,
      previousReceiptSha256,
    );
    const evidence = readCanonicalJson(records.evidence, args, [0o400]);
    validateV2MetricEvidence(
      evidence.value,
      phase,
      index,
      context.plan,
      context.planSha256,
    );
    const receipt = readCanonicalJson(records.receipt, args, [0o400]);
    validateV2MetricPhaseRecord(
      receipt.value,
      "PHASE_RECEIPT",
      phase,
      index,
      context.plan,
      context.planSha256,
      previousReceiptSha256,
    );
    if (
      receipt.value.intentSha256 !== intent.sha256 ||
      receipt.value.evidenceSha256 !== evidence.sha256
    ) {
      fail("ORCHESTRATOR_LEGACY_V2_PHASE_CHAIN_INVALID");
    }
    previousReceiptSha256 = receipt.sha256;
    completed += 1;
  }
  if (completed !== PHASES.length) {
    fail("ORCHESTRATOR_LEGACY_V2_NONTERMINAL_UNSUPPORTED");
  }
  return { completed, previousReceiptSha256 };
}

function readInvocationId(unit, paths, args) {
  const output = runCommand(
    paths.systemctl,
    ["show", "--value", "--property=InvocationID", unit],
    args,
    "ORCHESTRATOR_SYSTEMD_INVOCATION",
    30000,
  ).trim();
  if (!INVOCATION_ID.test(output)) {
    fail("ORCHESTRATOR_SYSTEMD_INVOCATION_INVALID");
  }
  return output;
}

function waitMilliseconds(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runReadiness(
  plan,
  apiUrl,
  webUrl,
  paths,
  args,
  label,
  attempts = 1,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runCommand(
        paths.readiness,
        [
          "--release-sha",
          plan.releaseSha,
          "--expected-migration",
          plan.expectedMigration,
          "--expected-migration-count",
          String(plan.expectedMigrationCount),
          "--expected-web-build-id",
          plan.releaseSha,
          "--api-base-url",
          apiUrl,
          "--web-url",
          webUrl,
        ],
        args,
        label,
        120000,
      );
    } catch (error) {
      if (
        error?.reasonCode !== label + "_FAILED" ||
        attempt === attempts
      ) {
        throw error;
      }
      waitMilliseconds(args.testMode ? 1 : LOOPBACK_READINESS_RETRY_DELAY_MS);
    }
  }
  fail(label + "_FAILED");
}

function runAuthenticated(apiUrl, paths, args, label) {
  return runCommand(
    paths.node,
    [paths.authSmoke, "--base-url", apiUrl],
    args,
    label,
    180000,
  );
}

function hydratePhase(plan, paths, args) {
  const releaseDirectory = path.join(paths.releaseRoot, plan.releaseSha);
  const hydrationReceiptPath = path.join(
    paths.deployReceiptRoot,
    "release-hydration-attestation-" + plan.releaseSha + ".receipt",
  );
  let hydrationOutput = "";
  if (!existsSync(releaseDirectory)) {
    hydrationOutput += runCommand(
      paths.systemctl,
      ["start", "leetplus-release-hydrate@" + plan.releaseSha + ".service"],
      args,
      "ORCHESTRATOR_HYDRATION_UNIT",
      3600000,
    );
  }
  hydrationOutput += runCommand(
    paths.promoter,
    [
      "--release-sha",
      plan.releaseSha,
      "--slot",
      plan.targetSlot,
      "--inherited-production-control-lock-fd",
      String(PRODUCTION_CONTROL_INSTALL_LOCK_FD),
    ],
    args,
    "ORCHESTRATOR_PROMOTION",
    900000,
  );
  if (!existsSync(releaseDirectory) || !existsSync(hydrationReceiptPath)) {
    fail("ORCHESTRATOR_HYDRATION_EVIDENCE_MISSING");
  }
  const releaseDetails = lstatSync(releaseDirectory);
  if (
    !releaseDetails.isDirectory() ||
    releaseDetails.isSymbolicLink() ||
    realpathSync(releaseDirectory) !== releaseDirectory
  ) {
    fail("ORCHESTRATOR_HYDRATION_EVIDENCE_MISSING");
  }
  const receipt = readKeyValueFile(
    hydrationReceiptPath,
    args,
    "ORCHESTRATOR_HYDRATION_RECEIPT_INVALID",
    [0o400],
  );
  exactRecordKeys(
    receipt.values,
    HYDRATION_RECEIPT_KEYS,
    "ORCHESTRATOR_HYDRATION_RECEIPT_INVALID",
  );
  if (
    receipt.values.get("RECORD_VERSION") !== "1" ||
    receipt.values.get("RELEASE_SHA") !== plan.releaseSha ||
    receipt.values.get("RELEASE_SLOT") !== plan.targetSlot ||
    !INVOCATION_ID.test(receipt.values.get("HYDRATION_INVOCATION_ID") ?? "") ||
    [
      "HYDRATION_SOURCE_RECEIPT_SHA256",
      "HYDRATION_UNIT_SHA256",
      "HYDRATION_STAGER_SHA256",
      "HYDRATION_POLICY_SHA256",
      "HYDRATED_MANIFEST_SHA256",
    ].some((key) => !SHA256.test(receipt.values.get(key) ?? "")) ||
    receipt.values.get("RELEASE_DIRECTORY") !== releaseDirectory ||
    receipt.values.get("PUBLICATION_AUTHORIZED") !== "true" ||
    receipt.values.get("RUNTIME_SWITCHED") !== "false"
  ) {
    fail("ORCHESTRATOR_HYDRATION_RECEIPT_INVALID");
  }
  return {
    commandOutputSha256: sha256(hydrationOutput),
    hydrationReceiptPath,
    hydrationReceiptSha256: receipt.sha256,
    releaseDirectory,
    releaseSha: plan.releaseSha,
    targetSlot: plan.targetSlot,
  };
}

function readSystemdProperty(unit, property, paths, args) {
  const output = runCommand(
    paths.systemctl,
    ["show", "--value", "--property=" + property, unit],
    args,
    "ORCHESTRATOR_SYSTEMD_UNIT_BOUNDARY",
    30000,
  );
  if (
    !output.endsWith("\n") ||
    output.includes("\r") ||
    output.slice(0, -1).includes("\n")
  ) {
    fail("ORCHESTRATOR_SYSTEMD_UNIT_BOUNDARY_INVALID");
  }
  return output.slice(0, -1);
}

function assertStoppedInstance(unit, paths, args) {
  if (
    readSystemdProperty(unit, "ActiveState", paths, args) !== "inactive" ||
    readSystemdProperty(unit, "SubState", paths, args) !== "dead" ||
    readSystemdProperty(unit, "MainPID", paths, args) !== "0" ||
    readSystemdProperty(unit, "ControlPID", paths, args) !== "0"
  ) {
    fail("ORCHESTRATOR_TARGET_UNIT_NOT_QUIESCED");
  }
}

function prepareCacheWithRetry(plan, apiUnit, webUnit, paths, args) {
  for (let attempt = 1; attempt <= CACHE_PREPARATION_ATTEMPTS; attempt += 1) {
    try {
      return runCommand(
        paths.cache,
        ["--slot", plan.targetSlot, "--release-sha", plan.releaseSha],
        args,
        "ORCHESTRATOR_CACHE_PREPARATION",
        300000,
      );
    } catch (error) {
      if (
        error?.reasonCode !== "ORCHESTRATOR_CACHE_PREPARATION_FAILED" ||
        attempt === CACHE_PREPARATION_ATTEMPTS
      ) {
        throw error;
      }
      for (const unit of [apiUnit, webUnit]) {
        if (inspectInstanceMask(unit, paths, args) !== "MASKED") {
          fail("ORCHESTRATOR_TARGET_UNIT_MASK_INVALID");
        }
        assertStoppedInstance(unit, paths, args);
      }
      waitMilliseconds(args.testMode ? 1 : CACHE_PREPARATION_RETRY_DELAY_MS);
    }
  }
  fail("ORCHESTRATOR_CACHE_PREPARATION_FAILED");
}

function inspectInstanceMask(unit, paths, args) {
  const loadState = readSystemdProperty(unit, "LoadState", paths, args);
  const unitFileState = readSystemdProperty(
    unit,
    "UnitFileState",
    paths,
    args,
  );
  const maskPath = path.join(paths.systemdUnitRoot, unit);
  let details = null;
  try {
    details = lstatSync(maskPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (!details) {
    if (loadState !== "loaded" || unitFileState !== "enabled") {
      fail("ORCHESTRATOR_TARGET_UNIT_BASELINE_INVALID");
    }
    return "UNMASKED";
  }
  const expectedUid = args.testMode ? process.getuid?.() : 0;
  const expectedGid = args.testMode ? process.getgid?.() : 0;
  let resolvedMask = "";
  try {
    resolvedMask = realpathSync(maskPath);
  } catch {
    fail("ORCHESTRATOR_TARGET_UNIT_MASK_INVALID");
  }
  if (
    !details.isSymbolicLink() ||
    resolvedMask !== "/dev/null" ||
    details.uid !== expectedUid ||
    details.gid !== expectedGid ||
    loadState !== "masked" ||
    unitFileState !== "masked"
  ) {
    fail("ORCHESTRATOR_TARGET_UNIT_MASK_INVALID");
  }
  return "MASKED";
}

function validateSlotTransitionIntent(
  record,
  recordType,
  decision,
  plan,
  phaseIntentSha256,
) {
  exactKeys(
    record,
    [
      "apiUnit",
      "contractVersion",
      "createdAt",
      "decision",
      "operationId",
      "phaseIntentSha256",
      "planSha256",
      "recordType",
      "releaseSha",
      "schemaVersion",
      "targetSlot",
      "webUnit",
    ],
    "ORCHESTRATOR_SLOT_TRANSITION_INTENT_INVALID",
  );
  const apiUnit = "leetplus-api@" + plan.targetSlot + ".service";
  const webUnit = "leetplus-web@" + plan.targetSlot + ".service";
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== recordType ||
    record.operationId !== plan.operationId ||
    record.planSha256 !== canonicalRecordSha256(plan) ||
    record.phaseIntentSha256 !== phaseIntentSha256 ||
    record.releaseSha !== plan.releaseSha ||
    record.targetSlot !== plan.targetSlot ||
    record.apiUnit !== apiUnit ||
    record.webUnit !== webUnit ||
    record.decision !== decision
  ) {
    fail("ORCHESTRATOR_SLOT_TRANSITION_INTENT_INVALID");
  }
  exactIso(record.createdAt, "ORCHESTRATOR_SLOT_TRANSITION_INTENT_INVALID");
}

function ensureSlotTransitionIntent(
  plan,
  paths,
  args,
  phaseIntentSha256,
  options,
) {
  const directory = operationDirectory(paths, plan.operationId);
  const intentPath = path.join(directory, options.fileName);
  const apiUnit = "leetplus-api@" + plan.targetSlot + ".service";
  const webUnit = "leetplus-web@" + plan.targetSlot + ".service";
  let intent;
  if (existsSync(intentPath)) {
    intent = readCanonicalJson(intentPath, args, [0o400]);
    validateSlotTransitionIntent(
      intent.value,
      options.recordType,
      options.decision,
      plan,
      phaseIntentSha256,
    );
  } else {
    for (const unit of [apiUnit, webUnit]) {
      if (inspectInstanceMask(unit, paths, args) !== options.initialState) {
        fail(options.initialStateReason);
      }
    }
    const value = {
      schemaVersion: 1,
      contractVersion: CONTRACT_VERSION,
      recordType: options.recordType,
      operationId: plan.operationId,
      planSha256: canonicalRecordSha256(plan),
      phaseIntentSha256,
      releaseSha: plan.releaseSha,
      targetSlot: plan.targetSlot,
      apiUnit,
      webUnit,
      createdAt: nowIso(),
      decision: options.decision,
    };
    publishCanonicalJson(intentPath, value, 0o400, args);
    intent = { sha256: canonicalRecordSha256(value), value };
  }
  const unitStates = new Map();
  for (const unit of [apiUnit, webUnit]) {
    const state = inspectInstanceMask(unit, paths, args);
    if (!options.allowedStates.includes(state)) {
      fail("ORCHESTRATOR_SLOT_TRANSITION_STATE_INVALID");
    }
    unitStates.set(unit, state);
  }
  return { apiUnit, intentSha256: intent.sha256, unitStates, webUnit };
}

function bindPhase(plan, paths, args, phaseIntentSha256) {
  const apiUnit = "leetplus-api@" + plan.targetSlot + ".service";
  const webUnit = "leetplus-web@" + plan.targetSlot + ".service";
  const quiesce = ensureSlotTransitionIntent(
    plan,
    paths,
    args,
    phaseIntentSha256,
    {
      allowedStates: ["UNMASKED", "MASKED"],
      decision: "TARGET_SLOT_QUIESCE_AUTHORIZED",
      fileName: "02-bind-quiesce.intent.json",
      initialState: "UNMASKED",
      initialStateReason: "ORCHESTRATOR_TARGET_PREEXISTING_MASK",
      recordType: "TARGET_SLOT_QUIESCE_INTENT",
    },
  );
  let commandOutput = "";
  const unitsToMask = [apiUnit, webUnit].filter(
    (unit) => quiesce.unitStates.get(unit) === "UNMASKED",
  );
  if (unitsToMask.length > 0) {
    commandOutput += runCommand(
      paths.systemctl,
      ["--quiet", "mask", "--now", ...unitsToMask],
      args,
      "ORCHESTRATOR_SLOT_QUIESCE",
      180000,
    );
  }
  commandOutput += runCommand(
    paths.systemctl,
    ["stop", apiUnit, webUnit],
    args,
    "ORCHESTRATOR_SLOT_STOP",
    180000,
  );
  commandOutput += runCommand(
    paths.systemctl,
    ["reset-failed", apiUnit, webUnit],
    args,
    "ORCHESTRATOR_SLOT_RESET_FAILED",
    30000,
  );
  for (const unit of [apiUnit, webUnit]) {
    if (inspectInstanceMask(unit, paths, args) !== "MASKED") {
      fail("ORCHESTRATOR_TARGET_UNIT_MASK_INVALID");
    }
    assertStoppedInstance(unit, paths, args);
  }
  commandOutput += prepareCacheWithRetry(
    plan,
    apiUnit,
    webUnit,
    paths,
    args,
  );
  const expectedTarget = path.join(paths.releaseRoot, plan.releaseSha);
  let authority =
    currentSlotTarget(plan.targetSlot, paths) === expectedTarget
      ? latestSlotBinding(plan.targetSlot, plan.releaseSha, paths, args)
      : null;
  if (!authority) {
    const slotJournal = path.join(paths.deployReceiptRoot, "slot-links");
    const pending = outstandingIntent(
      slotJournal,
      (name) =>
        name.startsWith(plan.targetSlot + "-") && name.endsWith(".intent"),
    );
    commandOutput += runCommand(
      paths.binder,
      pending
        ? ["reconcile", "--slot", plan.targetSlot]
        : ["bind", "--slot", plan.targetSlot, "--release-sha", plan.releaseSha],
      args,
      pending ? "ORCHESTRATOR_SLOT_RECONCILE" : "ORCHESTRATOR_SLOT_BIND",
      300000,
    );
    authority = latestSlotBinding(
      plan.targetSlot,
      plan.releaseSha,
      paths,
      args,
    );
  }
  if (
    currentSlotTarget(plan.targetSlot, paths) !== expectedTarget ||
    !authority
  ) {
    fail("ORCHESTRATOR_SLOT_BINDING_NOT_ACCEPTED");
  }
  const slotEnvironment = bindSlotEnvironment(plan, authority, paths, args);
  return {
    commandOutputSha256: sha256(commandOutput),
    quiesceIntentSha256: quiesce.intentSha256,
    releaseSha: plan.releaseSha,
    ...slotEnvironment,
    slotLinkReceiptPath: authority.receiptPath,
    slotLinkReceiptSha256: authority.receiptSha256,
    targetSlot: plan.targetSlot,
  };
}

function smokePhase(plan, paths, args, phaseIntentSha256) {
  const apiUnit = "leetplus-api@" + plan.targetSlot + ".service";
  const webUnit = "leetplus-web@" + plan.targetSlot + ".service";
  const unmask = ensureSlotTransitionIntent(
    plan,
    paths,
    args,
    phaseIntentSha256,
    {
      allowedStates: ["MASKED", "UNMASKED"],
      decision: "TARGET_SLOT_UNMASK_AUTHORIZED",
      fileName: "03-smoke-unmask.intent.json",
      initialState: "MASKED",
      initialStateReason: "ORCHESTRATOR_TARGET_MASK_MISSING",
      recordType: "TARGET_SLOT_UNMASK_INTENT",
    },
  );
  let commandOutput = "";
  const unitsToUnmask = [apiUnit, webUnit].filter(
    (unit) => unmask.unitStates.get(unit) === "MASKED",
  );
  if (unitsToUnmask.length > 0) {
    commandOutput += runCommand(
      paths.systemctl,
      ["--quiet", "unmask", ...unitsToUnmask],
      args,
      "ORCHESTRATOR_SLOT_UNMASK",
      120000,
    );
  }
  for (const unit of [apiUnit, webUnit]) {
    if (inspectInstanceMask(unit, paths, args) !== "UNMASKED") {
      fail("ORCHESTRATOR_TARGET_UNIT_UNMASK_INVALID");
    }
  }
  commandOutput += runCommand(
    paths.systemctl,
    ["enable", apiUnit, webUnit],
    args,
    "ORCHESTRATOR_SYSTEMD_ENABLE",
    120000,
  );
  commandOutput += runCommand(
    paths.systemctl,
    ["start", apiUnit],
    args,
    "ORCHESTRATOR_API_START",
    180000,
  );
  commandOutput += runCommand(
    paths.systemctl,
    ["start", webUnit],
    args,
    "ORCHESTRATOR_WEB_START",
    180000,
  );
  const readiness = runReadiness(
    plan,
    plan.urls.loopbackApi,
    plan.urls.loopbackWeb,
    paths,
    args,
    "ORCHESTRATOR_LOOPBACK_READINESS",
    LOOPBACK_READINESS_ATTEMPTS,
  );
  const authenticated = runAuthenticated(
    plan.urls.loopbackApi,
    paths,
    args,
    "ORCHESTRATOR_LOOPBACK_AUTHENTICATED_SMOKE",
  );
  return {
    apiInvocationId: readInvocationId(apiUnit, paths, args),
    authenticatedSmokeSha256: sha256(authenticated),
    commandOutputSha256: sha256(commandOutput),
    readinessSha256: sha256(readiness),
    releaseSha: plan.releaseSha,
    targetSlot: plan.targetSlot,
    unmaskIntentSha256: unmask.intentSha256,
    webInvocationId: readInvocationId(webUnit, paths, args),
  };
}

function cutoverMatches(current, plan, paths) {
  const previousSlot = plan.targetSlot === "blue" ? "green" : "blue";
  return (
    current.generation === plan.baselineCutover.generation + 1 &&
    current.releaseSha === plan.releaseSha &&
    current.slot === plan.targetSlot &&
    current.activatedTarget ===
      path.join(paths.nginxRoot, "upstreams", plan.targetSlot + ".conf") &&
    current.previousSlot === previousSlot &&
    current.previousTarget ===
      path.join(paths.nginxRoot, "upstreams", previousSlot + ".conf") &&
    current.previousReleaseSha === plan.previousReleaseSha &&
    current.previousMigration === plan.previousMigration &&
    current.previousMigrationCount === plan.previousMigrationCount &&
    current.previousWebBuildId === plan.previousWebBuildId &&
    current.consumed === false
  );
}

function assertCutoverContinuity(plan, paths, args, phaseIndex) {
  const current = latestCutover(paths, args);
  const isBaseline =
    current.generation === plan.baselineCutover.generation &&
    current.receiptPath === plan.baselineCutover.receiptPath &&
    current.receiptSha256 === plan.baselineCutover.receiptSha256 &&
    current.consumed === false;
  const isAcceptedSuccessor = cutoverMatches(current, plan, paths);
  const activeSlot = currentActiveSlot(paths);
  if (
    (!isBaseline && !isAcceptedSuccessor) ||
    (phaseIndex < PHASES.indexOf("CUTOVER") && isAcceptedSuccessor) ||
    (isBaseline && activeSlot !== current.slot) ||
    (isAcceptedSuccessor && activeSlot !== plan.targetSlot)
  ) {
    fail("ORCHESTRATOR_CUTOVER_GENERATION_DRIFT");
  }
}

function cutoverPhase(plan, paths, args) {
  let commandOutput = "";
  const hasPending = outstandingIntent(
    paths.deployReceiptRoot,
    (name) => name.endsWith(".intent") && /-g[0-9]+-/u.test(name),
  );
  if (hasPending) {
    commandOutput += runCommand(
      paths.cutover,
      ["recover-pending"],
      args,
      "ORCHESTRATOR_CUTOVER_RECOVERY",
      600000,
    );
  }
  let current = latestCutover(paths, args);
  if (!cutoverMatches(current, plan, paths)) {
    if (
      current.generation !== plan.baselineCutover.generation ||
      current.receiptSha256 !== plan.baselineCutover.receiptSha256 ||
      current.consumed
    ) {
      fail("ORCHESTRATOR_CUTOVER_GENERATION_DRIFT");
    }
    try {
      commandOutput += runCommand(
        paths.cutover,
        [
          "switch",
          "--slot",
          plan.targetSlot,
          "--release-sha",
          plan.releaseSha,
          "--expected-migration",
          plan.expectedMigration,
          "--expected-migration-count",
          String(plan.expectedMigrationCount),
          "--expected-web-build-id",
          plan.releaseSha,
          "--loopback-api-url",
          plan.urls.loopbackApi,
          "--loopback-web-url",
          plan.urls.loopbackWeb,
          "--public-api-url",
          plan.urls.publicApi,
          "--public-web-url",
          plan.urls.publicWeb,
          "--previous-release-sha",
          plan.previousReleaseSha,
          "--previous-migration",
          plan.previousMigration,
          "--previous-migration-count",
          String(plan.previousMigrationCount),
          "--previous-web-build-id",
          plan.previousWebBuildId,
          "--watchdog-seconds",
          String(plan.watchdogSeconds),
        ],
        args,
        "ORCHESTRATOR_CUTOVER_SWITCH",
        900000,
      );
    } catch (error) {
      if (
        error?.reasonCode !==
        "ORCHESTRATOR_CUTOVER_SWITCH_UNEXPECTED_STDERR"
      ) {
        throw error;
      }
      const accepted = latestCutover(paths, args);
      if (
        !cutoverMatches(accepted, plan, paths) ||
        currentActiveSlot(paths) !== plan.targetSlot
      ) {
        throw error;
      }
    }
    current = latestCutover(paths, args);
  }
  if (
    !cutoverMatches(current, plan, paths) ||
    currentActiveSlot(paths) !== plan.targetSlot
  ) {
    fail("ORCHESTRATOR_CUTOVER_NOT_ACCEPTED");
  }
  return {
    commandOutputSha256: sha256(commandOutput),
    generation: current.generation,
    releaseSha: plan.releaseSha,
    targetSlot: plan.targetSlot,
    cutoverReceiptPath: current.receiptPath,
    cutoverReceiptSha256: current.receiptSha256,
  };
}

function postcheckPhase(plan, paths, args) {
  const current = latestCutover(paths, args);
  if (!cutoverMatches(current, plan, paths)) {
    fail("ORCHESTRATOR_POSTCHECK_CUTOVER_DRIFT");
  }
  const readiness = runReadiness(
    plan,
    plan.urls.publicApi,
    plan.urls.publicWeb,
    paths,
    args,
    "ORCHESTRATOR_PUBLIC_READINESS",
  );
  const authenticated = runAuthenticated(
    plan.urls.publicApi,
    paths,
    args,
    "ORCHESTRATOR_PUBLIC_AUTHENTICATED_SMOKE",
  );
  return {
    authenticatedSmokeSha256: sha256(authenticated),
    cutoverReceiptSha256: current.receiptSha256,
    generation: current.generation,
    readinessSha256: sha256(readiness),
    releaseSha: plan.releaseSha,
    targetSlot: plan.targetSlot,
  };
}

function executePhase(phase, plan, paths, args, phaseIntentSha256) {
  const handlers = {
    HYDRATE: hydratePhase,
    BIND: bindPhase,
    SMOKE: smokePhase,
    CUTOVER: cutoverPhase,
    POSTCHECK: postcheckPhase,
  };
  return handlers[phase](plan, paths, args, phaseIntentSha256);
}

function stableEvidenceDetails(phase, details) {
  if (!["HYDRATE", "BIND", "SMOKE", "CUTOVER"].includes(phase)) {
    return details;
  }
  const { commandOutputSha256: _commandOutputSha256, ...stable } = details;
  return stable;
}

function assertRecoveredEvidenceMatches(phase, recorded, observed) {
  if (
    canonicalJson(stableEvidenceDetails(phase, recorded)) !==
    canonicalJson(stableEvidenceDetails(phase, observed))
  ) {
    fail("ORCHESTRATOR_PHASE_RECOVERY_EVIDENCE_DRIFT");
  }
}

function validateApproval(record, context) {
  exactKeys(
    record,
    [
      "approvedAt",
      "contractVersion",
      "decision",
      "operationId",
      "planSha256",
      "recordType",
      "schemaVersion",
    ],
    "ORCHESTRATOR_APPROVAL_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== "APPLY_APPROVAL" ||
    record.operationId !== context.plan.operationId ||
    record.planSha256 !== context.planSha256 ||
    record.decision !== APPROVAL_DECISION
  ) {
    fail("ORCHESTRATOR_APPROVAL_INVALID");
  }
  exactIso(record.approvedAt, "ORCHESTRATOR_APPROVAL_INVALID");
}

function ensureApproval(context, args, mode) {
  const approvalPath = path.join(context.directory, "approval.json");
  if (existsSync(approvalPath)) {
    const approval = readCanonicalJson(approvalPath, args, [0o400]);
    validateApproval(approval.value, context);
    return approval.sha256;
  }
  if (mode !== "apply") fail("ORCHESTRATOR_APPLY_APPROVAL_MISSING");
  const approval = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "APPLY_APPROVAL",
    operationId: context.plan.operationId,
    planSha256: context.planSha256,
    approvedAt: nowIso(),
    decision: APPROVAL_DECISION,
  };
  publishCanonicalJson(approvalPath, approval, 0o400, args);
  return canonicalRecordSha256(approval);
}

function maybeSimulateLostResponse(phase, context, args) {
  if (
    !args.testMode ||
    process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE !== phase
  ) {
    return;
  }
  const marker = path.join(
    context.directory,
    ".fixture-lost-response-" + phase.toLowerCase(),
  );
  if (existsSync(marker)) return;
  writeFileSync(marker, "fired\n", { flag: "wx", mode: 0o600 });
  fail("ORCHESTRATOR_SIMULATED_LOST_RESPONSE_" + phase);
}

function maybeSimulateLostResponseAfterEvidence(phase, context, args) {
  if (
    !args.testMode ||
    process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_EVIDENCE !== phase
  ) {
    return;
  }
  const marker = path.join(
    context.directory,
    ".fixture-lost-response-after-evidence-" + phase.toLowerCase(),
  );
  if (existsSync(marker)) return;
  writeFileSync(marker, "fired\n", { flag: "wx", mode: 0o600 });
  fail("ORCHESTRATOR_SIMULATED_LOST_RESPONSE_AFTER_EVIDENCE_" + phase);
}

function validateFinalReceipt(record, context, lastReceiptSha256) {
  exactKeys(
    record,
    [
      "completedAt",
      "contractVersion",
      "decision",
      "lastPhaseReceiptSha256",
      "operationId",
      "planSha256",
      "recordType",
      "releaseSha",
      "schemaVersion",
      "targetSlot",
    ],
    "ORCHESTRATOR_FINAL_RECEIPT_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== "ROLLOUT_RECEIPT" ||
    record.operationId !== context.plan.operationId ||
    record.planSha256 !== context.planSha256 ||
    record.releaseSha !== context.plan.releaseSha ||
    record.targetSlot !== context.plan.targetSlot ||
    record.lastPhaseReceiptSha256 !== lastReceiptSha256 ||
    record.decision !== COMPLETE_DECISION
  ) {
    fail("ORCHESTRATOR_FINAL_RECEIPT_INVALID");
  }
  exactIso(record.completedAt, "ORCHESTRATOR_FINAL_RECEIPT_INVALID");
  return record;
}

function validateV2MetricApproval(record, context) {
  exactKeys(
    record,
    [
      "approvedAt",
      "contractVersion",
      "decision",
      "operationId",
      "planSha256",
      "recordType",
      "schemaVersion",
    ],
    "ORCHESTRATOR_LEGACY_V2_APPROVAL_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== V2_CONTRACT_VERSION ||
    record.recordType !== "APPLY_APPROVAL" ||
    record.operationId !== context.plan.operationId ||
    record.planSha256 !== context.planSha256 ||
    record.decision !== APPROVAL_DECISION
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_APPROVAL_INVALID");
  }
  exactIso(record.approvedAt, "ORCHESTRATOR_LEGACY_V2_APPROVAL_INVALID");
  return record;
}

function validateV2MetricFinalReceipt(record, context, lastReceiptSha256) {
  exactKeys(
    record,
    [
      "completedAt",
      "contractVersion",
      "decision",
      "lastPhaseReceiptSha256",
      "operationId",
      "planSha256",
      "recordType",
      "releaseSha",
      "schemaVersion",
      "targetSlot",
    ],
    "ORCHESTRATOR_LEGACY_V2_FINAL_RECEIPT_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== V2_CONTRACT_VERSION ||
    record.recordType !== "ROLLOUT_RECEIPT" ||
    record.operationId !== context.plan.operationId ||
    record.planSha256 !== context.planSha256 ||
    record.releaseSha !== context.plan.releaseSha ||
    record.targetSlot !== context.plan.targetSlot ||
    record.lastPhaseReceiptSha256 !== lastReceiptSha256 ||
    record.decision !== COMPLETE_DECISION
  ) {
    fail("ORCHESTRATOR_LEGACY_V2_FINAL_RECEIPT_INVALID");
  }
  exactIso(record.completedAt, "ORCHESTRATOR_LEGACY_V2_FINAL_RECEIPT_INVALID");
  return record;
}

function readValidatedFinalReceipt(context, lastReceiptSha256, args) {
  const finalPath = path.join(context.directory, "final.json");
  const final = readCanonicalJson(finalPath, args, [0o400]);
  validateFinalReceipt(final.value, context, lastReceiptSha256);
  return { path: finalPath, sha256: final.sha256 };
}

function assertNoOtherIncompleteOperation(paths, args, operationId) {
  const entries = readdirSync(paths.stateRoot, { withFileTypes: true });
  if (entries.length > MAX_OPERATION_ENTRIES) {
    fail("ORCHESTRATOR_STATE_INVENTORY_OVERSIZED");
  }
  for (const entry of entries) {
    if (entry.name === "orchestrator.lock") {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        fail("ORCHESTRATOR_STATE_INVENTORY_INVALID");
      }
      continue;
    }
    if (entry.name === operationId) continue;
    if (
      !UUID.test(entry.name) ||
      !entry.isDirectory() ||
      entry.isSymbolicLink()
    ) {
      fail("ORCHESTRATOR_STATE_INVENTORY_INVALID");
    }
    const directory = operationDirectory(paths, entry.name);
    assertDirectory(directory, args, 0o700);
    const planRecord = readCanonicalJson(
      path.join(directory, "plan.json"),
      args,
      [0o400],
    );
    const isV2 = planRecord.value?.contractVersion === V2_CONTRACT_VERSION;
    const plan = isV2
      ? validateV2MetricPlan(planRecord.value)
      : validatePlan(planRecord.value, { allowLegacyLane: true });
    if (plan.operationId !== entry.name) {
      fail("ORCHESTRATOR_STATE_INVENTORY_INVALID");
    }
    const context = {
      directory,
      plan,
      planPath: path.join(directory, "plan.json"),
      planSha256: planRecord.sha256,
    };
    const chain = isV2
      ? readV2MetricPhaseChain(context, args)
      : readCurrentPhaseChain(context, args);
    if (
      chain.completed !== PHASES.length ||
      !existsSync(path.join(directory, "final.json"))
    ) {
      fail("ORCHESTRATOR_OTHER_OPERATION_INCOMPLETE");
    }
    const final = readCanonicalJson(
      path.join(directory, "final.json"),
      args,
      [0o400],
    );
    if (isV2) {
      validateV2MetricFinalReceipt(
        final.value,
        context,
        chain.previousReceiptSha256,
      );
    } else {
      validateFinalReceipt(final.value, context, chain.previousReceiptSha256);
    }
  }
}

function createFinalReceipt(context, lastReceiptSha256, args) {
  const finalPath = path.join(context.directory, "final.json");
  if (existsSync(finalPath)) {
    return readValidatedFinalReceipt(context, lastReceiptSha256, args);
  }
  const final = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_RECEIPT",
    operationId: context.plan.operationId,
    planSha256: context.planSha256,
    releaseSha: context.plan.releaseSha,
    targetSlot: context.plan.targetSlot,
    lastPhaseReceiptSha256: lastReceiptSha256,
    completedAt: nowIso(),
    decision: COMPLETE_DECISION,
  };
  publishCanonicalJson(finalPath, final, 0o400, args);
  return { path: finalPath, sha256: canonicalRecordSha256(final) };
}

function runPipeline(context, paths, args) {
  const approvalSha256 = ensureApproval(context, args, args.mode);
  let chain = readCurrentPhaseChain(context, args);
  while (chain.completed < PHASES.length) {
    const index = chain.completed;
    const phase = PHASES[index];
    assertCutoverContinuity(context.plan, paths, args, index);
    const records = phasePaths(context.directory, index, phase);
    let intent;
    if (existsSync(records.intent)) {
      intent = readCanonicalJson(records.intent, args, [0o600]);
      validatePhaseRecord(
        intent.value,
        "PHASE_INTENT",
        phase,
        index,
        context.plan,
        context.planSha256,
        chain.previousReceiptSha256,
      );
    } else {
      const value = {
        schemaVersion: 1,
        contractVersion: CONTRACT_VERSION,
        recordType: "PHASE_INTENT",
        operationId: context.plan.operationId,
        planSha256: context.planSha256,
        phaseIndex: index + 1,
        phase,
        previousPhaseReceiptSha256: chain.previousReceiptSha256,
        createdAt: nowIso(),
      };
      publishCanonicalJson(records.intent, value, 0o600, args);
      intent = {
        sha256: canonicalRecordSha256(value),
        value,
      };
    }
    let evidence;
    if (existsSync(records.evidence)) {
      evidence = readCanonicalJson(records.evidence, args, [0o400]);
      validateEvidence(
        evidence.value,
        phase,
        index,
        context.plan,
        context.planSha256,
      );
      const beforeControl = verifyInstalledControl(
        context.plan.releaseSha,
        paths,
        args,
      );
      assertControlAttestationMatches(beforeControl, context.plan);
      const observed = executePhase(
        phase,
        context.plan,
        paths,
        args,
        intent.sha256,
      );
      validateEvidenceDetails(observed, phase, context.plan);
      const afterControl = verifyInstalledControl(
        context.plan.releaseSha,
        paths,
        args,
      );
      assertControlAttestationMatches(afterControl, context.plan);
      assertRecoveredEvidenceMatches(phase, evidence.value.details, observed);
    } else {
      const beforeControl = verifyInstalledControl(
        context.plan.releaseSha,
        paths,
        args,
      );
      assertControlAttestationMatches(beforeControl, context.plan);
      const details = executePhase(
        phase,
        context.plan,
        paths,
        args,
        intent.sha256,
      );
      maybeSimulateLostResponse(phase, context, args);
      const afterControl = verifyInstalledControl(
        context.plan.releaseSha,
        paths,
        args,
      );
      assertControlAttestationMatches(afterControl, context.plan);
      const value = {
        schemaVersion: 1,
        contractVersion: CONTRACT_VERSION,
        recordType: "PHASE_EVIDENCE",
        operationId: context.plan.operationId,
        planSha256: context.planSha256,
        phaseIndex: index + 1,
        phase,
        controlAttestationSha256: afterControl.attestationSha256,
        observedAt: nowIso(),
        details,
      };
      validateEvidence(value, phase, index, context.plan, context.planSha256);
      publishCanonicalJson(records.evidence, value, 0o400, args);
      evidence = {
        sha256: canonicalRecordSha256(value),
        value,
      };
    }
    maybeSimulateLostResponseAfterEvidence(phase, context, args);
    if (!existsSync(records.receipt)) {
      const receipt = {
        schemaVersion: 1,
        contractVersion: CONTRACT_VERSION,
        recordType: "PHASE_RECEIPT",
        operationId: context.plan.operationId,
        planSha256: context.planSha256,
        phaseIndex: index + 1,
        phase,
        previousPhaseReceiptSha256: chain.previousReceiptSha256,
        createdAt: intent.value.createdAt,
        intentSha256: intent.sha256,
        evidenceSha256: evidence.sha256,
        controlAttestationSha256: context.plan.controlAttestationSha256,
        acceptedAt: nowIso(),
        decision: "PHASE_ACCEPTED",
      };
      publishCanonicalJson(records.receipt, receipt, 0o400, args);
    }
    chain = readCurrentPhaseChain(context, args);
  }
  const final = createFinalReceipt(context, chain.previousReceiptSha256, args);
  return {
    approvalSha256,
    completedPhases: PHASES.length,
    contractVersion: CONTRACT_VERSION,
    decision: COMPLETE_DECISION,
    finalReceiptPath: final.path,
    finalReceiptSha256: final.sha256,
    operationId: context.plan.operationId,
    releaseSha: context.plan.releaseSha,
    targetSlot: context.plan.targetSlot,
  };
}

function status(context, args) {
  const approvalPath = path.join(context.directory, "approval.json");
  const approved = existsSync(approvalPath);
  if (approved) {
    validateApproval(
      readCanonicalJson(approvalPath, args, [0o400]).value,
      context,
    );
  }
  const chain = readCurrentPhaseChain(context, args);
  const phasesComplete = chain.completed === PHASES.length;
  const finalPresent = existsSync(path.join(context.directory, "final.json"));
  if (finalPresent && !phasesComplete) {
    fail("ORCHESTRATOR_PREMATURE_FINAL_RECEIPT");
  }
  if (phasesComplete && finalPresent) {
    readValidatedFinalReceipt(context, chain.previousReceiptSha256, args);
  }
  const complete = phasesComplete && finalPresent;
  return {
    approved,
    completedPhases: chain.completed,
    contractVersion: CONTRACT_VERSION,
    decision: complete
      ? COMPLETE_DECISION
      : phasesComplete
        ? "ROLLOUT_PHASES_ACCEPTED_FINAL_PENDING"
        : "ROLLOUT_INCOMPLETE",
    nextPhase: phasesComplete ? null : PHASES[chain.completed],
    operationId: context.plan.operationId,
    pendingRecord: complete
      ? "NONE"
      : phasesComplete
        ? "FINAL"
        : chain.pendingRecord,
    planSha256: context.planSha256,
    releaseSha: context.plan.releaseSha,
    targetSlot: context.plan.targetSlot,
  };
}

const METRIC_REASON_CLASSES = Object.freeze([
  "NONE",
  "PRECHECK",
  "CONTROL_DRIFT",
  "CHILD_COMMAND",
  "RETRY_EXHAUSTED",
  "RECOVERY_DRIFT",
  "RECEIPT_INTEGRITY",
  "UNEXPECTED_FAIL_CLOSED",
]);

function ensureMetricsRoot(paths, args) {
  assertDirectory(paths.deployReceiptRoot, args, 0o700);
  if (!existsSync(paths.metricsRoot)) {
    mkdirSync(paths.metricsRoot, { mode: 0o700 });
  }
  assertDirectory(paths.metricsRoot, args, 0o700);
}

function normalizeMetricReasonClass(reasonCode) {
  if (reasonCode === "ORCHESTRATOR_UNEXPECTED_FAILURE") {
    return "UNEXPECTED_FAIL_CLOSED";
  }
  if (reasonCode.includes("CONTROL_") || reasonCode.includes("ATTESTATION")) {
    return "CONTROL_DRIFT";
  }
  if (reasonCode.includes("RECOVERY") || reasonCode.includes("LOST_RESPONSE")) {
    return "RECOVERY_DRIFT";
  }
  if (reasonCode.includes("RETRY") || reasonCode.includes("READINESS")) {
    return "RETRY_EXHAUSTED";
  }
  if (
    reasonCode.includes("COMMAND") ||
    reasonCode.includes("SYSTEMD") ||
    reasonCode.includes("CACHE") ||
    reasonCode.includes("CUTOVER")
  ) {
    return "CHILD_COMMAND";
  }
  if (
    reasonCode.includes("RECORD") ||
    reasonCode.includes("RECEIPT") ||
    reasonCode.includes("PLAN_") ||
    reasonCode.includes("PHASE_")
  ) {
    return "RECEIPT_INTEGRITY";
  }
  return "PRECHECK";
}

function validateMetricAttempt(record) {
  exactKeys(
    record,
    [
      "attemptFinishedAt",
      "attemptMode",
      "attemptStartedAt",
      "contractVersion",
      "effectiveLane",
      "failurePhase",
      "outcome",
      "reasonClass",
      "recordType",
      "schemaVersion",
    ],
    "ORCHESTRATOR_METRIC_ATTEMPT_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== "ROLLOUT_ATTEMPT_METRIC" ||
    !["apply", "resume"].includes(record.attemptMode) ||
    !TRUSTED_LANES.includes(record.effectiveLane) ||
    !["COMPLETED", "BLOCKED"].includes(record.outcome) ||
    !METRIC_REASON_CLASSES.includes(record.reasonClass) ||
    !["NONE", ...METRIC_FAILURE_PHASES].includes(record.failurePhase) ||
    (record.outcome === "COMPLETED" &&
      (record.failurePhase !== "NONE" || record.reasonClass !== "NONE")) ||
    (record.outcome === "BLOCKED" &&
      (record.reasonClass === "NONE" || record.failurePhase === "NONE"))
  ) {
    fail("ORCHESTRATOR_METRIC_ATTEMPT_INVALID");
  }
  const started = Date.parse(
    exactIso(record.attemptStartedAt, "ORCHESTRATOR_METRIC_ATTEMPT_INVALID"),
  );
  const finished = Date.parse(
    exactIso(record.attemptFinishedAt, "ORCHESTRATOR_METRIC_ATTEMPT_INVALID"),
  );
  if (finished < started) fail("ORCHESTRATOR_METRIC_ATTEMPT_INVALID");
  return record;
}

function writeAttemptMetric(paths, args, attempt) {
  if (!TRUSTED_LANES.includes(attempt.effectiveLane)) return;
  ensureMetricsRoot(paths, args);
  const record = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_ATTEMPT_METRIC",
    attemptMode: args.mode,
    attemptStartedAt: attempt.startedAt,
    attemptFinishedAt: nowIso(),
    effectiveLane: attempt.effectiveLane,
    outcome: attempt.outcome,
    failurePhase: attempt.failurePhase,
    reasonClass: attempt.reasonClass,
  };
  validateMetricAttempt(record);
  publishCanonicalJson(
    path.join(paths.metricsRoot, randomUUID() + ".json"),
    record,
    0o400,
    args,
  );
}

function currentAttemptFailurePhase(context, args) {
  if (context === undefined) return "PRECHECK";
  try {
    const chain = readCurrentPhaseChain(context, args);
    return chain.completed === PHASES.length
      ? "POSTCHECK"
      : PHASES[chain.completed];
  } catch {
    return "PRECHECK";
  }
}

function durationMilliseconds(start, end, reasonCode) {
  const startMilliseconds = Date.parse(exactIso(start, reasonCode));
  const endMilliseconds = Date.parse(exactIso(end, reasonCode));
  if (endMilliseconds < startMilliseconds) fail(reasonCode);
  return endMilliseconds - startMilliseconds;
}

function metricOperationInventory(paths, args) {
  assertDirectory(paths.deployReceiptRoot, args, 0o700);
  assertDirectory(paths.stateRoot, args, 0o700);
  const entries = readdirSync(paths.stateRoot, { withFileTypes: true });
  if (entries.length > MAX_OPERATION_ENTRIES) {
    fail("ORCHESTRATOR_STATE_INVENTORY_OVERSIZED");
  }
  const result = [];
  for (const entry of entries) {
    if (entry.name === "orchestrator.lock") {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        fail("ORCHESTRATOR_STATE_INVENTORY_INVALID");
      }
      continue;
    }
    if (!UUID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) {
      fail("ORCHESTRATOR_STATE_INVENTORY_INVALID");
    }
    const directory = operationDirectory(paths, entry.name);
    assertDirectory(directory, args, 0o700);
    const planRecord = readCanonicalJson(
      path.join(directory, "plan.json"),
      args,
      [0o400],
    );
    const isV2 = planRecord.value?.contractVersion === V2_CONTRACT_VERSION;
    const plan = isV2
      ? validateV2MetricPlan(planRecord.value)
      : validatePlan(planRecord.value, { allowLegacyLane: true });
    if (plan.operationId !== entry.name) {
      fail("ORCHESTRATOR_STATE_INVENTORY_INVALID");
    }
    const context = {
      directory,
      plan,
      planPath: path.join(directory, "plan.json"),
      planSha256: planRecord.sha256,
    };
    const chain = isV2
      ? readV2MetricPhaseChain(context, args)
      : readCurrentPhaseChain(context, args);
    const lane = effectiveLaneForPlan(plan);
    const finalPath = path.join(directory, "final.json");
    const approvalPath = path.join(directory, "approval.json");
    let approval;
    if (existsSync(approvalPath)) {
      approval = readCanonicalJson(approvalPath, args, [0o400]);
      if (isV2) {
        validateV2MetricApproval(approval.value, context);
      } else {
        validateApproval(approval.value, context);
      }
    }
    if (isV2 && !existsSync(finalPath)) {
      fail("ORCHESTRATOR_LEGACY_V2_NONTERMINAL_UNSUPPORTED");
    }
    if (chain.completed !== PHASES.length || !existsSync(finalPath)) {
      if (existsSync(finalPath)) fail("ORCHESTRATOR_PREMATURE_FINAL_RECEIPT");
      result.push({ lane, state: "UNRESOLVED" });
      continue;
    }
    const final = readCanonicalJson(finalPath, args, [0o400]);
    if (isV2) {
      validateV2MetricFinalReceipt(
        final.value,
        context,
        chain.previousReceiptSha256,
      );
    } else {
      validateFinalReceipt(final.value, context, chain.previousReceiptSha256);
    }
    if (approval === undefined) {
      fail(
        isV2
          ? "ORCHESTRATOR_LEGACY_V2_APPROVAL_INVALID"
          : "ORCHESTRATOR_APPROVAL_INVALID",
      );
    }
    const phaseDurations = {};
    for (let index = 0; index < PHASES.length; index += 1) {
      const phase = PHASES[index];
      const receipt = readCanonicalJson(
        phasePaths(directory, index, phase).receipt,
        args,
        [0o400],
      );
      phaseDurations[phase] = durationMilliseconds(
        receipt.value.createdAt,
        receipt.value.acceptedAt,
        "ORCHESTRATOR_METRIC_OPERATION_INVALID",
      );
    }
    result.push({
      approvalToFinalMilliseconds: durationMilliseconds(
        approval.value.approvedAt,
        final.value.completedAt,
        "ORCHESTRATOR_METRIC_OPERATION_INVALID",
      ),
      lane,
      phaseDurations,
      state: "COMPLETED",
    });
  }
  return result;
}

function validateMetricSourceReference(value, reasonCode) {
  exactKeys(value, ["fileName", "fileSha256"], reasonCode);
  if (
    !METRIC_ATTEMPT_FILE.test(value.fileName) ||
    !SHA256.test(value.fileSha256)
  ) {
    fail(reasonCode);
  }
  return value;
}

function metricSourceReferences(entries) {
  return entries.map(({ fileName, fileSha256 }) => ({ fileName, fileSha256 }));
}

function metricSourceSetSha256(entries) {
  return sha256(canonicalJson(metricSourceReferences(entries)));
}

function metricInventorySha256(entries) {
  const references = metricSourceReferences(entries).sort((left, right) =>
    compareCanonicalText(left.fileName, right.fileName),
  );
  return sha256(canonicalJson(references));
}

function validateMetricRetentionPlan(plan) {
  exactKeys(
    plan,
    [
      "activeAttemptCount",
      "archiveAttemptCount",
      "archiveInventorySha256",
      "cleanupEntries",
      "contractVersion",
      "decision",
      "liveInventorySha256",
      "recordType",
      "retainAttemptCount",
      "replayLiveDriftPolicy",
      "retainedAttemptCount",
      "retainedInventorySha256",
      "schemaVersion",
      "segments",
      "selectedAttemptCount",
    ],
    "ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID",
  );
  if (
    plan.schemaVersion !== 1 ||
    plan.contractVersion !== CONTRACT_VERSION ||
    plan.recordType !== "ROLLOUT_ATTEMPT_METRIC_RETENTION_PLAN" ||
    !SHA256.test(plan.archiveInventorySha256) ||
    !SHA256.test(plan.liveInventorySha256) ||
    !SHA256.test(plan.retainedInventorySha256) ||
    plan.replayLiveDriftPolicy !==
      "EXACT_RETAINED_PLUS_OPTIONAL_PLANNED_SOURCES" ||
    !Array.isArray(plan.cleanupEntries) ||
    !Array.isArray(plan.segments)
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
  }
  exactInteger(
    plan.retainAttemptCount,
    1,
    MAX_METRIC_ATTEMPT_ENTRIES - 1,
    "ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID",
  );
  for (const key of [
    "activeAttemptCount",
    "archiveAttemptCount",
    "retainedAttemptCount",
    "selectedAttemptCount",
  ]) {
    exactInteger(
      plan[key],
      0,
      Number.MAX_SAFE_INTEGER,
      "ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID",
    );
  }
  if (
    plan.activeAttemptCount !==
      plan.retainedAttemptCount + plan.selectedAttemptCount ||
    plan.selectedAttemptCount > MAX_METRIC_RETENTION_PLAN_ENTRIES ||
    plan.archiveAttemptCount + plan.selectedAttemptCount >
      MAX_METRIC_ARCHIVED_ATTEMPTS ||
    plan.cleanupEntries.length + plan.selectedAttemptCount >
      MAX_METRIC_RETENTION_PLAN_ENTRIES
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
  }
  const seen = new Set();
  for (const entry of plan.cleanupEntries) {
    validateMetricSourceReference(
      entry,
      "ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID",
    );
    if (seen.has(entry.fileName)) {
      fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
    }
    seen.add(entry.fileName);
  }
  let selectedAttemptCount = 0;
  for (let index = 0; index < plan.segments.length; index += 1) {
    const segment = plan.segments[index];
    exactKeys(
      segment,
      ["segmentIndex", "sourceEntries", "sourceEntryCount", "sourceSetSha256"],
      "ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID",
    );
    if (
      segment.segmentIndex !== index + 1 ||
      !Array.isArray(segment.sourceEntries) ||
      segment.sourceEntries.length < 1 ||
      segment.sourceEntries.length > METRIC_ARCHIVE_SEGMENT_ENTRIES ||
      segment.sourceEntryCount !== segment.sourceEntries.length ||
      !SHA256.test(segment.sourceSetSha256)
    ) {
      fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
    }
    for (const entry of segment.sourceEntries) {
      validateMetricSourceReference(
        entry,
        "ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID",
      );
      if (seen.has(entry.fileName)) {
        fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
      }
      seen.add(entry.fileName);
    }
    if (metricSourceSetSha256(segment.sourceEntries) !== segment.sourceSetSha256) {
      fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
    }
    selectedAttemptCount += segment.sourceEntryCount;
  }
  if (
    selectedAttemptCount !== plan.selectedAttemptCount ||
    (selectedAttemptCount === 0 && plan.segments.length !== 0)
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
  }
  const expectedDecision =
    selectedAttemptCount + plan.cleanupEntries.length === 0
      ? METRIC_RETENTION_NOOP_DECISION
      : METRIC_RETENTION_PLAN_DECISION;
  if (plan.decision !== expectedDecision) {
    fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_INVALID");
  }
  return plan;
}

function validateMetricArchiveManifest(record, filePlanSha256) {
  exactKeys(
    record,
    ["contractVersion", "plan", "planSha256", "recordType", "schemaVersion"],
    "ORCHESTRATOR_METRIC_ARCHIVE_MANIFEST_INVALID",
  );
  const plan = validateMetricRetentionPlan(record.plan);
  if (
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== "ROLLOUT_ATTEMPT_METRIC_RETENTION_MANIFEST" ||
    record.planSha256 !== filePlanSha256 ||
    canonicalRecordSha256(plan) !== record.planSha256 ||
    plan.decision === METRIC_RETENTION_NOOP_DECISION
  ) {
    fail("ORCHESTRATOR_METRIC_ARCHIVE_MANIFEST_INVALID");
  }
  return record;
}

function validateMetricArchiveSegment(record, plan, planSha256, segmentIndex) {
  exactKeys(
    record,
    [
      "contractVersion",
      "planSha256",
      "recordType",
      "schemaVersion",
      "segmentCount",
      "segmentIndex",
      "sourceEntries",
      "sourceEntryCount",
      "sourceSetSha256",
    ],
    "ORCHESTRATOR_METRIC_ARCHIVE_SEGMENT_INVALID",
  );
  const expected = plan.segments[segmentIndex - 1];
  if (
    expected === undefined ||
    record.schemaVersion !== 1 ||
    record.contractVersion !== CONTRACT_VERSION ||
    record.recordType !== "ROLLOUT_ATTEMPT_METRIC_ARCHIVE_SEGMENT" ||
    record.planSha256 !== planSha256 ||
    record.segmentIndex !== segmentIndex ||
    record.segmentCount !== plan.segments.length ||
    record.sourceEntryCount !== expected.sourceEntryCount ||
    record.sourceSetSha256 !== expected.sourceSetSha256 ||
    !Array.isArray(record.sourceEntries) ||
    record.sourceEntries.length !== expected.sourceEntryCount
  ) {
    fail("ORCHESTRATOR_METRIC_ARCHIVE_SEGMENT_INVALID");
  }
  const references = [];
  const metrics = [];
  for (let index = 0; index < record.sourceEntries.length; index += 1) {
    const entry = record.sourceEntries[index];
    exactKeys(
      entry,
      ["fileName", "fileSha256", "metric"],
      "ORCHESTRATOR_METRIC_ARCHIVE_SEGMENT_INVALID",
    );
    const reference = validateMetricSourceReference(
      { fileName: entry.fileName, fileSha256: entry.fileSha256 },
      "ORCHESTRATOR_METRIC_ARCHIVE_SEGMENT_INVALID",
    );
    const metric = validateMetricAttempt(entry.metric);
    if (
      canonicalRecordSha256(metric) !== reference.fileSha256 ||
      canonicalJson(reference) !== canonicalJson(expected.sourceEntries[index])
    ) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_SEGMENT_INVALID");
    }
    references.push(reference);
    metrics.push({ ...reference, metric });
  }
  if (metricSourceSetSha256(references) !== record.sourceSetSha256) {
    fail("ORCHESTRATOR_METRIC_ARCHIVE_SEGMENT_INVALID");
  }
  return metrics;
}

function metricRetentionReceipt(plan, planSha256) {
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_ATTEMPT_METRIC_RETENTION_RECEIPT",
    planSha256,
    archiveSegmentCount: plan.segments.length,
    archivedAttemptCount: plan.selectedAttemptCount,
    cleanupAttemptCount: plan.cleanupEntries.length,
    retainedAttemptCount: plan.retainedAttemptCount,
    decision: METRIC_RETENTION_APPLIED_DECISION,
  };
}

function metricRetentionNoopResult(plan, planSha256) {
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_ATTEMPT_METRIC_RETENTION_RESULT",
    planSha256,
    archiveSegmentCount: 0,
    archivedAttemptCount: 0,
    cleanupAttemptCount: 0,
    retainedAttemptCount: plan.retainedAttemptCount,
    decision: METRIC_RETENTION_NOOP_DECISION,
  };
}

function validateMetricRetentionReceipt(record, plan, planSha256) {
  exactKeys(
    record,
    [
      "archiveSegmentCount",
      "archivedAttemptCount",
      "cleanupAttemptCount",
      "contractVersion",
      "decision",
      "planSha256",
      "recordType",
      "retainedAttemptCount",
      "schemaVersion",
    ],
    "ORCHESTRATOR_METRIC_ARCHIVE_RECEIPT_INVALID",
  );
  if (canonicalJson(record) !== canonicalJson(metricRetentionReceipt(plan, planSha256))) {
    fail("ORCHESTRATOR_METRIC_ARCHIVE_RECEIPT_INVALID");
  }
  return record;
}

function metricArchiveFileName(planSha256, kind, segmentIndex = 0) {
  if (kind === "manifest") return planSha256 + ".manifest.json";
  if (kind === "receipt") return planSha256 + ".receipt.json";
  return (
    planSha256 +
    "." +
    String(segmentIndex).padStart(4, "0") +
    ".segment.json"
  );
}

function readLiveMetricAttemptEntries(paths, args) {
  if (!existsSync(paths.metricsRoot)) return [];
  assertDirectory(paths.metricsRoot, args, 0o700);
  const entries = readdirSync(paths.metricsRoot, { withFileTypes: true });
  if (entries.length > MAX_METRIC_ATTEMPT_ENTRIES) {
    fail("ORCHESTRATOR_METRIC_ATTEMPT_INVENTORY_OVERSIZED");
  }
  return entries
    .map((entry) => {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !METRIC_ATTEMPT_FILE.test(entry.name)
      ) {
        fail("ORCHESTRATOR_METRIC_ATTEMPT_INVENTORY_INVALID");
      }
      const record = readCanonicalJson(
        path.join(paths.metricsRoot, entry.name),
        args,
        [0o400],
      );
      return {
        fileName: entry.name,
        fileSha256: record.sha256,
        metric: validateMetricAttempt(record.value),
      };
    })
    .sort((left, right) => compareCanonicalText(left.fileName, right.fileName));
}

function readMetricArchiveInventory(
  paths,
  args,
  { allowIncompletePlanSha256 } = {},
) {
  if (!existsSync(paths.metricsArchiveRoot)) {
    return {
      attempts: [],
      baseFileInventory: [],
      fileInventory: [],
      sourceByName: new Map(),
      target: undefined,
      totalBytes: 0,
      baseTotalBytes: 0,
    };
  }
  assertDirectory(paths.metricsArchiveRoot, args, 0o700);
  const directoryEntries = readdirSync(paths.metricsArchiveRoot, {
    withFileTypes: true,
  });
  if (directoryEntries.length > MAX_METRIC_ARCHIVE_FILES) {
    fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_OVERSIZED");
  }
  let totalBytes = 0;
  for (const entry of directoryEntries) {
    const details = lstatSync(path.join(paths.metricsArchiveRoot, entry.name));
    if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
    }
    totalBytes += details.size;
    if (totalBytes > MAX_METRIC_ARCHIVE_BYTES) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_OVERSIZED");
    }
  }
  const groups = new Map();
  const fileInventory = [];
  for (const entry of directoryEntries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
    }
    const manifestMatch = METRIC_ARCHIVE_MANIFEST_FILE.exec(entry.name);
    const segmentMatch = METRIC_ARCHIVE_SEGMENT_FILE.exec(entry.name);
    const receiptMatch = METRIC_ARCHIVE_RECEIPT_FILE.exec(entry.name);
    const match = manifestMatch ?? segmentMatch ?? receiptMatch;
    if (!match) fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
    const record = readCanonicalJson(
      path.join(paths.metricsArchiveRoot, entry.name),
      args,
      [0o400],
    );
    fileInventory.push({ fileName: entry.name, fileSha256: record.sha256 });
    const planSha256 = match[1];
    const group = groups.get(planSha256) ?? {
      files: [],
      manifest: undefined,
      receipt: undefined,
      segments: new Map(),
    };
    group.files.push({ fileName: entry.name, fileSha256: record.sha256 });
    if (manifestMatch) {
      if (group.manifest !== undefined) {
        fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
      }
      group.manifest = record.value;
    } else if (receiptMatch) {
      if (group.receipt !== undefined) {
        fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
      }
      group.receipt = record.value;
    } else {
      const segmentIndex = Number(segmentMatch[2]);
      if (segmentIndex < 1 || group.segments.has(segmentIndex)) {
        fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
      }
      group.segments.set(segmentIndex, record.value);
    }
    groups.set(planSha256, group);
  }
  fileInventory.sort((left, right) =>
    compareCanonicalText(left.fileName, right.fileName),
  );
  const attempts = [];
  const sourceByName = new Map();
  let target;
  for (const [planSha256, group] of groups) {
    if (group.manifest === undefined) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_INVALID");
    }
    const manifest = validateMetricArchiveManifest(group.manifest, planSha256);
    const plan = manifest.plan;
    const incompleteAllowed = planSha256 === allowIncompletePlanSha256;
    for (const [segmentIndex, segment] of group.segments) {
      validateMetricArchiveSegment(segment, plan, planSha256, segmentIndex);
    }
    if (group.receipt !== undefined) {
      validateMetricRetentionReceipt(group.receipt, plan, planSha256);
    }
    const complete =
      group.receipt !== undefined && group.segments.size === plan.segments.length;
    if (!complete && !incompleteAllowed) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_INCOMPLETE");
    }
    if (complete) {
      for (let index = 1; index <= plan.segments.length; index += 1) {
        const segment = group.segments.get(index);
        if (segment === undefined) {
          fail("ORCHESTRATOR_METRIC_ARCHIVE_INCOMPLETE");
        }
        for (const archived of validateMetricArchiveSegment(
          segment,
          plan,
          planSha256,
          index,
        )) {
          if (sourceByName.has(archived.fileName)) {
            fail("ORCHESTRATOR_METRIC_ARCHIVE_SOURCE_OVERLAP");
          }
          sourceByName.set(archived.fileName, archived);
          attempts.push(archived.metric);
          if (attempts.length > MAX_METRIC_ARCHIVED_ATTEMPTS) {
            fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_OVERSIZED");
          }
        }
      }
    }
    if (incompleteAllowed) {
      target = { complete, group, manifest, plan, planSha256 };
    }
  }
  const baseFileInventory = fileInventory.filter(
    (entry) => !target?.group.files.some((item) => item.fileName === entry.fileName),
  );
  const targetBytes = target?.group.files.reduce(
    (sum, entry) =>
      sum +
      lstatSync(path.join(paths.metricsArchiveRoot, entry.fileName)).size,
    0,
  );
  return {
    attempts,
    baseFileInventory,
    fileInventory,
    sourceByName,
    target,
    totalBytes,
    baseTotalBytes: totalBytes - (targetBytes ?? 0),
  };
}

function metricAttemptInventory(paths, args) {
  const archive = readMetricArchiveInventory(paths, args);
  const live = readLiveMetricAttemptEntries(paths, args);
  const attempts = [...archive.attempts];
  for (const entry of live) {
    const archived = archive.sourceByName.get(entry.fileName);
    if (archived !== undefined) {
      if (
        archived.fileSha256 !== entry.fileSha256 ||
        canonicalJson(archived.metric) !== canonicalJson(entry.metric)
      ) {
        fail("ORCHESTRATOR_METRIC_ARCHIVE_LIVE_MISMATCH");
      }
      continue;
    }
    attempts.push(entry.metric);
  }
  return attempts;
}

function assertMetricRetentionOperationsTerminal(paths, args) {
  if (
    metricOperationInventory(paths, args).some(
      (operation) => operation.state !== "COMPLETED",
    )
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_OPERATION_UNRESOLVED");
  }
}

function buildMetricRetentionPlan(paths, args) {
  assertMetricRetentionOperationsTerminal(paths, args);
  const archive = readMetricArchiveInventory(paths, args);
  const live = readLiveMetricAttemptEntries(paths, args);
  const cleanupCandidates = [];
  const active = [];
  for (const entry of live) {
    const archived = archive.sourceByName.get(entry.fileName);
    if (archived === undefined) {
      active.push(entry);
      continue;
    }
    if (
      archived.fileSha256 !== entry.fileSha256 ||
      canonicalJson(archived.metric) !== canonicalJson(entry.metric)
    ) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_LIVE_MISMATCH");
    }
    cleanupCandidates.push(entry);
  }
  active.sort(
    (left, right) =>
      compareCanonicalText(
        left.metric.attemptFinishedAt,
        right.metric.attemptFinishedAt,
      ) || compareCanonicalText(left.fileName, right.fileName),
  );
  cleanupCandidates.sort((left, right) =>
    compareCanonicalText(left.fileName, right.fileName),
  );
  const cleanupEntries = metricSourceReferences(
    cleanupCandidates.slice(0, MAX_METRIC_RETENTION_PLAN_ENTRIES),
  );
  const selectionCapacity =
    MAX_METRIC_RETENTION_PLAN_ENTRIES - cleanupEntries.length;
  const requiredSelection = Math.max(0, active.length - args.retainAttemptCount);
  const selected = active.slice(0, Math.min(requiredSelection, selectionCapacity));
  const segments = [];
  for (
    let offset = 0;
    offset < selected.length;
    offset += METRIC_ARCHIVE_SEGMENT_ENTRIES
  ) {
    const sourceEntries = metricSourceReferences(
      selected.slice(offset, offset + METRIC_ARCHIVE_SEGMENT_ENTRIES),
    );
    segments.push({
      segmentIndex: segments.length + 1,
      sourceEntries,
      sourceEntryCount: sourceEntries.length,
      sourceSetSha256: metricSourceSetSha256(sourceEntries),
    });
  }
  const plan = {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_ATTEMPT_METRIC_RETENTION_PLAN",
    retainAttemptCount: args.retainAttemptCount,
    liveInventorySha256: metricInventorySha256(live),
    archiveInventorySha256: sha256(canonicalJson(archive.fileInventory)),
    activeAttemptCount: active.length,
    archiveAttemptCount: archive.attempts.length,
    cleanupEntries,
    segments,
    selectedAttemptCount: selected.length,
    retainedAttemptCount: active.length - selected.length,
    retainedInventorySha256: metricInventorySha256(
      active.slice(selected.length),
    ),
    replayLiveDriftPolicy: "EXACT_RETAINED_PLUS_OPTIONAL_PLANNED_SOURCES",
    decision:
      selected.length + cleanupEntries.length === 0
        ? METRIC_RETENTION_NOOP_DECISION
        : METRIC_RETENTION_PLAN_DECISION,
  };
  return validateMetricRetentionPlan(plan);
}

function metricRetentionPlan(paths, args) {
  const plan = buildMetricRetentionPlan(paths, args);
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    decision: plan.decision,
    plan,
    planSha256: canonicalRecordSha256(plan),
  };
}

function ensureMetricArchiveRoot(paths, args) {
  assertDirectory(paths.deployReceiptRoot, args, 0o700);
  if (!existsSync(paths.metricsArchiveRoot)) {
    mkdirSync(paths.metricsArchiveRoot, { mode: 0o700 });
    syncDirectory(paths.deployReceiptRoot, args);
  }
  assertDirectory(paths.metricsArchiveRoot, args, 0o700);
}

function metricArchiveManifest(plan, planSha256) {
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_ATTEMPT_METRIC_RETENTION_MANIFEST",
    planSha256,
    plan,
  };
}

function metricArchiveSegment(plan, planSha256, segmentPlan, sourceByName) {
  const sourceEntries = segmentPlan.sourceEntries.map((reference) => {
    const source = sourceByName.get(reference.fileName);
    if (
      source === undefined ||
      source.fileSha256 !== reference.fileSha256 ||
      canonicalRecordSha256(source.metric) !== reference.fileSha256
    ) {
      fail("ORCHESTRATOR_METRIC_RETENTION_SOURCE_DRIFT");
    }
    return { ...reference, metric: source.metric };
  });
  return {
    schemaVersion: 1,
    contractVersion: CONTRACT_VERSION,
    recordType: "ROLLOUT_ATTEMPT_METRIC_ARCHIVE_SEGMENT",
    planSha256,
    segmentIndex: segmentPlan.segmentIndex,
    segmentCount: plan.segments.length,
    sourceEntryCount: segmentPlan.sourceEntryCount,
    sourceSetSha256: segmentPlan.sourceSetSha256,
    sourceEntries,
  };
}

function unlinkMetricSourceIfPresent(paths, args, reference, archivedSource) {
  const filePath = path.join(paths.metricsRoot, reference.fileName);
  const details = lstatIfPresent(filePath);
  if (details === undefined) return false;
  if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1) {
    fail("ORCHESTRATOR_METRIC_RETENTION_SOURCE_DRIFT");
  }
  const source = readCanonicalJson(filePath, args, [0o400]);
  const metric = validateMetricAttempt(source.value);
  if (
    source.sha256 !== reference.fileSha256 ||
    archivedSource === undefined ||
    archivedSource.fileSha256 !== reference.fileSha256 ||
    canonicalJson(archivedSource.metric) !== canonicalJson(metric)
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_SOURCE_DRIFT");
  }
  unlinkSync(filePath);
  return true;
}

function applyMetricRetention(paths, args) {
  assertMetricRetentionOperationsTerminal(paths, args);
  let archive = readMetricArchiveInventory(paths, args, {
    allowIncompletePlanSha256: args.planSha256,
  });
  let plan;
  if (archive.target === undefined) {
    plan = buildMetricRetentionPlan(paths, args);
    if (canonicalRecordSha256(plan) !== args.planSha256) {
      fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_DRIFT");
    }
    if (plan.decision === METRIC_RETENTION_NOOP_DECISION) {
      return metricRetentionNoopResult(plan, args.planSha256);
    }
    const projectedLive = readLiveMetricAttemptEntries(paths, args);
    const projectedLiveByName = new Map(
      projectedLive.map((entry) => [entry.fileName, entry]),
    );
    const projectedBytes =
      archive.totalBytes +
      canonicalJsonByteLength(metricArchiveManifest(plan, args.planSha256)) +
      plan.segments.reduce(
        (sum, segmentPlan) =>
          sum +
          canonicalJsonByteLength(
            metricArchiveSegment(
              plan,
              args.planSha256,
              segmentPlan,
              projectedLiveByName,
            ),
          ),
        0,
      ) +
      canonicalJsonByteLength(metricRetentionReceipt(plan, args.planSha256));
    const projectedFiles =
      archive.fileInventory.length + plan.segments.length + 2;
    if (
      projectedFiles > MAX_METRIC_ARCHIVE_FILES ||
      projectedBytes > MAX_METRIC_ARCHIVE_BYTES
    ) {
      fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_OVERSIZED");
    }
    ensureMetricArchiveRoot(paths, args);
    publishCanonicalJson(
      path.join(
        paths.metricsArchiveRoot,
        metricArchiveFileName(args.planSha256, "manifest"),
      ),
      metricArchiveManifest(plan, args.planSha256),
      0o400,
      args,
    );
    archive = readMetricArchiveInventory(paths, args, {
      allowIncompletePlanSha256: args.planSha256,
    });
  } else {
    plan = archive.target.plan;
    if (
      plan.retainAttemptCount !== args.retainAttemptCount ||
      canonicalRecordSha256(plan) !== args.planSha256
    ) {
      fail("ORCHESTRATOR_METRIC_RETENTION_PLAN_DRIFT");
    }
  }
  if (
    sha256(canonicalJson(archive.baseFileInventory)) !==
    plan.archiveInventorySha256
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_ARCHIVE_DRIFT");
  }
  const live = readLiveMetricAttemptEntries(paths, args);
  const liveByName = new Map(live.map((entry) => [entry.fileName, entry]));
  const targetSourceNames = new Set(
    plan.segments.flatMap((segment) =>
      segment.sourceEntries.map((entry) => entry.fileName),
    ),
  );
  const priorSourceByName = new Map(
    [...archive.sourceByName].filter(([fileName]) => !targetSourceNames.has(fileName)),
  );
  const plannedRemovalNames = new Set([
    ...targetSourceNames,
    ...plan.cleanupEntries.map((entry) => entry.fileName),
  ]);
  for (const segment of plan.segments) {
    for (const reference of segment.sourceEntries) {
      const current = liveByName.get(reference.fileName);
      if (current !== undefined && current.fileSha256 !== reference.fileSha256) {
        fail("ORCHESTRATOR_METRIC_RETENTION_SOURCE_DRIFT");
      }
    }
  }
  for (const reference of plan.cleanupEntries) {
    const current = liveByName.get(reference.fileName);
    if (current !== undefined && current.fileSha256 !== reference.fileSha256) {
      fail("ORCHESTRATOR_METRIC_RETENTION_SOURCE_DRIFT");
    }
  }
  const retainedLive = live.filter(
    (entry) => !plannedRemovalNames.has(entry.fileName),
  );
  if (
    retainedLive.length !== plan.retainedAttemptCount ||
    metricInventorySha256(retainedLive) !== plan.retainedInventorySha256
  ) {
    fail("ORCHESTRATOR_METRIC_RETENTION_REPLAY_LIVE_DRIFT");
  }
  for (const segment of plan.segments) {
    for (const reference of segment.sourceEntries) {
      if (priorSourceByName.has(reference.fileName)) {
        fail("ORCHESTRATOR_METRIC_RETENTION_ARCHIVE_DRIFT");
      }
    }
  }
  for (const reference of plan.cleanupEntries) {
    const archived = priorSourceByName.get(reference.fileName);
    if (archived === undefined || archived.fileSha256 !== reference.fileSha256) {
      fail("ORCHESTRATOR_METRIC_RETENTION_ARCHIVE_DRIFT");
    }
  }
  const missingSegments = [];
  for (const segmentPlan of plan.segments) {
    const segmentPath = path.join(
      paths.metricsArchiveRoot,
      metricArchiveFileName(args.planSha256, "segment", segmentPlan.segmentIndex),
    );
    if (!existsSync(segmentPath)) {
      const segment = metricArchiveSegment(
        plan,
        args.planSha256,
        segmentPlan,
        liveByName,
      );
      missingSegments.push({ segment, segmentPath });
    }
  }
  const receipt = metricRetentionReceipt(plan, args.planSha256);
  const receiptPath = path.join(
    paths.metricsArchiveRoot,
    metricArchiveFileName(args.planSha256, "receipt"),
  );
  const projectedReplayBytes =
    archive.totalBytes +
    missingSegments.reduce(
      (sum, entry) => sum + canonicalJsonByteLength(entry.segment),
      0,
    ) +
    (existsSync(receiptPath) ? 0 : canonicalJsonByteLength(receipt));
  const projectedReplayFiles =
    archive.fileInventory.length +
    missingSegments.length +
    (existsSync(receiptPath) ? 0 : 1);
  if (
    projectedReplayFiles > MAX_METRIC_ARCHIVE_FILES ||
    projectedReplayBytes > MAX_METRIC_ARCHIVE_BYTES
  ) {
    fail("ORCHESTRATOR_METRIC_ARCHIVE_INVENTORY_OVERSIZED");
  }
  for (const { segment, segmentPath } of missingSegments) {
    publishCanonicalJson(segmentPath, segment, 0o400, args);
  }
  archive = readMetricArchiveInventory(paths, args, {
    allowIncompletePlanSha256: args.planSha256,
  });
  const targetArchivedByName = new Map();
  for (let index = 1; index <= plan.segments.length; index += 1) {
    const segment = archive.target?.group.segments.get(index);
    if (segment === undefined) fail("ORCHESTRATOR_METRIC_ARCHIVE_INCOMPLETE");
    for (const source of validateMetricArchiveSegment(
      segment,
      plan,
      args.planSha256,
      index,
    )) {
      targetArchivedByName.set(source.fileName, source);
    }
  }
  let removed = false;
  for (const segmentPlan of plan.segments) {
    for (const reference of segmentPlan.sourceEntries) {
      removed =
        unlinkMetricSourceIfPresent(
          paths,
          args,
          reference,
          targetArchivedByName.get(reference.fileName),
        ) || removed;
    }
  }
  for (const reference of plan.cleanupEntries) {
    removed =
      unlinkMetricSourceIfPresent(
        paths,
        args,
        reference,
        priorSourceByName.get(reference.fileName),
      ) || removed;
  }
  if (removed) syncDirectory(paths.metricsRoot, args);
  if (!existsSync(receiptPath)) {
    publishCanonicalJson(receiptPath, receipt, 0o400, args);
  }
  readMetricArchiveInventory(paths, args);
  return receipt;
}

function percentileSummary(values) {
  if (values.length < METRIC_SAMPLE_MINIMUM) {
    return {
      decision: "INSUFFICIENT_SAMPLE_SIZE",
      p50: null,
      p95: null,
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction) =>
    sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return {
    decision: "AVAILABLE",
    p50: percentile(0.5),
    p95: percentile(0.95),
  };
}

function laneMetricSummary(lane, operations, attempts) {
  const completed = operations.filter(
    (operation) => operation.lane === lane && operation.state === "COMPLETED",
  );
  const laneAttempts = attempts.filter((attempt) => attempt.effectiveLane === lane);
  const failurePhaseHistogram = Object.fromEntries(
    METRIC_FAILURE_PHASES.map((phase) => [phase, 0]),
  );
  for (const attempt of laneAttempts) {
    if (attempt.outcome === "BLOCKED") {
      failurePhaseHistogram[attempt.failurePhase] += 1;
    }
  }
  return {
    approvalToFinalMilliseconds: percentileSummary(
      completed.map((operation) => operation.approvalToFinalMilliseconds),
    ),
    completedOperationCount: completed.length,
    failurePhaseHistogram,
    phaseIntentToReceiptMilliseconds: Object.fromEntries(
      PHASES.map((phase) => [
        phase,
        percentileSummary(completed.map((operation) => operation.phaseDurations[phase])),
      ]),
    ),
    rolloutAttemptCount: laneAttempts.length,
  };
}

function metrics(paths, args) {
  const operations = metricOperationInventory(paths, args);
  const attempts = metricAttemptInventory(paths, args);
  const unresolved = operations.filter(
    (operation) => operation.state === "UNRESOLVED",
  );
  return {
    contractVersion: CONTRACT_VERSION,
    decision: "METRICS_READ_ONLY",
    lanes: Object.fromEntries(
      TRUSTED_LANES.map((lane) => [
        lane,
        laneMetricSummary(lane, operations, attempts),
      ]),
    ),
    legacyUnclassified: {
      completedOperationCount: operations.filter(
        (operation) =>
          operation.lane === LEGACY_UNCLASSIFIED_LANE &&
          operation.state === "COMPLETED",
      ).length,
      rolloutAttemptCount: 0,
    },
    sampleSizeMinimum: METRIC_SAMPLE_MINIMUM,
    schemaVersion: 1,
    unresolved: {
      byLane: Object.fromEntries(
        [...TRUSTED_LANES, LEGACY_UNCLASSIFIED_LANE].map((lane) => [
          lane,
          unresolved.filter((operation) => operation.lane === lane).length,
        ]),
      ),
      operationCount: unresolved.length,
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  let paths;
  let context;
  let attempt;
  let attemptWritten = false;
  try {
    args = parseArguments(argv);
    if (args.help) {
      process.stdout.write(usage() + "\n");
      return 0;
    }
    validateBootstrap(args);
    paths = buildPaths(args);
    if (args.mode === "metrics") {
      process.stdout.write(JSON.stringify(metrics(paths, args)) + "\n");
      return 0;
    }
    if (args.mode === "metrics-retention-plan") {
      process.stdout.write(JSON.stringify(metricRetentionPlan(paths, args)) + "\n");
      return 0;
    }
    if (args.mode === "metrics-retention-apply") {
      process.stdout.write(JSON.stringify(applyMetricRetention(paths, args)) + "\n");
      return 0;
    }
    if (args.mode === "prepare") {
      process.stdout.write(JSON.stringify(createPlan(args, paths)) + "\n");
      return 0;
    }
    if (["apply", "resume"].includes(args.mode)) {
      readMetricArchiveInventory(paths, args);
    }
    context = readPlan(args, paths);
    if (args.mode === "status") {
      process.stdout.write(JSON.stringify(status(context, args)) + "\n");
      return 0;
    }
    attempt = {
      effectiveLane: context.plan.effectiveLane,
      startedAt: nowIso(),
    };
    assertNoOtherIncompleteOperation(paths, args, args.operationId);
    const result = runPipeline(context, paths, args);
    writeAttemptMetric(paths, args, {
      ...attempt,
      failurePhase: "NONE",
      outcome: "COMPLETED",
      reasonClass: "NONE",
    });
    attemptWritten = true;
    process.stdout.write(JSON.stringify(result) + "\n");
    return 0;
  } catch (error) {
    if (attempt !== undefined && !attemptWritten && paths !== undefined) {
      const reasonCode =
        error?.safeContractError === true
          ? error.reasonCode
          : "ORCHESTRATOR_UNEXPECTED_FAILURE";
      try {
        writeAttemptMetric(paths, args, {
          ...attempt,
          failurePhase: currentAttemptFailurePhase(context, args),
          outcome: "BLOCKED",
          reasonClass: normalizeMetricReasonClass(reasonCode),
        });
      } catch (metricError) {
        error = metricError;
      }
    }
    if (args?.testMode && error?.safeContractError !== true) {
      process.stderr.write(
        JSON.stringify({
          contractVersion: CONTRACT_VERSION,
          testDiagnostic: {
            message: String(error?.message ?? "unknown"),
            name: String(error?.name ?? "Error"),
            stack: String(error?.stack ?? "unavailable"),
          },
        }) + "\n",
      );
    }
    const reasonCode =
      error?.safeContractError === true
        ? error.reasonCode
        : "ORCHESTRATOR_UNEXPECTED_FAILURE";
    process.stderr.write(
      JSON.stringify({
        contractVersion: CONTRACT_VERSION,
        decision: "BLOCKED_MANUAL",
        reasonCode,
      }) + "\n",
    );
    return 1;
  }
}

const isDirect =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirect) {
  process.exitCode = await main();
}

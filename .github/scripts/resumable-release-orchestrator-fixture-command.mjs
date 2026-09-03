#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.env.LEETPLUS_ORCHESTRATOR_FIXTURE_ROOT;
if (!root) process.exit(90);
const name = path.basename(process.argv[1]);
const argv = process.argv.slice(2);
const statePath = path.join(root, "fixture-state.json");
const state = JSON.parse(readFileSync(statePath, "utf8"));
const save = () =>
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
const sha = (value) => createHash("sha256").update(value).digest("hex");
const kv = (entries) =>
  entries.map(([key, value]) => key + "=" + value).join("\n") + "\n";
const releaseRoot = path.join(root, "srv/leetplus/releases");
const slotRoot = path.join(root, "srv/leetplus/slots");
const receiptRoot = path.join(root, "var/lib/leetplus/deploy-receipts");
const nginxRoot = path.join(root, "etc/nginx/leetplus");
const systemdUnitRoot = path.join(root, "etc/systemd/system");
const releaseSha = state.releaseSha;

function replaceLink(linkPath, target) {
  try {
    unlinkSync(linkPath);
  } catch {}
  symlinkSync(target, linkPath, "dir");
}

function writeControlAttestation() {
  const variant = state.controlVariant ?? "A";
  process.stdout.write(
    [
      "PRODUCTION_CONTROL_INSTALLED_GENERATION=PASS",
      "PRODUCTION_CONTROL_RELEASE_SHA=" + releaseSha,
      "PRODUCTION_CONTROL_RECEIPT_PATH=" +
        path.join(receiptRoot, "production-control/receipt.json"),
      "PRODUCTION_CONTROL_RECEIPT_SHA256=" +
        variant.toLowerCase().charCodeAt(0).toString(16).padStart(64, "0"),
      "PRODUCTION_CONTROL_ROOT_MANIFEST_SHA256=" + "2".repeat(64),
      "PRODUCTION_CONTROL_INSTALL_MAP_SHA256=" + "3".repeat(64),
      "PRODUCTION_CONTROL_INSTALLER_SHA256=" + "4".repeat(64),
      "PRODUCTION_CONTROL_VERIFIER_SHA256=" + "5".repeat(64),
      "PRODUCTION_CONTROL_STAGER_SHA256=" + "6".repeat(64),
      "PRODUCTION_CONTROL_ATTESTOR_SHA256=" + "7".repeat(64),
      "PRODUCTION_CONTROL_HYDRATION_UNIT_SHA256=" + "8".repeat(64),
      "PRODUCTION_CONTROL_SEALER_SHA256=" + "9".repeat(64),
      "PRODUCTION_CONTROL_PROMOTER_SHA256=" + "0".repeat(64),
      "PRODUCTION_CONTROL_INSTALLED_FILE_COUNT=52",
      "PRODUCTION_CONTROL_EFFECTIVE_LANE=" +
        (state.effectiveLane ?? "L1_RUNTIME"),
      "PRODUCTION_CONTROL_IMPACT_RECEIPT_SHA256=" + "f".repeat(64),
      "",
    ].join("\n"),
  );
}

function writeHydrationReceipt() {
  const releaseDirectory = path.join(releaseRoot, releaseSha);
  mkdirSync(releaseDirectory, { recursive: true });
  const receipt = kv([
    ["RECORD_VERSION", "1"],
    ["RELEASE_SHA", releaseSha],
    ["RELEASE_SLOT", state.targetSlot],
    ["HYDRATION_INVOCATION_ID", "1".repeat(32)],
    ["HYDRATION_SOURCE_RECEIPT_SHA256", "2".repeat(64)],
    ["HYDRATION_UNIT_SHA256", "3".repeat(64)],
    ["HYDRATION_STAGER_SHA256", "4".repeat(64)],
    ["HYDRATION_POLICY_SHA256", "5".repeat(64)],
    ["HYDRATED_MANIFEST_SHA256", "6".repeat(64)],
    ["RELEASE_DIRECTORY", releaseDirectory],
    ["PUBLICATION_AUTHORIZED", "true"],
    ["RUNTIME_SWITCHED", "false"],
  ]);
  writeFileSync(
    path.join(
      receiptRoot,
      "release-hydration-attestation-" + releaseSha + ".receipt",
    ),
    receipt,
  );
}

function writeBindReceipt(slot) {
  const journal = path.join(receiptRoot, "slot-links");
  mkdirSync(journal, { recursive: true });
  const target = path.join(releaseRoot, releaseSha);
  mkdirSync(target, { recursive: true });
  replaceLink(path.join(slotRoot, slot), target);
  const operationId = "20260902T000000.000000000Z-1";
  const receiptPath = path.join(
    journal,
    slot + "-" + operationId + ".bind.receipt",
  );
  const receipt = kv([
    ["RECORD_VERSION", "1"],
    ["RECORD_KIND", "SLOT_LINK_RECEIPT"],
    ["OPERATION", "BIND"],
    ["OPERATION_ID", operationId],
    ["SLOT", slot],
    ["REQUESTED_RELEASE_SHA", releaseSha],
    ["REQUESTED_TARGET", target],
    ["REQUESTED_SHA256SUMS_SHA256", "1".repeat(64)],
    ["REQUESTED_HYDRATED_SHA256SUMS_SHA256", "2".repeat(64)],
    ["REQUESTED_SYMLINK_MANIFEST_SHA256", "3".repeat(64)],
    ["REQUESTED_PROVENANCE_SHA256", "4".repeat(64)],
    ["REQUESTED_HYDRATION_ATTESTATION_SHA256", "5".repeat(64)],
    ["PRIOR_STATE", "BOUND"],
    ["PRIOR_RELEASE_SHA", "b".repeat(40)],
    ["PRIOR_TARGET", path.join(releaseRoot, "b".repeat(40))],
    ["PRIOR_SHA256SUMS_SHA256", "7".repeat(64)],
    ["PRIOR_HYDRATED_SHA256SUMS_SHA256", "8".repeat(64)],
    ["PRIOR_SYMLINK_MANIFEST_SHA256", "9".repeat(64)],
    ["PRIOR_PROVENANCE_SHA256", "a".repeat(64)],
    ["PRIOR_HYDRATION_ATTESTATION_SHA256", "b".repeat(64)],
    ["SOURCE_RECEIPT_SHA256", ""],
    ["ACTIVE_SLOT_SAFE_MODE", "false"],
    ["CREATED_AT", "2026-09-02T00:00:00.000000000Z"],
    ["INTENT_SHA256", "6".repeat(64)],
    ["EFFECT_STATE", "REQUESTED_BOUND"],
    ["ACCEPTED_AT", "2026-09-02T00:00:00.000000000Z"],
  ]);
  writeFileSync(receiptPath, receipt);
  writeFileSync(
    path.join(journal, slot + ".latest"),
    kv([
      ["RECORD_VERSION", "1"],
      ["RECORD_KIND", "SLOT_LINK_LATEST"],
      ["SLOT", slot],
      ["OPERATION_ID", operationId],
      ["RECEIPT_PATH", receiptPath],
      ["RECEIPT_SHA256", sha(receipt)],
      ["UPDATED_AT", "2026-09-02T00:00:00.000Z"],
    ]),
  );
}

function writeCutoverReceipt({ activateTarget = true } = {}) {
  const generation = state.baselineGeneration + 1;
  const receiptPath = path.join(
    receiptRoot,
    "20260902T000000000000000Z-g" +
      generation +
      "-" +
      releaseSha +
      "-" +
      state.targetSlot +
      ".receipt",
  );
  const receipt = kv([
    ["RECORD_VERSION", "3"],
    ["GENERATION", String(generation)],
    ["RELEASE_SHA", releaseSha],
    ["SLOT", state.targetSlot],
    [
      "PREVIOUS_TARGET",
      path.join(nginxRoot, "upstreams/" + state.previousSlot + ".conf"),
    ],
    ["PREVIOUS_SHA256", "1".repeat(64)],
    ["PREVIOUS_RUNTIME_KIND", "SLOT"],
    ["PREVIOUS_SLOT", state.previousSlot],
    ["PREVIOUS_API_UNIT", "leetplus-api@" + state.previousSlot + ".service"],
    ["PREVIOUS_WEB_UNIT", "leetplus-web@" + state.previousSlot + ".service"],
    [
      "PREVIOUS_API_URL",
      state.previousSlot === "blue"
        ? "http://127.0.0.1:4100"
        : "http://127.0.0.1:4200",
    ],
    [
      "PREVIOUS_WEB_URL",
      state.previousSlot === "blue"
        ? "http://127.0.0.1:3100"
        : "http://127.0.0.1:3200",
    ],
    ["PREVIOUS_RELEASE_SHA", "b".repeat(40)],
    [
      "PREVIOUS_MIGRATION",
      "20260831120000_guest_support_bug_report_input_repair",
    ],
    ["PREVIOUS_MIGRATION_COUNT", "189"],
    ["PREVIOUS_WEB_BUILD_ID", "b".repeat(40)],
    [
      "ACTIVATED_TARGET",
      path.join(nginxRoot, "upstreams/" + state.targetSlot + ".conf"),
    ],
    ["ACTIVATED_SHA256", "2".repeat(64)],
    ["INTENT_RECORDED_AT", "20260902T000000000000000Z"],
    ["ACCEPTED_AT", "2026-09-02T00:00:00.000000000Z"],
  ]);
  writeFileSync(receiptPath, receipt);
  writeFileSync(
    path.join(receiptRoot, "latest-accepted.index"),
    kv([
      ["RECORD_VERSION", "2"],
      ["GENERATION", String(generation)],
      ["RECEIPT_PATH", receiptPath],
      ["RECEIPT_SHA256", sha(receipt)],
      ["CONSUMED", "false"],
    ]),
  );
  if (activateTarget) {
    replaceLink(
      path.join(nginxRoot, "active-upstreams.conf"),
      path.join(nginxRoot, "upstreams/" + state.targetSlot + ".conf"),
    );
  }
}

switch (name) {
  case "verify-installed-production-control-generation.mjs":
    writeControlAttestation();
    break;
  case "systemctl": {
    const command = argv[0] === "--quiet" ? argv[1] : argv[0];
    if (command === "mask") {
      if (
        argv.join(" ") !==
        "--quiet mask --now leetplus-api@" +
          state.targetSlot +
          ".service leetplus-web@" +
          state.targetSlot +
          ".service"
      ) {
        process.exit(94);
      }
      state.maskCalls += 1;
      if (!state.slotMasked) {
        for (const unit of [
          "leetplus-api@" + state.targetSlot + ".service",
          "leetplus-web@" + state.targetSlot + ".service",
        ]) {
          symlinkSync("/dev/null", path.join(systemdUnitRoot, unit));
        }
        state.slotMasked = true;
        state.maskEffects += 1;
      }
      save();
      break;
    }
    if (command === "unmask") {
      if (
        argv.join(" ") !==
        "--quiet unmask leetplus-api@" +
          state.targetSlot +
          ".service leetplus-web@" +
          state.targetSlot +
          ".service"
      ) {
        process.exit(95);
      }
      state.unmaskCalls += 1;
      if (
        process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_UNMASK_ONCE === "true" &&
        state.unmaskFailures === 0
      ) {
        state.unmaskFailures += 1;
        save();
        process.exit(96);
      }
      if (state.slotMasked) {
        for (const unit of [
          "leetplus-api@" + state.targetSlot + ".service",
          "leetplus-web@" + state.targetSlot + ".service",
        ]) {
          unlinkSync(path.join(systemdUnitRoot, unit));
        }
        state.slotMasked = false;
        state.unmaskEffects += 1;
      }
      save();
      break;
    }
    if (command === "stop") {
      if (
        !state.slotMasked ||
        argv.join(" ") !==
          "stop leetplus-api@" +
            state.targetSlot +
            ".service leetplus-web@" +
            state.targetSlot +
            ".service"
      ) {
        process.exit(102);
      }
      state.stopCalls += 1;
      save();
      break;
    }
    if (command === "reset-failed") {
      if (
        argv.join(" ") !==
        "reset-failed leetplus-api@" +
          state.targetSlot +
          ".service leetplus-web@" +
          state.targetSlot +
          ".service"
      ) {
        process.exit(104);
      }
      state.resetFailedCalls += 1;
      if (state.slotFailed) {
        state.slotFailed = false;
        state.resetFailedEffects += 1;
      }
      save();
      break;
    }
    if (
      command === "start" &&
      argv[1]?.startsWith("leetplus-release-hydrate@")
    ) {
      if (!state.hydrated) {
        state.hydrated = true;
        state.hydrationEffects += 1;
      }
      state.hydrationCalls += 1;
      save();
      break;
    }
    if (command === "enable") {
      if (state.slotMasked) process.exit(97);
      state.enableCalls += 1;
      save();
      break;
    }
    if (command === "start") {
      if (state.slotMasked) process.exit(98);
      state.runtimeStartCalls += 1;
      save();
      break;
    }
    if (command === "show") {
      const unit = argv.at(-1);
      const property = argv
        .find((argument) => argument.startsWith("--property="))
        ?.slice("--property=".length);
      if (property === "LoadState") {
        process.stdout.write(state.slotMasked ? "masked\n" : "loaded\n");
        break;
      }
      if (property === "UnitFileState") {
        process.stdout.write(state.slotMasked ? "masked\n" : "enabled\n");
        break;
      }
      if (property === "ActiveState") {
        process.stdout.write(state.slotFailed ? "failed\n" : "inactive\n");
        break;
      }
      if (property === "SubState") {
        process.stdout.write(state.slotFailed ? "failed\n" : "dead\n");
        break;
      }
      if (property === "MainPID" || property === "ControlPID") {
        process.stdout.write("0\n");
        break;
      }
      if (property !== "InvocationID") process.exit(103);
      process.stdout.write(
        (unit.includes("api@") ? "a" : "b").repeat(32) + "\n",
      );
      break;
    }
    process.exit(91);
    break;
  }
  case "promote-release-artifact":
    state.promoteCalls += 1;
    if (!state.hydrated) {
      state.hydrated = true;
      state.hydrationEffects += 1;
    }
    writeHydrationReceipt();
    save();
    process.stdout.write("PROMOTED_RELEASE_SHA=" + releaseSha + "\n");
    break;
  case "prepare-web-slot-cache":
    if (!state.slotMasked) process.exit(99);
    state.cacheCalls += 1;
    if (
      process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ALWAYS === "true" ||
      (process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE === "true" &&
        state.cacheFailures === 0)
    ) {
      state.cacheFailures += 1;
      save();
      process.exit(100);
    }
    save();
    process.stdout.write("WEB_CACHE_PREPARED_SHA=" + releaseSha + "\n");
    break;
  case "bind-release-slot":
    if (!state.slotMasked) process.exit(101);
    state.bindCalls += 1;
    if (!state.bound) {
      state.bound = true;
      state.bindEffects += 1;
      writeBindReceipt(state.targetSlot);
    }
    save();
    process.stdout.write("SLOT_LINK_ACCEPTED_RELEASE_SHA=" + releaseSha + "\n");
    break;
  case "verify-release-readiness":
    state.readinessCalls += 1;
    if (
      process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_READINESS_ALWAYS === "true" ||
      (process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_READINESS_ONCE === "true" &&
        state.readinessFailures === 0)
    ) {
      state.readinessFailures += 1;
      save();
      process.exit(105);
    }
    save();
    process.stdout.write("RELEASE_READINESS=PASS\n");
    break;
  case "auth-smoke":
    state.authCalls += 1;
    save();
    process.stdout.write("AUTHENTICATED_READS=PASS\n");
    break;
  case "blue-green-cutover":
    if (argv[0] === "recover-pending") {
      process.stdout.write("BLUE_GREEN_PENDING_RECOVERY=false\n");
      break;
    }
    if (argv[0] !== "switch") process.exit(92);
    state.cutoverCalls += 1;
    const suppressCutoverEffect =
      process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_STDERR_WITHOUT_EFFECT ===
      "true";
    const receiptWithoutActiveLink =
      process.env
        .TEST_ORCHESTRATOR_FIXTURE_CUTOVER_RECEIPT_WITHOUT_ACTIVE_LINK ===
      "true";
    if (!state.cutover && !suppressCutoverEffect) {
      state.cutover = true;
      state.cutoverEffects += 1;
      writeCutoverReceipt({ activateTarget: !receiptWithoutActiveLink });
    }
    save();
    if (
      process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_STDERR_AFTER_EFFECT ===
        "true" ||
      receiptWithoutActiveLink ||
      suppressCutoverEffect
    ) {
      process.stderr.write("fixture accepted cutover with diagnostic stderr\n");
    }
    process.stdout.write("BLUE_GREEN_ACCEPTED_SHA=" + releaseSha + "\n");
    break;
  default:
    process.exit(93);
}

#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMPLETE_DECISION,
  CONTRACT_VERSION,
  PHASES,
  ROLLED_BACK_SUPERSEDED_DECISION,
  SUPERSEDED_DECISION,
  canonicalRecordSha256,
  main,
} from "../../docs/deployment/production-artifact/resumable-release-orchestrator.mjs";

const RELEASE_SHA = "a".repeat(40);
const PREVIOUS_SHA = "b".repeat(40);
const SUCCESSOR_SHA = "c".repeat(40);
const FOLLOWING_SHA = "d".repeat(40);
const MIGRATION = "20260831120000_guest_support_bug_report_input_repair";
const CURRENT190_MIGRATION = "20260908090000_initial_owner_invite_link_mode";
const CURRENT191_MIGRATION =
  "20260908180000_external_langame_simple_onboarding";
const CURRENT191_MIGRATION_SHA256 =
  "a149122148b0270ad870883f81cba6bd61365c0babca56f81c18523af4b78beb";
const CURRENT191_SCHEMA_PLAN_DIGEST = "d".repeat(64);
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_OPERATION_ID = "22222222-2222-4222-8222-222222222222";
const V2_CONTRACT_VERSION = "LEETPLUS_RESUMABLE_RELEASE_ORCHESTRATOR_V2";
const FIXTURE_COMMAND = path.resolve(
  ".github/scripts/resumable-release-orchestrator-fixture-command.mjs",
);

function kv(entries) {
  return entries.map(([key, value]) => key + "=" + value).join("\n") + "\n";
}

function parseKv(value) {
  return value
    .trimEnd()
    .split("\n")
    .map((line) => {
      const separator = line.indexOf("=");
      assert.notEqual(separator, -1);
      return [line.slice(0, separator), line.slice(separator + 1)];
    });
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slotEnvironment(
  slot,
  releaseSha = PREVIOUS_SHA,
  {
    apiBindHost = "localhost",
    bridgeMode = "OFF",
    bugReportingMode = "LIVE",
    migration = MIGRATION,
    migrationCount = 189,
  } = {},
) {
  const blue = slot === "blue";
  return [
    "# Protected /etc/leetplus/slots/" + slot + ".env metadata.",
    "RELEASE_SHA=" + releaseSha,
    "WEB_BUILD_ID=" + releaseSha,
    "EXPECTED_DATABASE_MIGRATION=" + migration,
    "EXPECTED_DATABASE_MIGRATION_COUNT=" + migrationCount,
    "BUILD_TIME=2026-09-01T00:00:00.000Z",
    "API_BIND_HOST=" + apiBindHost,
    "PORT=" + (blue ? "4100" : "4200"),
    "WEB_PORT=" + (blue ? "3100" : "3200"),
    "API_URL=http://127.0.0.1:" + (blue ? "4100" : "4200"),
    "GUEST_BUG_REPORTING_MODE=" + bugReportingMode,
    "GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=" + bridgeMode,
    "",
  ].join("\n");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
}

async function publishCurrent191CheckReceipt(root, overrides = {}) {
  const receipt = {
    bridgeAttestationDigest: "1".repeat(64),
    checkedAt: new Date().toISOString(),
    contractVersion: "EXTERNAL_LANGAME_CURRENT191_PRE_FINAL_CHECK_RECEIPT_V1",
    databaseEvidenceDigest: "2".repeat(64),
    decision: "CURRENT191_UPGRADE_CHECK_ACCEPTED",
    migrationCount: 191,
    migrationHead: CURRENT191_MIGRATION,
    productionManifestDigest: "3".repeat(64),
    releaseSha: RELEASE_SHA,
    schemaPlanDigest: CURRENT191_SCHEMA_PLAN_DIGEST,
    schemaVersion: 1,
    targetMigrationSha256: CURRENT191_MIGRATION_SHA256,
    ...overrides,
  };
  const raw = JSON.stringify(receipt, null, 2) + "\n";
  const receiptSha256 = digest(raw);
  const receiptPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts",
    `external-langame-current191-${receiptSha256}.check.json`,
  );
  await writeFile(receiptPath, raw, { mode: 0o600 });
  await chmod(receiptPath, 0o400);
  return { receipt, receiptPath, receiptSha256 };
}

async function setupFixture(suffix = "", environmentOptions = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-orchestrator-" + suffix),
  );
  const commands = path.join(root, "commands");
  const receiptRoot = path.join(root, "var/lib/leetplus/deploy-receipts");
  const slotRoot = path.join(root, "srv/leetplus/slots");
  const releaseRoot = path.join(root, "srv/leetplus/releases");
  const slotEnvironmentRoot = path.join(root, "etc/leetplus/slots");
  const upstreamRoot = path.join(root, "etc/nginx/leetplus/upstreams");
  await Promise.all([
    mkdir(commands, { recursive: true }),
    mkdir(path.join(receiptRoot, "slot-links"), {
      recursive: true,
    }),
    mkdir(path.join(receiptRoot, "production-control"), {
      recursive: true,
    }),
    mkdir(slotRoot, { recursive: true }),
    mkdir(releaseRoot, { recursive: true }),
    mkdir(slotEnvironmentRoot, { recursive: true }),
    mkdir(upstreamRoot, { recursive: true }),
    mkdir(path.join(root, "etc/systemd/system"), { recursive: true }),
  ]);
  const sourceReleaseSha = environmentOptions.releaseSha ?? PREVIOUS_SHA;
  const previousRelease = path.join(releaseRoot, sourceReleaseSha);
  await mkdir(previousRelease, { recursive: true });
  await Promise.all([
    symlink(previousRelease, path.join(slotRoot, "blue")),
    symlink(previousRelease, path.join(slotRoot, "green")),
    writeFile(
      path.join(slotEnvironmentRoot, "blue.env"),
      slotEnvironment("blue", sourceReleaseSha, environmentOptions),
      { mode: 0o440 },
    ),
    writeFile(
      path.join(slotEnvironmentRoot, "green.env"),
      slotEnvironment("green", sourceReleaseSha, environmentOptions),
      { mode: 0o440 },
    ),
  ]);
  await writeFile(path.join(upstreamRoot, "blue.conf"), "blue\n");
  await writeFile(path.join(upstreamRoot, "green.conf"), "green\n");
  await symlink(
    path.join(upstreamRoot, "green.conf"),
    path.join(root, "etc/nginx/leetplus/active-upstreams.conf"),
  );
  const baselineReceiptPath = path.join(
    receiptRoot,
    "20260901T000000000000000Z-g20-" + sourceReleaseSha + "-green.receipt",
  );
  const baselineReceipt = kv([
    ["RECORD_VERSION", "3"],
    ["GENERATION", "20"],
    ["RELEASE_SHA", sourceReleaseSha],
    ["SLOT", "green"],
    ["PREVIOUS_TARGET", path.join(upstreamRoot, "blue.conf")],
    ["PREVIOUS_SHA256", "1".repeat(64)],
    ["PREVIOUS_RUNTIME_KIND", "SLOT"],
    ["PREVIOUS_SLOT", "blue"],
    ["PREVIOUS_API_UNIT", "leetplus-api@blue.service"],
    ["PREVIOUS_WEB_UNIT", "leetplus-web@blue.service"],
    ["PREVIOUS_API_URL", "http://127.0.0.1:4100"],
    ["PREVIOUS_WEB_URL", "http://127.0.0.1:3100"],
    ["PREVIOUS_RELEASE_SHA", sourceReleaseSha],
    ["PREVIOUS_MIGRATION", environmentOptions.migration ?? MIGRATION],
    [
      "PREVIOUS_MIGRATION_COUNT",
      String(environmentOptions.migrationCount ?? 189),
    ],
    ["PREVIOUS_WEB_BUILD_ID", sourceReleaseSha],
    ["ACTIVATED_TARGET", path.join(upstreamRoot, "green.conf")],
    ["ACTIVATED_SHA256", "2".repeat(64)],
    ["INTENT_RECORDED_AT", "20260901T000000000000000Z"],
    ["ACCEPTED_AT", "2026-09-01T00:00:00.000000000Z"],
  ]);
  await writeFile(baselineReceiptPath, baselineReceipt);
  await writeFile(
    path.join(receiptRoot, "latest-accepted.index"),
    kv([
      ["RECORD_VERSION", "2"],
      ["GENERATION", "20"],
      ["RECEIPT_PATH", baselineReceiptPath],
      ["RECEIPT_SHA256", digest(baselineReceipt)],
      ["CONSUMED", "false"],
    ]),
  );
  const fixtureDispatcher = path.join(commands, "dispatcher.mjs");
  await copyFile(FIXTURE_COMMAND, fixtureDispatcher);
  await chmod(fixtureDispatcher, 0o755);
  for (const name of [
    "auth-smoke",
    "bind-release-slot",
    "blue-green-cutover",
    "prepare-web-slot-cache",
    "promote-release-artifact",
    "systemctl",
    "verify-installed-production-control-generation.mjs",
    "verify-release-readiness",
  ]) {
    await symlink(fixtureDispatcher, path.join(commands, name));
  }
  await writeJson(path.join(root, "fixture-state.json"), {
    authCalls: 0,
    baselineGeneration: 20,
    bindCalls: 0,
    bindEffects: 0,
    bound: false,
    cacheCalls: 0,
    cacheFailures: 0,
    controlVariant: "A",
    cutover: false,
    cutoverCalls: 0,
    cutoverEffects: 0,
    enableCalls: 0,
    hydrated: false,
    hydrationCalls: 0,
    hydrationEffects: 0,
    maskCalls: 0,
    maskEffects: 0,
    previousSlot: "green",
    promoteCalls: 0,
    readinessCalls: 0,
    readinessFailures: 0,
    releaseSha: RELEASE_SHA,
    resetFailedCalls: 0,
    resetFailedEffects: 0,
    runtimeStartCalls: 0,
    slotMasked: false,
    slotFailed: false,
    sourceReleaseSha,
    stopCalls: 0,
    targetSlot: "blue",
    unmaskCalls: 0,
    unmaskEffects: 0,
    unmaskFailures: 0,
  });
  return root;
}

function prepareArgs(root, operationId = OPERATION_ID) {
  return [
    "prepare",
    "--operation-id",
    operationId,
    "--release-sha",
    RELEASE_SHA,
    "--slot",
    "blue",
    "--expected-migration",
    MIGRATION,
    "--expected-migration-count",
    "189",
    "--previous-release-sha",
    PREVIOUS_SHA,
    "--previous-migration",
    MIGRATION,
    "--previous-migration-count",
    "189",
    "--previous-web-build-id",
    PREVIOUS_SHA,
    "--watchdog-seconds",
    "30",
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ];
}

function current191PrepareArgs(
  root,
  profile,
  { checkReceiptSha256, operationId = OPERATION_ID } = {},
) {
  const args = prepareArgs(root, operationId);
  args[args.indexOf("--expected-migration") + 1] = CURRENT191_MIGRATION;
  args[args.indexOf("--expected-migration-count") + 1] = "191";
  const previousMigration =
    profile === "current191-bridge"
      ? CURRENT190_MIGRATION
      : CURRENT191_MIGRATION;
  const previousMigrationCount =
    profile === "current191-bridge" ? "190" : "191";
  args[args.indexOf("--previous-migration") + 1] = previousMigration;
  args[args.indexOf("--previous-migration-count") + 1] = previousMigrationCount;
  if (profile === "current191-final") {
    args[args.indexOf("--previous-release-sha") + 1] = RELEASE_SHA;
    args[args.indexOf("--previous-web-build-id") + 1] = RELEASE_SHA;
  }
  args.splice(
    args.indexOf("--fixture-root"),
    0,
    "--slot-runtime-profile",
    profile,
  );
  if (checkReceiptSha256 !== undefined) {
    args.splice(
      args.indexOf("--fixture-root"),
      0,
      "--current191-check-receipt-sha256",
      checkReceiptSha256,
    );
  }
  return args;
}

function continuationArgs(mode, root, planSha256, operationId = OPERATION_ID) {
  return [
    mode,
    "--operation-id",
    operationId,
    "--plan-sha256",
    planSha256,
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ];
}

function supersessionArgs(
  root,
  planSha256,
  replacementReleaseSha = SUCCESSOR_SHA,
) {
  return [
    "supersede-pre-runtime",
    "--operation-id",
    OPERATION_ID,
    "--plan-sha256",
    planSha256,
    "--replacement-release-sha",
    replacementReleaseSha,
    "--fixture-root",
    root,
    "--unprivileged-test-mode",
  ];
}

function rolledBackSupersessionArgs(
  root,
  planSha256,
  replacementReleaseSha = SUCCESSOR_SHA,
  slotBindReceiptSha256 = "0".repeat(64),
  slotRollbackReceiptSha256 = "1".repeat(64),
) {
  const args = supersessionArgs(root, planSha256, replacementReleaseSha);
  args[0] = "supersede-after-bind-rollback";
  args.splice(
    args.indexOf("--fixture-root"),
    0,
    "--slot-bind-receipt-sha256",
    slotBindReceiptSha256,
    "--slot-rollback-receipt-sha256",
    slotRollbackReceiptSha256,
  );
  return args;
}

async function publishFixtureSlotRollback(root) {
  const receiptRoot = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/slot-links",
  );
  const indexPath = path.join(receiptRoot, "blue.latest");
  const indexEntries = parseKv(await readFile(indexPath, "utf8"));
  const index = new Map(indexEntries);
  const bindReceiptPath = index.get("RECEIPT_PATH");
  assert.ok(bindReceiptPath);
  const bindReceipt = await readFile(bindReceiptPath, "utf8");
  const quiesceIntent = JSON.parse(
    await readFile(
      path.join(
        root,
        "var/lib/leetplus/deploy-receipts/release-orchestrator",
        OPERATION_ID,
        "02-bind-quiesce.intent.json",
      ),
      "utf8",
    ),
  );
  const timestamp = (offsetMilliseconds) => {
    const value = new Date(
      new Date(quiesceIntent.createdAt).valueOf() + offsetMilliseconds,
    ).toISOString();
    return value.replace(
      /\.([0-9]{3})Z$/u,
      (_match, milliseconds) => "." + milliseconds + "000000Z",
    );
  };
  const bindEntries = parseKv(bindReceipt).map(([key, value]) => {
    const replacements = new Map([
      ["CREATED_AT", timestamp(1)],
      ["ACCEPTED_AT", timestamp(2)],
    ]);
    return [key, replacements.get(key) ?? value];
  });
  const correlatedBindReceipt = kv(bindEntries);
  await writeFile(bindReceiptPath, correlatedBindReceipt, { mode: 0o600 });
  await chmod(bindReceiptPath, 0o600);
  const bind = new Map(bindEntries);
  const operationId = bind.get("OPERATION_ID");
  const priorReleaseSha = bind.get("PRIOR_RELEASE_SHA");
  const priorTarget = bind.get("PRIOR_TARGET");
  assert.ok(operationId);
  assert.ok(priorReleaseSha);
  assert.ok(priorTarget);
  const rollbackEntries = bindEntries.map(([key, value]) => {
    const replacements = new Map([
      ["OPERATION", "ROLLBACK"],
      ["SOURCE_RECEIPT_SHA256", digest(correlatedBindReceipt)],
      ["CREATED_AT", timestamp(3)],
      ["INTENT_SHA256", "e".repeat(64)],
      ["EFFECT_STATE", "PRIOR_RESTORED"],
      ["ACCEPTED_AT", timestamp(4)],
    ]);
    return [key, replacements.get(key) ?? value];
  });
  const rollbackReceipt = kv(rollbackEntries);
  const rollbackReceiptPath = path.join(
    receiptRoot,
    `blue-${operationId}.rollback.receipt`,
  );
  await writeFile(rollbackReceiptPath, rollbackReceipt, { mode: 0o600 });
  await chmod(rollbackReceiptPath, 0o600);
  await writeFile(
    indexPath,
    kv([
      ["RECORD_VERSION", "1"],
      ["RECORD_KIND", "SLOT_LINK_LATEST"],
      ["SLOT", "blue"],
      ["OPERATION_ID", operationId],
      ["RECEIPT_PATH", rollbackReceiptPath],
      ["RECEIPT_SHA256", digest(rollbackReceipt)],
      ["UPDATED_AT", "2026-09-02T00:01:00.000Z"],
    ]),
    { mode: 0o600 },
  );
  await chmod(indexPath, 0o600);
  const slotPath = path.join(root, "srv/leetplus/slots/blue");
  await rm(slotPath, { force: true });
  await symlink(priorTarget, slotPath);
  for (const unit of [
    "leetplus-api@blue.service",
    "leetplus-web@blue.service",
  ]) {
    await rm(path.join(root, "etc/systemd/system", unit), { force: true });
  }
  const state = await fixtureState(root);
  state.bound = false;
  state.slotFailed = false;
  state.slotMasked = false;
  state.sourceReleaseSha = priorReleaseSha;
  await writeJson(path.join(root, "fixture-state.json"), state);
  return {
    bindReceiptSha256: digest(correlatedBindReceipt),
    rollbackReceiptPath,
    rollbackReceiptSha256: digest(rollbackReceipt),
  };
}

async function preparedFixture(suffix = "", environmentOptions = {}) {
  const root = await setupFixture(suffix, environmentOptions);
  assert.equal(await main(prepareArgs(root)), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  return {
    plan,
    planPath,
    planSha256: canonicalRecordSha256(plan),
    root,
  };
}

async function fixtureState(root) {
  return JSON.parse(
    await readFile(path.join(root, "fixture-state.json"), "utf8"),
  );
}

async function replaceProtectedJson(filePath, value) {
  await chmod(filePath, 0o600);
  await writeJson(filePath, value);
  await chmod(filePath, 0o400);
}

async function rewriteCompletedOperationAsHistorical(root, contractVersion) {
  const directory = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
  );
  const planPath = path.join(directory, "plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.contractVersion = contractVersion;
  delete plan.effectiveLane;
  delete plan.impactReceiptSha256;
  delete plan.current191CheckReceipt;
  delete plan.slotRuntimeProfile;
  await replaceProtectedJson(planPath, plan);
  const planSha256 = canonicalRecordSha256(plan);

  const approvalPath = path.join(directory, "approval.json");
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  approval.contractVersion = contractVersion;
  approval.planSha256 = planSha256;
  await replaceProtectedJson(approvalPath, approval);

  let previousPhaseReceiptSha256 = "";
  for (const [index, phase] of PHASES.entries()) {
    const prefix =
      String(index + 1).padStart(2, "0") + "-" + phase.toLowerCase();
    const intentPath = path.join(directory, prefix + ".intent.json");
    const evidencePath = path.join(directory, prefix + ".evidence.json");
    const receiptPath = path.join(directory, prefix + ".receipt.json");
    const intent = JSON.parse(await readFile(intentPath, "utf8"));
    intent.contractVersion = contractVersion;
    intent.planSha256 = planSha256;
    intent.previousPhaseReceiptSha256 = previousPhaseReceiptSha256;
    await replaceProtectedJson(intentPath, intent);
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    evidence.contractVersion = contractVersion;
    evidence.planSha256 = planSha256;
    if (contractVersion === V2_CONTRACT_VERSION && phase === "BIND") {
      delete evidence.details.slotEnvironmentApiBindHostNormalization;
      delete evidence.details.slotEnvironmentPath;
      delete evidence.details.slotEnvironmentPreviousPath;
      delete evidence.details.slotEnvironmentPreviousSha256;
      delete evidence.details.slotEnvironmentSha256;
    }
    await replaceProtectedJson(evidencePath, evidence);
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.contractVersion = contractVersion;
    receipt.planSha256 = planSha256;
    receipt.previousPhaseReceiptSha256 = previousPhaseReceiptSha256;
    receipt.intentSha256 = canonicalRecordSha256(intent);
    receipt.evidenceSha256 = canonicalRecordSha256(evidence);
    await replaceProtectedJson(receiptPath, receipt);
    previousPhaseReceiptSha256 = canonicalRecordSha256(receipt);
  }

  const finalPath = path.join(directory, "final.json");
  const final = JSON.parse(await readFile(finalPath, "utf8"));
  final.contractVersion = contractVersion;
  final.planSha256 = planSha256;
  final.lastPhaseReceiptSha256 = previousPhaseReceiptSha256;
  await replaceProtectedJson(finalPath, final);
}

function nextPrepareArgs(root) {
  const args = prepareArgs(root, SECOND_OPERATION_ID);
  args[args.indexOf("--slot") + 1] = "green";
  args[args.indexOf("--previous-release-sha") + 1] = RELEASE_SHA;
  args[args.indexOf("--previous-web-build-id") + 1] = RELEASE_SHA;
  return args;
}

async function rearmFixtureForGreenRollout(root) {
  const state = await fixtureState(root);
  state.baselineGeneration += 1;
  state.bound = false;
  state.cutover = false;
  state.previousSlot = "blue";
  // The first cutover makes blue active on the new release; green remains the
  // inactive, still-old slot until this second plan binds it.
  state.sourceReleaseSha = PREVIOUS_SHA;
  state.targetSlot = "green";
  await writeJson(path.join(root, "fixture-state.json"), state);
}

if (process.platform !== "linux" || process.getuid?.() === 0) {
  process.stdout.write(
    "resumable release orchestrator test: SKIP " +
      "(requires unprivileged Linux)\n",
  );
  process.exit(0);
}

test("runs five phases and publishes a chained final receipt", async (t) => {
  const fixture = await preparedFixture("complete-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 1);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.cutoverEffects, 1);
  assert.equal(state.maskEffects, 1);
  assert.equal(state.resetFailedCalls, 1);
  assert.equal(state.unmaskEffects, 1);
  assert.equal(state.slotMasked, false);
  const operationRoot = path.dirname(fixture.planPath);
  const acceptedSlotEnvironment = await readFile(
    path.join(fixture.root, "etc/leetplus/slots/blue.env"),
    "utf8",
  );
  assert.ok(acceptedSlotEnvironment.includes("RELEASE_SHA=" + RELEASE_SHA));
  assert.ok(
    acceptedSlotEnvironment.includes("BUILD_TIME=" + fixture.plan.preparedAt),
  );
  assert.match(acceptedSlotEnvironment, /API_BIND_HOST=127\.0\.0\.1/u);
  assert.doesNotMatch(acceptedSlotEnvironment, /API_BIND_HOST=localhost/u);
  assert.match(acceptedSlotEnvironment, /GUEST_BUG_REPORTING_MODE=LIVE/u);
  assert.equal(
    await readFile(
      path.join(operationRoot, "02-bind-slot-environment.previous.env"),
      "utf8",
    ),
    slotEnvironment("blue"),
  );
  const bindEvidence = JSON.parse(
    await readFile(path.join(operationRoot, "02-bind.evidence.json"), "utf8"),
  );
  assert.equal(
    bindEvidence.details.slotEnvironmentApiBindHostNormalization,
    "LEGACY_LOCALHOST_TO_IPV4_LOOPBACK",
  );
  const final = JSON.parse(
    await readFile(path.join(operationRoot, "final.json"), "utf8"),
  );
  assert.equal(final.decision, COMPLETE_DECISION);
  const metricEntries = await readdir(
    path.join(
      fixture.root,
      "var/lib/leetplus/deploy-receipts/release-orchestrator-metrics",
    ),
  );
  assert.equal(metricEntries.length, 1);
  const metric = JSON.parse(
    await readFile(
      path.join(
        fixture.root,
        "var/lib/leetplus/deploy-receipts/release-orchestrator-metrics",
        metricEntries[0],
      ),
      "utf8",
    ),
  );
  assert.equal(metric.effectiveLane, "L1_RUNTIME");
  assert.equal(metric.outcome, "COMPLETED");
  assert.equal(metric.failurePhase, "NONE");
  assert.equal(metric.reasonClass, "NONE");
  for (const [index, phase] of PHASES.entries()) {
    const prefix =
      String(index + 1).padStart(2, "0") + "-" + phase.toLowerCase();
    await lstat(path.join(operationRoot, prefix + ".intent.json"));
    await lstat(path.join(operationRoot, prefix + ".evidence.json"));
    await lstat(path.join(operationRoot, prefix + ".receipt.json"));
  }
  assert.equal(
    await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
    0,
  );
  assert.deepEqual(await fixtureState(fixture.root), state);
});

test("reuses an exact release hydration attestation across the opposite slot", async (t) => {
  const fixture = await preparedFixture("cross-slot-hydration-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const hydrationReceipt = await readFile(
    path.join(
      fixture.root,
      "var/lib/leetplus/deploy-receipts",
      `release-hydration-attestation-${RELEASE_SHA}.receipt`,
    ),
    "utf8",
  );
  assert.match(hydrationReceipt, /^RELEASE_SLOT=blue$/mu);
  await rearmFixtureForGreenRollout(fixture.root);
  assert.equal(await main(nextPrepareArgs(fixture.root)), 0);
  const secondPlanPath = path.join(
    fixture.root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    SECOND_OPERATION_ID,
    "plan.json",
  );
  const secondPlan = JSON.parse(await readFile(secondPlanPath, "utf8"));
  assert.equal(
    await main(
      continuationArgs(
        "apply",
        fixture.root,
        canonicalRecordSha256(secondPlan),
        SECOND_OPERATION_ID,
      ),
    ),
    0,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 1);
  assert.equal(state.promoteCalls, 2);
  assert.equal(state.bindEffects, 2);
  assert.equal(state.cutoverEffects, 2);
  assert.equal(
    await readFile(
      path.join(
        fixture.root,
        "var/lib/leetplus/deploy-receipts",
        `release-hydration-attestation-${RELEASE_SHA}.receipt`,
      ),
      "utf8",
    ),
    hydrationReceipt,
  );
});

test("rejects a hydration receipt whose origin is not a reviewed slot", async (t) => {
  const fixture = await preparedFixture("invalid-hydration-origin-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const hydrationReceiptPath = path.join(
    fixture.root,
    "var/lib/leetplus/deploy-receipts",
    `release-hydration-attestation-${RELEASE_SHA}.receipt`,
  );
  const entries = parseKv(await readFile(hydrationReceiptPath, "utf8")).map(
    ([key, value]) => [key, key === "RELEASE_SLOT" ? "unreviewed" : value],
  );
  await writeFile(hydrationReceiptPath, kv(entries), { mode: 0o600 });
  await rearmFixtureForGreenRollout(fixture.root);
  assert.equal(await main(nextPrepareArgs(fixture.root)), 0);
  const secondPlan = JSON.parse(
    await readFile(
      path.join(
        fixture.root,
        "var/lib/leetplus/deploy-receipts/release-orchestrator",
        SECOND_OPERATION_ID,
        "plan.json",
      ),
      "utf8",
    ),
  );
  assert.equal(
    await main(
      continuationArgs(
        "apply",
        fixture.root,
        canonicalRecordSha256(secondPlan),
        SECOND_OPERATION_ID,
      ),
    ),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.cutoverEffects, 1);
});

for (const [label, contractVersion] of [
  ["pre-lane V3", CONTRACT_VERSION],
  ["exact V2", V2_CONTRACT_VERSION],
]) {
  test(`accepts completed ${label} history before a new prepare`, async (t) => {
    const fixture = await preparedFixture(
      `historical-${label.replaceAll(" ", "-")}-`,
    );
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      0,
    );
    await rewriteCompletedOperationAsHistorical(fixture.root, contractVersion);
    assert.equal(await main(nextPrepareArgs(fixture.root)), 0);
  });
}

test("preserves an already canonical IPv4 loopback bind host", async (t) => {
  const fixture = await preparedFixture("canonical-bind-host-", {
    apiBindHost: "127.0.0.1",
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const operationRoot = path.dirname(fixture.planPath);
  assert.equal(
    await readFile(
      path.join(operationRoot, "02-bind-slot-environment.previous.env"),
      "utf8",
    ),
    slotEnvironment("blue", PREVIOUS_SHA, { apiBindHost: "127.0.0.1" }),
  );
  const bindEvidence = JSON.parse(
    await readFile(path.join(operationRoot, "02-bind.evidence.json"), "utf8"),
  );
  assert.equal(
    bindEvidence.details.slotEnvironmentApiBindHostNormalization,
    "NONE",
  );
});

test("authorizes only the exact CURRENT191 pre-schema bridge profile", async (t) => {
  const sourceOptions = {
    bridgeMode: "OFF",
    bugReportingMode: "LIVE",
    migration: CURRENT190_MIGRATION,
    migrationCount: 190,
  };
  const root = await setupFixture("current191-bridge-", sourceOptions);
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await main(current191PrepareArgs(root, "current191-bridge")), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(plan.slotRuntimeProfile, "current191-bridge");
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    0,
  );
  const accepted = await readFile(
    path.join(root, "etc/leetplus/slots/blue.env"),
    "utf8",
  );
  assert.match(
    accepted,
    /EXPECTED_DATABASE_MIGRATION=20260908180000_external_langame_simple_onboarding/u,
  );
  assert.match(accepted, /EXPECTED_DATABASE_MIGRATION_COUNT=191/u);
  assert.match(accepted, /GUEST_BUG_REPORTING_MODE=OFF/u);
  assert.match(accepted, /GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_190/u);
  assert.equal(
    await readFile(
      path.join(
        path.dirname(planPath),
        "02-bind-slot-environment.previous.env",
      ),
      "utf8",
    ),
    slotEnvironment("blue", PREVIOUS_SHA, sourceOptions),
  );
});

test("repins an exact CURRENT191 bridge slot to a new admitted release", async (t) => {
  const sourceOptions = {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
  };
  const root = await setupFixture("current191-bridge-repin-", sourceOptions);
  t.after(() => rm(root, { recursive: true, force: true }));
  const args = current191PrepareArgs(root, "current191-bridge");
  args[args.indexOf("--previous-migration") + 1] = CURRENT191_MIGRATION;
  args[args.indexOf("--previous-migration-count") + 1] = "191";
  assert.equal(await main(args), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    0,
  );
  const accepted = await readFile(
    path.join(root, "etc/leetplus/slots/blue.env"),
    "utf8",
  );
  assert.match(accepted, new RegExp(`RELEASE_SHA=${RELEASE_SHA}`, "u"));
  assert.match(accepted, /EXPECTED_DATABASE_MIGRATION_COUNT=191/u);
  assert.match(accepted, /GUEST_BUG_REPORTING_MODE=OFF/u);
  assert.match(accepted, /GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_190/u);
  assert.equal(
    await readFile(
      path.join(
        path.dirname(planPath),
        "02-bind-slot-environment.previous.env",
      ),
      "utf8",
    ),
    slotEnvironment("blue", PREVIOUS_SHA, sourceOptions),
  );
});

test("bridges an inactive CURRENT190 slot after the active slot reached CURRENT191 bridge", async (t) => {
  const activeOptions = {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
  };
  const root = await setupFixture(
    "current191-cross-slot-current190-",
    activeOptions,
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const inactiveRelease = path.join(
    root,
    "srv/leetplus/releases",
    SUCCESSOR_SHA,
  );
  await mkdir(inactiveRelease, { recursive: true });
  const inactiveSlot = path.join(root, "srv/leetplus/slots/blue");
  await rm(inactiveSlot, { force: true });
  await symlink(inactiveRelease, inactiveSlot);
  const inactiveEnvironment = path.join(root, "etc/leetplus/slots/blue.env");
  await chmod(inactiveEnvironment, 0o600);
  await writeFile(
    inactiveEnvironment,
    slotEnvironment("blue", SUCCESSOR_SHA, {
      bridgeMode: "OFF",
      bugReportingMode: "LIVE",
      migration: CURRENT190_MIGRATION,
      migrationCount: 190,
    }),
  );
  await chmod(inactiveEnvironment, 0o440);
  const state = await fixtureState(root);
  state.sourceReleaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(root, "fixture-state.json"), state);

  const args = current191PrepareArgs(root, "current191-bridge");
  args[args.indexOf("--previous-migration") + 1] = CURRENT191_MIGRATION;
  args[args.indexOf("--previous-migration-count") + 1] = "191";
  assert.equal(await main(args), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    0,
  );
  assert.equal(
    await readFile(
      path.join(
        path.dirname(planPath),
        "02-bind-slot-environment.previous.env",
      ),
      "utf8",
    ),
    slotEnvironment("blue", SUCCESSOR_SHA, {
      bridgeMode: "OFF",
      bugReportingMode: "LIVE",
      migration: CURRENT190_MIGRATION,
      migrationCount: 190,
    }),
  );
  const accepted = await readFile(inactiveEnvironment, "utf8");
  assert.match(accepted, new RegExp(`RELEASE_SHA=${RELEASE_SHA}`, "u"));
  assert.match(accepted, /EXPECTED_DATABASE_MIGRATION_COUNT=191/u);
  assert.match(accepted, /GUEST_BUG_REPORTING_MODE=OFF/u);
  assert.match(accepted, /GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=ALLOW_CURRENT_190/u);
});

test("rejects active-profile drift on a cross-slot CURRENT191 bridge", async (t) => {
  const root = await setupFixture("current191-cross-slot-reject-", {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const inactiveRelease = path.join(
    root,
    "srv/leetplus/releases",
    SUCCESSOR_SHA,
  );
  await mkdir(inactiveRelease, { recursive: true });
  const inactiveSlot = path.join(root, "srv/leetplus/slots/blue");
  await rm(inactiveSlot, { force: true });
  await symlink(inactiveRelease, inactiveSlot);
  const inactiveEnvironment = path.join(root, "etc/leetplus/slots/blue.env");
  await chmod(inactiveEnvironment, 0o600);
  await writeFile(
    inactiveEnvironment,
    slotEnvironment("blue", SUCCESSOR_SHA, {
      bridgeMode: "OFF",
      bugReportingMode: "LIVE",
      migration: CURRENT190_MIGRATION,
      migrationCount: 190,
    }),
  );
  await chmod(inactiveEnvironment, 0o440);
  const state = await fixtureState(root);
  state.sourceReleaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(root, "fixture-state.json"), state);

  const args = current191PrepareArgs(root, "current191-bridge");
  args[args.indexOf("--previous-migration") + 1] = CURRENT191_MIGRATION;
  args[args.indexOf("--previous-migration-count") + 1] = "191";
  assert.equal(await main(args), 0);
  const activeEnvironment = path.join(root, "etc/leetplus/slots/green.env");
  await chmod(activeEnvironment, 0o600);
  await writeFile(
    activeEnvironment,
    slotEnvironment("green", PREVIOUS_SHA, {
      bridgeMode: "OFF",
      bugReportingMode: "LIVE",
      migration: CURRENT191_MIGRATION,
      migrationCount: 191,
    }),
  );
  await chmod(activeEnvironment, 0o440);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    1,
  );
  const after = await fixtureState(root);
  assert.equal(after.bindEffects, 1);
  assert.equal(after.slotMasked, true);
  assert.equal(after.cutoverEffects, 0);
});

test("authorizes only the exact CURRENT191 final runtime profile", async (t) => {
  const sourceOptions = {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
    releaseSha: RELEASE_SHA,
  };
  const root = await setupFixture("current191-final-", sourceOptions);
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkReceipt = await publishCurrent191CheckReceipt(root);
  assert.equal(
    await main(
      current191PrepareArgs(root, "current191-final", {
        checkReceiptSha256: checkReceipt.receiptSha256,
      }),
    ),
    0,
  );
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(plan.slotRuntimeProfile, "current191-final");
  assert.deepEqual(plan.current191CheckReceipt, {
    receiptSha256: checkReceipt.receiptSha256,
    schemaPlanDigest: CURRENT191_SCHEMA_PLAN_DIGEST,
  });
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    0,
  );
  const accepted = await readFile(
    path.join(root, "etc/leetplus/slots/blue.env"),
    "utf8",
  );
  assert.match(accepted, /EXPECTED_DATABASE_MIGRATION_COUNT=191/u);
  assert.match(accepted, /GUEST_BUG_REPORTING_MODE=LIVE/u);
  assert.match(accepted, /GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=OFF/u);
});

test("rejects CURRENT191 final before a protected schema check receipt exists", async (t) => {
  const root = await setupFixture("current191-final-without-check-", {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
    releaseSha: RELEASE_SHA,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await main(current191PrepareArgs(root, "current191-final")), 1);
  await assert.rejects(
    lstat(
      path.join(root, "var/lib/leetplus/deploy-receipts/release-orchestrator"),
    ),
    { code: "ENOENT" },
  );
  const state = await fixtureState(root);
  assert.equal(state.maskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects a mutable CURRENT191 schema check receipt before recording an operation", async (t) => {
  const root = await setupFixture("current191-final-mutable-check-", {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
    releaseSha: RELEASE_SHA,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkReceipt = await publishCurrent191CheckReceipt(root);
  await chmod(checkReceipt.receiptPath, 0o600);
  assert.equal(
    await main(
      current191PrepareArgs(root, "current191-final", {
        checkReceiptSha256: checkReceipt.receiptSha256,
      }),
    ),
    1,
  );
  await assert.rejects(
    lstat(
      path.join(
        root,
        "var/lib/leetplus/deploy-receipts/release-orchestrator",
        OPERATION_ID,
      ),
    ),
    { code: "ENOENT" },
  );
  const state = await fixtureState(root);
  assert.equal(state.maskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects a foreign CURRENT191 schema check receipt before recording an operation", async (t) => {
  const root = await setupFixture("current191-final-foreign-release-check-", {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
    releaseSha: RELEASE_SHA,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkReceipt = await publishCurrent191CheckReceipt(root, {
    releaseSha: PREVIOUS_SHA,
  });
  assert.equal(
    await main(
      current191PrepareArgs(root, "current191-final", {
        checkReceiptSha256: checkReceipt.receiptSha256,
      }),
    ),
    1,
  );
  await assert.rejects(
    lstat(
      path.join(
        root,
        "var/lib/leetplus/deploy-receipts/release-orchestrator",
        OPERATION_ID,
      ),
    ),
    { code: "ENOENT" },
  );
  const state = await fixtureState(root);
  assert.equal(state.maskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects a CURRENT191 bridge transition outside its two exact source profiles", async (t) => {
  const root = await setupFixture("current191-bridge-wrong-source-", {
    migration: MIGRATION,
    migrationCount: 189,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await main(current191PrepareArgs(root, "current191-bridge")), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    1,
  );
  const state = await fixtureState(root);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects a CURRENT191 final transition unless the source is the exact bridge profile", async (t) => {
  const sourceOptions = {
    bridgeMode: "OFF",
    bugReportingMode: "LIVE",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
    releaseSha: RELEASE_SHA,
  };
  const root = await setupFixture(
    "current191-final-wrong-source-profile-",
    sourceOptions,
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkReceipt = await publishCurrent191CheckReceipt(root);
  assert.equal(
    await main(
      current191PrepareArgs(root, "current191-final", {
        checkReceiptSha256: checkReceipt.receiptSha256,
      }),
    ),
    0,
  );
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    1,
  );
  const state = await fixtureState(root);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
  assert.equal(
    await readFile(path.join(root, "etc/leetplus/slots/blue.env"), "utf8"),
    slotEnvironment("blue", RELEASE_SHA, sourceOptions),
  );
});

test("rejects CURRENT191 finalization from a different release SHA", async (t) => {
  const sourceOptions = {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
  };
  const root = await setupFixture(
    "current191-final-wrong-source-release-",
    sourceOptions,
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkReceipt = await publishCurrent191CheckReceipt(root);
  const args = current191PrepareArgs(root, "current191-final", {
    checkReceiptSha256: checkReceipt.receiptSha256,
  });
  args[args.indexOf("--previous-release-sha") + 1] = PREVIOUS_SHA;
  args[args.indexOf("--previous-web-build-id") + 1] = PREVIOUS_SHA;
  assert.equal(await main(args), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  assert.equal(
    await main(continuationArgs("apply", root, canonicalRecordSha256(plan))),
    1,
  );
  const state = await fixtureState(root);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects a CURRENT191 runtime profile for any other target before recording an operation", async (t) => {
  const root = await setupFixture("current191-profile-wrong-target-", {
    migration: CURRENT190_MIGRATION,
    migrationCount: 190,
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const args = current191PrepareArgs(root, "current191-bridge");
  args[args.indexOf("--expected-migration") + 1] = CURRENT190_MIGRATION;
  args[args.indexOf("--expected-migration-count") + 1] = "190";
  assert.equal(await main(args), 1);
  await assert.rejects(
    lstat(
      path.join(root, "var/lib/leetplus/deploy-receipts/release-orchestrator"),
    ),
    { code: "ENOENT" },
  );
  const state = await fixtureState(root);
  assert.equal(state.maskEffects, 0);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("normalizes a stopped failed target before cache and bind", async (t) => {
  const fixture = await preparedFixture("reset-failed-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const state = await fixtureState(fixture.root);
  state.slotFailed = true;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const after = await fixtureState(fixture.root);
  assert.equal(after.resetFailedCalls, 1);
  assert.equal(after.resetFailedEffects, 1);
  assert.equal(after.slotFailed, false);
  assert.equal(after.bindEffects, 1);
  assert.equal(after.cutoverEffects, 1);
});

test("rejects slot environment lineage drift while the rebound target is fenced", async (t) => {
  const fixture = await preparedFixture("slot-environment-lineage-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const environmentPath = path.join(
    fixture.root,
    "etc/leetplus/slots/blue.env",
  );
  await chmod(environmentPath, 0o600);
  await writeFile(environmentPath, slotEnvironment("blue", "c".repeat(40)));
  await chmod(environmentPath, 0o440);
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects every noncanonical nonlegacy API bind host while fenced", async (t) => {
  const fixture = await preparedFixture("slot-environment-bind-host-drift-", {
    apiBindHost: "localhost.",
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

for (const bridgeMode of ["ALLOW_CURRENT_189", "ALLOW_CURRENT_190"]) {
  test(`preserves the valid reporting-off ${bridgeMode} schema bridge pair`, async (t) => {
    const options = { bridgeMode, bugReportingMode: "OFF" };
    const fixture = await preparedFixture("slot-environment-bridge-", options);
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      0,
    );
    const accepted = await readFile(
      path.join(fixture.root, "etc/leetplus/slots/blue.env"),
      "utf8",
    );
    assert.match(accepted, /GUEST_BUG_REPORTING_MODE=OFF/u);
    assert.match(
      accepted,
      new RegExp(`GUEST_SUPPORT_SCHEMA_BRIDGE_MODE=${bridgeMode}`, "u"),
    );
    assert.equal(
      await readFile(
        path.join(
          path.dirname(fixture.planPath),
          "02-bind-slot-environment.previous.env",
        ),
        "utf8",
      ),
      slotEnvironment("blue", PREVIOUS_SHA, options),
    );
  });
}

test("rejects an unadmitted schema bridge value while fenced", async (t) => {
  const fixture = await preparedFixture("slot-environment-unadmitted-bridge-", {
    bridgeMode: "ALLOW_CURRENT_191",
    bugReportingMode: "OFF",
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects LIVE reporting against a schema bridge while fenced", async (t) => {
  const fixture = await preparedFixture("slot-environment-unsafe-bridge-", {
    bridgeMode: "ALLOW_CURRENT_187",
    bugReportingMode: "LIVE",
  });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("retries only a failed loopback readiness probe in one apply", async (t) => {
  const fixture = await preparedFixture("readiness-retry-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_READINESS_ONCE = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      0,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_READINESS_ONCE;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.readinessFailures, 1);
  assert.equal(state.readinessCalls, 3);
  assert.equal(state.cutoverEffects, 1);
});

test("stops after the exact bounded loopback readiness attempts", async (t) => {
  const fixture = await preparedFixture("readiness-exhausted-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_READINESS_ALWAYS = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_READINESS_ALWAYS;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.readinessCalls, 12);
  assert.equal(state.readinessFailures, 12);
  assert.equal(state.authCalls, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("accepts exact durable cutover evidence despite diagnostic stderr", async (t) => {
  const fixture = await preparedFixture("cutover-stderr-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_STDERR_AFTER_EFFECT = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      0,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_STDERR_AFTER_EFFECT;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.cutoverCalls, 1);
  assert.equal(state.cutoverEffects, 1);
  await lstat(path.join(path.dirname(fixture.planPath), "final.json"));
});

test("rejects cutover stderr when no exact successor receipt exists", async (t) => {
  const fixture = await preparedFixture("cutover-stderr-without-effect-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_STDERR_WITHOUT_EFFECT = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_STDERR_WITHOUT_EFFECT;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.cutoverCalls, 1);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects an exact cutover receipt when the active link did not move", async (t) => {
  const fixture = await preparedFixture("cutover-receipt-without-link-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_CUTOVER_RECEIPT_WITHOUT_ACTIVE_LINK =
    "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env
      .TEST_ORCHESTRATOR_FIXTURE_CUTOVER_RECEIPT_WITHOUT_ACTIVE_LINK;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.cutoverCalls, 1);
  assert.equal(state.cutoverEffects, 1);
  assert.equal(
    await realpath(
      path.join(fixture.root, "etc/nginx/leetplus/active-upstreams.conf"),
    ),
    path.join(fixture.root, "etc/nginx/leetplus/upstreams/green.conf"),
  );
  await assert.rejects(
    lstat(
      path.join(path.dirname(fixture.planPath), "04-cutover.evidence.json"),
    ),
    { code: "ENOENT" },
  );
  await assert.rejects(
    lstat(path.join(path.dirname(fixture.planPath), "final.json")),
    { code: "ENOENT" },
  );
});

for (const phase of PHASES) {
  test("recovers exact lost response after " + phase, async (t) => {
    const fixture = await preparedFixture("lost-" + phase.toLowerCase() + "-");
    t.after(() => rm(fixture.root, { recursive: true, force: true }));
    process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE = phase;
    try {
      assert.equal(
        await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
        1,
      );
    } finally {
      delete process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE;
    }
    assert.equal(
      await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
      0,
    );
    const state = await fixtureState(fixture.root);
    assert.equal(state.hydrationEffects, 1);
    assert.equal(state.bindEffects, 1);
    assert.equal(state.cutoverEffects, 1);
    if (phase === "BIND") {
      const operationRoot = path.dirname(fixture.planPath);
      const accepted = await readFile(
        path.join(fixture.root, "etc/leetplus/slots/blue.env"),
        "utf8",
      );
      assert.match(accepted, /API_BIND_HOST=127\.0\.0\.1/u);
      assert.equal(
        await readFile(
          path.join(operationRoot, "02-bind-slot-environment.previous.env"),
          "utf8",
        ),
        slotEnvironment("blue"),
      );
    }
  });
}

for (const phase of PHASES) {
  test(
    "re-attests exact evidence after receipt publication was lost for " + phase,
    async (t) => {
      const fixture = await preparedFixture(
        "evidence-lost-" + phase.toLowerCase() + "-",
      );
      t.after(() => rm(fixture.root, { recursive: true, force: true }));
      process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_EVIDENCE = phase;
      try {
        assert.equal(
          await main(
            continuationArgs("apply", fixture.root, fixture.planSha256),
          ),
          1,
        );
      } finally {
        delete process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_EVIDENCE;
      }
      assert.equal(
        await main(
          continuationArgs("resume", fixture.root, fixture.planSha256),
        ),
        0,
      );
      const state = await fixtureState(fixture.root);
      assert.equal(state.hydrationEffects, 1);
      assert.equal(state.bindEffects, 1);
      assert.equal(state.cutoverEffects, 1);
    },
  );
}

test("rejects control drift before the first phase effect", async (t) => {
  const fixture = await preparedFixture("control-drift-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const state = await fixtureState(fixture.root);
  state.controlVariant = "B";
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const after = await fixtureState(fixture.root);
  assert.equal(after.hydrationEffects, 0);
  assert.equal(after.bindEffects, 0);
  assert.equal(after.cutoverEffects, 0);
});

test("does not adopt or remove a pre-existing operator mask", async (t) => {
  const fixture = await preparedFixture("preexisting-mask-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const state = await fixtureState(fixture.root);
  state.slotMasked = true;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  for (const unit of [
    "leetplus-api@blue.service",
    "leetplus-web@blue.service",
  ]) {
    await symlink(
      "/dev/null",
      path.join(fixture.root, "etc/systemd/system", unit),
    );
  }
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const after = await fixtureState(fixture.root);
  assert.equal(after.slotMasked, true);
  assert.equal(after.maskCalls, 0);
  assert.equal(after.unmaskCalls, 0);
  assert.equal(after.bindEffects, 0);
  assert.equal(after.cutoverEffects, 0);
});

test("retries a transient cache failure while the target remains masked", async (t) => {
  const fixture = await preparedFixture("masked-cache-retry-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      0,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.maskEffects, 1);
  assert.equal(state.cacheCalls, 2);
  assert.equal(state.cacheFailures, 1);
  assert.equal(state.unmaskEffects, 1);
  assert.equal(state.slotMasked, false);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.cutoverEffects, 1);
});

test("keeps a target fenced after bounded cache retries are exhausted", async (t) => {
  const fixture = await preparedFixture("masked-cache-exhausted-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ALWAYS = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ALWAYS;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.cacheCalls, 3);
  assert.equal(state.cacheFailures, 3);
  assert.equal(state.slotMasked, true);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects a tampered quiesce intent and keeps the target masked", async (t) => {
  const fixture = await preparedFixture("masked-intent-tamper-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ALWAYS = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ALWAYS;
  }
  const quiesceIntent = path.join(
    path.dirname(fixture.planPath),
    "02-bind-quiesce.intent.json",
  );
  const record = JSON.parse(await readFile(quiesceIntent, "utf8"));
  record.releaseSha = "c".repeat(40);
  await chmod(quiesceIntent, 0o600);
  await writeJson(quiesceIntent, record);
  assert.equal(
    await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.slotMasked, true);
  assert.equal(state.unmaskCalls, 0);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("resumes after bind when the first unmask attempt fails", async (t) => {
  const fixture = await preparedFixture("masked-unmask-recovery-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_UNMASK_ONCE = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_UNMASK_ONCE;
  }
  let state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.runtimeStartCalls, 0);
  assert.equal(
    await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
    0,
  );
  state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.unmaskFailures, 1);
  assert.equal(state.unmaskEffects, 1);
  assert.equal(state.slotMasked, false);
  assert.equal(state.cutoverEffects, 1);
});

test("enforces one incomplete orchestrator operation", async (t) => {
  const fixture = await preparedFixture("single-flight-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(await main(prepareArgs(fixture.root, SECOND_OPERATION_ID)), 1);
  const state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 0);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("supersedes an approved HYDRATE-intent operation before runtime effects", async (t) => {
  const fixture = await preparedFixture("pre-runtime-supersession-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE = "HYDRATE";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE;
  }
  let state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 1);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.runtimeStartCalls, 0);
  assert.equal(state.cutoverEffects, 0);
  assert.equal(
    await main(
      supersessionArgs(fixture.root, fixture.planSha256, RELEASE_SHA),
    ),
    1,
  );
  await assert.rejects(
    lstat(path.join(path.dirname(fixture.planPath), "superseded.json")),
    { code: "ENOENT" },
  );
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(supersessionArgs(fixture.root, fixture.planSha256)),
    0,
  );
  assert.equal(
    await main(supersessionArgs(fixture.root, fixture.planSha256)),
    0,
  );
  const supersessionPath = path.join(
    path.dirname(fixture.planPath),
    "superseded.json",
  );
  const supersession = JSON.parse(await readFile(supersessionPath, "utf8"));
  assert.equal(supersession.decision, SUPERSEDED_DECISION);
  assert.equal(supersession.completedPhases, 0);
  assert.equal(supersession.pendingPhase, "HYDRATE");
  assert.equal(supersession.pendingRecord, "INTENT");
  assert.equal(supersession.releaseSha, RELEASE_SHA);
  assert.equal(supersession.replacementReleaseSha, SUCCESSOR_SHA);
  assert.match(supersession.approvalSha256, /^[0-9a-f]{64}$/u);
  assert.match(supersession.pendingIntentSha256, /^[0-9a-f]{64}$/u);
  state.releaseSha = FOLLOWING_SHA;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(supersessionArgs(fixture.root, fixture.planSha256)),
    0,
  );
  assert.equal(
    await main(
      supersessionArgs(fixture.root, fixture.planSha256, FOLLOWING_SHA),
    ),
    1,
  );
  assert.equal(
    await main(continuationArgs("status", fixture.root, fixture.planSha256)),
    0,
  );
  assert.equal(
    await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
    1,
  );
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  const nextArgs = prepareArgs(fixture.root, SECOND_OPERATION_ID);
  nextArgs[nextArgs.indexOf("--release-sha") + 1] = SUCCESSOR_SHA;
  assert.equal(await main(nextArgs), 0);
  state = await fixtureState(fixture.root);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.runtimeStartCalls, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("rejects supersession without an approval and pending HYDRATE intent", async (t) => {
  const fixture = await preparedFixture("pre-runtime-supersession-unapproved-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const state = await fixtureState(fixture.root);
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(supersessionArgs(fixture.root, fixture.planSha256)),
    1,
  );
  await assert.rejects(
    lstat(path.join(path.dirname(fixture.planPath), "superseded.json")),
    { code: "ENOENT" },
  );
});

test("rejects a tampered supersession receipt and keeps new prepare blocked", async (t) => {
  const fixture = await preparedFixture("pre-runtime-supersession-tampered-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE = "HYDRATE";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE;
  }
  const state = await fixtureState(fixture.root);
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(supersessionArgs(fixture.root, fixture.planSha256)),
    0,
  );
  const supersessionPath = path.join(
    path.dirname(fixture.planPath),
    "superseded.json",
  );
  const supersession = JSON.parse(await readFile(supersessionPath, "utf8"));
  supersession.pendingIntentSha256 = "0".repeat(64);
  await replaceProtectedJson(supersessionPath, supersession);
  assert.equal(
    await main(continuationArgs("status", fixture.root, fixture.planSha256)),
    1,
  );
  const nextArgs = prepareArgs(fixture.root, SECOND_OPERATION_ID);
  nextArgs[nextArgs.indexOf("--release-sha") + 1] = SUCCESSOR_SHA;
  assert.equal(await main(nextArgs), 1);
  const after = await fixtureState(fixture.root);
  assert.equal(after.bindEffects, 0);
  assert.equal(after.runtimeStartCalls, 0);
  assert.equal(after.cutoverEffects, 0);
});

test("rejects supersession after any phase has been accepted", async (t) => {
  const fixture = await preparedFixture("pre-runtime-supersession-too-late-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE = "BIND";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_LOST_RESPONSE_AFTER_PHASE;
  }
  const state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 1);
  assert.equal(state.bindEffects, 1);
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(fixture.root, "fixture-state.json"), state);
  assert.equal(
    await main(supersessionArgs(fixture.root, fixture.planSha256)),
    1,
  );
  await assert.rejects(
    lstat(path.join(path.dirname(fixture.planPath), "superseded.json")),
    { code: "ENOENT" },
  );
});

test("terminalizes an exact failed cross-slot bridge only after receipt-bound bind rollback", async (t) => {
  const activeOptions = {
    bridgeMode: "ALLOW_CURRENT_190",
    bugReportingMode: "OFF",
    migration: CURRENT191_MIGRATION,
    migrationCount: 191,
  };
  const root = await setupFixture(
    "post-bind-rollback-supersession-",
    activeOptions,
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const inactiveRelease = path.join(
    root,
    "srv/leetplus/releases",
    FOLLOWING_SHA,
  );
  await mkdir(inactiveRelease, { recursive: true });
  const inactiveSlot = path.join(root, "srv/leetplus/slots/blue");
  await rm(inactiveSlot, { force: true });
  await symlink(inactiveRelease, inactiveSlot);
  const inactiveEnvironment = path.join(root, "etc/leetplus/slots/blue.env");
  await chmod(inactiveEnvironment, 0o600);
  await writeFile(
    inactiveEnvironment,
    slotEnvironment("blue", FOLLOWING_SHA, {
      bridgeMode: "OFF",
      bugReportingMode: "LIVE",
      migration: CURRENT190_MIGRATION,
      migrationCount: 190,
    }),
  );
  await chmod(inactiveEnvironment, 0o440);
  let state = await fixtureState(root);
  state.sourceReleaseSha = FOLLOWING_SHA;
  await writeJson(path.join(root, "fixture-state.json"), state);

  const args = current191PrepareArgs(root, "current191-bridge");
  args[args.indexOf("--previous-migration") + 1] = CURRENT191_MIGRATION;
  args[args.indexOf("--previous-migration-count") + 1] = "191";
  assert.equal(await main(args), 0);
  const planPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/release-orchestrator",
    OPERATION_ID,
    "plan.json",
  );
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const planSha256 = canonicalRecordSha256(plan);
  const activeEnvironment = path.join(root, "etc/leetplus/slots/green.env");
  await chmod(activeEnvironment, 0o600);
  await writeFile(
    activeEnvironment,
    slotEnvironment("green", PREVIOUS_SHA, {
      bridgeMode: "OFF",
      bugReportingMode: "LIVE",
      migration: CURRENT191_MIGRATION,
      migrationCount: 191,
    }),
  );
  await chmod(activeEnvironment, 0o440);
  assert.equal(
    await main(continuationArgs("apply", root, planSha256)),
    1,
  );
  state = await fixtureState(root);
  assert.equal(state.hydrationEffects, 1);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.cutoverEffects, 0);
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(root, "fixture-state.json"), state);
  assert.equal(
    await main(rolledBackSupersessionArgs(root, planSha256)),
    1,
  );

  await chmod(activeEnvironment, 0o600);
  await writeFile(
    activeEnvironment,
    slotEnvironment("green", PREVIOUS_SHA, activeOptions),
  );
  await chmod(activeEnvironment, 0o440);
  const rollback = await publishFixtureSlotRollback(root);
  state = await fixtureState(root);
  state.releaseSha = SUCCESSOR_SHA;
  await writeJson(path.join(root, "fixture-state.json"), state);
  const rollbackIndexPath = path.join(
    root,
    "var/lib/leetplus/deploy-receipts/slot-links/blue.latest",
  );
  const rollbackIndex = await readFile(rollbackIndexPath, "utf8");
  await writeFile(
    rollbackIndexPath,
    rollbackIndex.replace(
      /^OPERATION_ID=.*$/mu,
      "OPERATION_ID=20260902T000000.000000000Z-2",
    ),
  );
  await chmod(rollbackIndexPath, 0o600);
  assert.equal(
    await main(
      rolledBackSupersessionArgs(
        root,
        planSha256,
        SUCCESSOR_SHA,
        rollback.bindReceiptSha256,
        rollback.rollbackReceiptSha256,
      ),
    ),
    1,
  );
  await writeFile(rollbackIndexPath, rollbackIndex);
  await chmod(rollbackIndexPath, 0o600);
  assert.equal(
    await main(
      rolledBackSupersessionArgs(
        root,
        planSha256,
        SUCCESSOR_SHA,
        rollback.bindReceiptSha256,
        rollback.rollbackReceiptSha256,
      ),
    ),
    0,
  );
  assert.equal(
    await main(
      rolledBackSupersessionArgs(
        root,
        planSha256,
        SUCCESSOR_SHA,
        rollback.bindReceiptSha256,
        rollback.rollbackReceiptSha256,
      ),
    ),
    0,
  );
  const supersessionPath = path.join(
    path.dirname(planPath),
    "superseded.json",
  );
  const supersession = JSON.parse(await readFile(supersessionPath, "utf8"));
  assert.equal(supersession.schemaVersion, 2);
  assert.equal(supersession.decision, ROLLED_BACK_SUPERSEDED_DECISION);
  assert.equal(supersession.completedPhases, 1);
  assert.equal(supersession.pendingPhase, "BIND");
  assert.equal(supersession.pendingRecord, "INTENT");
  assert.equal(supersession.targetPriorReleaseSha, FOLLOWING_SHA);
  assert.equal(supersession.replacementReleaseSha, SUCCESSOR_SHA);
  assert.equal(
    supersession.slotLinkOperationId,
    "20260902T000000.000000000Z-1",
  );
  assert.equal(
    supersession.slotRollbackReceiptPath,
    rollback.rollbackReceiptPath,
  );
  assert.equal(
    supersession.slotRollbackReceiptSha256,
    rollback.rollbackReceiptSha256,
  );
  assert.equal(
    await main(continuationArgs("status", root, planSha256)),
    0,
  );
  assert.equal(
    await main(continuationArgs("resume", root, planSha256)),
    1,
  );
  const nextArgs = current191PrepareArgs(root, "current191-bridge", {
    operationId: SECOND_OPERATION_ID,
  });
  nextArgs[nextArgs.indexOf("--release-sha") + 1] = SUCCESSOR_SHA;
  nextArgs[nextArgs.indexOf("--previous-migration") + 1] =
    CURRENT191_MIGRATION;
  nextArgs[nextArgs.indexOf("--previous-migration-count") + 1] = "191";
  assert.equal(await main(nextArgs), 0);
});

test("rejects a premature final record before phase effects", async (t) => {
  const fixture = await preparedFixture("premature-final-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  await writeJson(path.join(path.dirname(fixture.planPath), "final.json"), {
    invalid: true,
  });
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 0);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.cutoverEffects, 0);
});

test("recovers final publication without repeating phase effects", async (t) => {
  const fixture = await preparedFixture("final-recovery-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const state = await fixtureState(fixture.root);
  const finalPath = path.join(path.dirname(fixture.planPath), "final.json");
  await rm(finalPath);
  assert.equal(
    await main(continuationArgs("status", fixture.root, fixture.planSha256)),
    0,
  );
  assert.equal(
    await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
    0,
  );
  assert.deepEqual(await fixtureState(fixture.root), state);
  await lstat(finalPath);
});

test("rejects a drifted digest and a tampered phase receipt", async (t) => {
  const fixture = await preparedFixture("tamper-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  assert.equal(
    await main(continuationArgs("apply", fixture.root, "0".repeat(64))),
    1,
  );
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    0,
  );
  const firstReceipt = path.join(
    path.dirname(fixture.planPath),
    "01-hydrate.receipt.json",
  );
  const receipt = JSON.parse(await readFile(firstReceipt, "utf8"));
  receipt.previousPhaseReceiptSha256 = "f".repeat(64);
  await chmod(firstReceipt, 0o600);
  await writeJson(firstReceipt, receipt);
  assert.equal(
    await main(continuationArgs("status", fixture.root, fixture.planSha256)),
    1,
  );
});

test("rejects a foreign cutover successor instead of adopting it", async (t) => {
  const fixture = await preparedFixture("generation-drift-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const receiptRoot = path.join(
    fixture.root,
    "var/lib/leetplus/deploy-receipts",
  );
  const foreignPath = path.join(receiptRoot, "foreign-g21.receipt");
  const foreign = kv([
    ["RECORD_VERSION", "3"],
    ["GENERATION", "21"],
    ["RELEASE_SHA", "c".repeat(40)],
    ["SLOT", "blue"],
  ]);
  await writeFile(foreignPath, foreign);
  await writeFile(
    path.join(receiptRoot, "latest-accepted.index"),
    kv([
      ["RECORD_VERSION", "2"],
      ["GENERATION", "21"],
      ["RECEIPT_PATH", foreignPath],
      ["RECEIPT_SHA256", digest(foreign)],
      ["CONSUMED", "false"],
    ]),
  );
  assert.equal(
    await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
    1,
  );
  assert.equal((await fixtureState(fixture.root)).cutoverEffects, 0);
});

process.on("exit", (code) => {
  process.stdout.write(
    "resumable release orchestrator test: " +
      (code === 0 ? "PASS" : "FAIL") +
      "\n",
  );
});

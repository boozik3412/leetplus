#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  COMPLETE_DECISION,
  PHASES,
  canonicalRecordSha256,
  main,
} from "../../docs/deployment/production-artifact/resumable-release-orchestrator.mjs";

const RELEASE_SHA = "a".repeat(40);
const PREVIOUS_SHA = "b".repeat(40);
const MIGRATION = "20260831120000_guest_support_bug_report_input_repair";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_OPERATION_ID = "22222222-2222-4222-8222-222222222222";
const FIXTURE_COMMAND = path.resolve(
  ".github/scripts/resumable-release-orchestrator-fixture-command.mjs",
);

function kv(entries) {
  return entries.map(([key, value]) => key + "=" + value).join("\n") + "\n";
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
}

async function setupFixture(suffix = "") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "leetplus-orchestrator-" + suffix),
  );
  const commands = path.join(root, "commands");
  const receiptRoot = path.join(root, "var/lib/leetplus/deploy-receipts");
  const slotRoot = path.join(root, "srv/leetplus/slots");
  const releaseRoot = path.join(root, "srv/leetplus/releases");
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
    mkdir(upstreamRoot, { recursive: true }),
    mkdir(path.join(root, "etc/systemd/system"), { recursive: true }),
  ]);
  await writeFile(path.join(upstreamRoot, "blue.conf"), "blue\n");
  await writeFile(path.join(upstreamRoot, "green.conf"), "green\n");
  await symlink(
    path.join(upstreamRoot, "green.conf"),
    path.join(root, "etc/nginx/leetplus/active-upstreams.conf"),
  );
  const baselineReceiptPath = path.join(
    receiptRoot,
    "20260901T000000000000000Z-g20-" + PREVIOUS_SHA + "-green.receipt",
  );
  const baselineReceipt = kv([
    ["RECORD_VERSION", "3"],
    ["GENERATION", "20"],
    ["RELEASE_SHA", PREVIOUS_SHA],
    ["SLOT", "green"],
    ["PREVIOUS_TARGET", path.join(upstreamRoot, "blue.conf")],
    ["PREVIOUS_SHA256", "1".repeat(64)],
    ["PREVIOUS_RUNTIME_KIND", "SLOT"],
    ["PREVIOUS_SLOT", "blue"],
    ["PREVIOUS_API_UNIT", "leetplus-api@blue.service"],
    ["PREVIOUS_WEB_UNIT", "leetplus-web@blue.service"],
    ["PREVIOUS_API_URL", "http://127.0.0.1:4100"],
    ["PREVIOUS_WEB_URL", "http://127.0.0.1:3100"],
    ["PREVIOUS_RELEASE_SHA", PREVIOUS_SHA],
    ["PREVIOUS_MIGRATION", MIGRATION],
    ["PREVIOUS_MIGRATION_COUNT", "189"],
    ["PREVIOUS_WEB_BUILD_ID", PREVIOUS_SHA],
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
    releaseSha: RELEASE_SHA,
    runtimeStartCalls: 0,
    slotMasked: false,
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

async function preparedFixture(suffix = "") {
  const root = await setupFixture(suffix);
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
  assert.equal(state.unmaskEffects, 1);
  assert.equal(state.slotMasked, false);
  const operationRoot = path.dirname(fixture.planPath);
  const final = JSON.parse(
    await readFile(path.join(operationRoot, "final.json"), "utf8"),
  );
  assert.equal(final.decision, COMPLETE_DECISION);
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

test("resumes from a cache failure while the target remains masked", async (t) => {
  const fixture = await preparedFixture("masked-cache-recovery-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE;
  }
  let state = await fixtureState(fixture.root);
  assert.equal(state.maskEffects, 1);
  assert.equal(state.slotMasked, true);
  assert.equal(state.bindEffects, 0);
  assert.equal(
    await main(continuationArgs("resume", fixture.root, fixture.planSha256)),
    0,
  );
  state = await fixtureState(fixture.root);
  assert.equal(state.maskEffects, 1);
  assert.equal(state.unmaskEffects, 1);
  assert.equal(state.slotMasked, false);
  assert.equal(state.bindEffects, 1);
  assert.equal(state.cutoverEffects, 1);
});

test("rejects a tampered quiesce intent and keeps the target masked", async (t) => {
  const fixture = await preparedFixture("masked-intent-tamper-");
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE = "true";
  try {
    assert.equal(
      await main(continuationArgs("apply", fixture.root, fixture.planSha256)),
      1,
    );
  } finally {
    delete process.env.TEST_ORCHESTRATOR_FIXTURE_FAIL_CACHE_ONCE;
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
  assert.equal(
    await main(prepareArgs(fixture.root, SECOND_OPERATION_ID)),
    1,
  );
  const state = await fixtureState(fixture.root);
  assert.equal(state.hydrationEffects, 0);
  assert.equal(state.bindEffects, 0);
  assert.equal(state.cutoverEffects, 0);
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

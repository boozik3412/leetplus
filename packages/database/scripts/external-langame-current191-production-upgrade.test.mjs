import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONFIRMATION,
  EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS,
  applyExternalLangameCurrent191ProductionUpgradePlan,
  buildExternalLangameCurrent191ProductionMigrationSql,
  buildExternalLangameCurrent191ProductionUpgradePlan,
  createExternalLangameCurrent191ProductionCheckReceipt,
  inspectExternalLangameCurrent191ProductionUpgradeInventory,
  normalizeExternalLangameCurrent191ProductionCheckReceipt,
  rehearseExternalLangameCurrent191ProductionUpgrade,
  signExternalLangameCurrent191ProductionUpgradePlan,
  verifyExternalLangameCurrent191ProductionRuntimeFinalized,
  verifyExternalLangameCurrent191ProductionUpgradeFinal,
} from "./external-langame-current191-production-upgrade.mjs";

const RELEASE_SHA = "c".repeat(40);
const SYSTEM_IDENTIFIER = "7680160245193110875";
const SOURCE_COMMENT =
  "Fail-closed identity mail worker readiness receipt bound to exact CURRENT_190 while preserving the approved CURRENT_185 preterminal digest boundary.";
const TARGET_COMMENT =
  "Fail-closed identity mail worker readiness receipt bound to exact CURRENT_191 while preserving the approved CURRENT_185 preterminal digest boundary.";

function approvalAuthority() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const publicKeySpkiSha256 = createHash("sha256")
    .update(pair.publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem,
    publicKeySpkiSha256,
  };
}

function manifest(authority = approvalAuthority()) {
  return {
    approval: {
      keyId: "current191-production-approval",
      maxPlanAgeSeconds: 300,
      publicKeyPem: authority.publicKeyPem,
      publicKeySpkiSha256: authority.publicKeySpkiSha256,
    },
    contractVersion: "EXTERNAL_LANGAME_PRODUCTION_190_TO_191_V1",
    operation: { timeoutSeconds: 120 },
    release: {
      artifactRoot: `/srv/leetplus/releases/${RELEASE_SHA}`,
      releaseSha: RELEASE_SHA,
    },
    target: {
      databaseName: "leetplus",
      port: 5432,
      socketDirectory: "/var/run/postgresql",
      systemIdentifier: SYSTEM_IDENTIFIER,
    },
  };
}

function migrationRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    appliedStepsCount: 1,
    checksum:
      index === count - 1 && count === 191
        ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationSha256
        : createHash("sha256").update(`migration-${index}`).digest("hex"),
    finished: true,
    name:
      index === count - 1
        ? count === 190
          ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationHead
          : EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead
        : `2026${String(index).padStart(8, "0")}_fixture`,
    rolledBack: false,
  }));
}

function rawInventory(phase = "source", overrides = {}) {
  const target = phase === "target";
  const appliedMigrations = migrationRows(target ? 191 : 190);
  return {
    appliedMigrations,
    constraintDef: target
      ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetConstraint
      : EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.sourceConstraint,
    constraintOid: target ? "390900" : "0",
    currentUser: "postgres",
    databaseName: "leetplus",
    descriptionsBelow20: 0,
    historicalOwnership: [
      {
        acl: null,
        identity: "390873",
        kind: "class",
        name: "Store",
        owner: "leetplus",
      },
      {
        acl: null,
        identity: "286718",
        kind: "function",
        name: "identity_mail_delivery_worker_assert_v1(text)",
        owner: "postgres",
      },
    ],
    migrationCount: target ? 191 : 190,
    migrationHead: target
      ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead
      : EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationHead,
    migrationTable: { acl: null, oid: "16392", owner: "leetplus" },
    roleMemberships: [],
    rolledBackMigrations: [],
    sessionUser: "postgres",
    systemIdentifier: SYSTEM_IDENTIFIER,
    targetMigrationRows: target ? 1 : 0,
    ticketTable: {
      acl: ["leetplus=arwdDxt/leetplus"],
      oid: "390873",
      owner: "leetplus",
    },
    unfinishedMigrationCount: 0,
    workerFunction: {
      acl: ["postgres=X/postgres"],
      oid: "286718",
      owner: "postgres",
    },
    workerFunctionComment: target ? TARGET_COMMENT : SOURCE_COMMENT,
    workerFunctionSha256: target
      ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetWorkerFunctionSha256
      : EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.sourceWorkerFunctionSha256,
    ...overrides,
  };
}

function artifactEvidence() {
  return {
    buildId: RELEASE_SHA,
    hydratedManifestDigest: "1".repeat(64),
    hydrationReceiptDigest: "2".repeat(64),
    manifestDigest: "3".repeat(64),
    provenanceDigest: "4".repeat(64),
    symlinkTopologyDigest: "5".repeat(64),
  };
}

function bridgeSlot({ phase, seed, slot }) {
  const source = phase === "SOURCE_190";
  const blue = slot === "blue";
  return {
    apiBaseUrl: `http://127.0.0.1:${blue ? 4100 : 4200}`,
    apiInvocationId: seed.repeat(32),
    apiUnit: `leetplus-api@${slot}.service`,
    apiUnitFileSha256: seed.repeat(64),
    authenticatedSmokeSha256: seed.repeat(64),
    authenticatedSmokeStoreCount: 4,
    authenticatedSmokeUsersCatalog: "CURRENT",
    bugReportingMode: "OFF",
    canarySafeEnvironmentSha256: seed.repeat(64),
    compatibilityMode: source
      ? "EXTERNAL_LANGAME_SIMPLE_ONBOARDING_SCHEMA_FORWARD_BRIDGE"
      : null,
    compatibilityTargetMigration: source
      ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead
      : null,
    compatibilityTargetMigrationCount: source ? 191 : null,
    databaseMigration: source
      ? EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationHead
      : EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead,
    databaseMigrationCount: source ? 190 : 191,
    hydratedManifestSha256: seed.repeat(64),
    hydratedSha256SumsSha256: seed.repeat(64),
    hydrationAttestationSha256: seed.repeat(64),
    releaseProvenanceMigration:
      EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead,
    releaseProvenanceMigrationCount: 191,
    releaseProvenanceSha256: seed.repeat(64),
    releaseSha: RELEASE_SHA,
    runtimeEnvironmentSha256: seed.repeat(64),
    runtimeRole: "COMBINED",
    schemaBridgeMode: "ALLOW_CURRENT_190",
    sha256SumsSha256: seed.repeat(64),
    slot,
    slotEnvironmentSha256: seed.repeat(64),
    slotLinkReceiptSha256: seed.repeat(64),
    symlinkManifestSha256: seed.repeat(64),
    targetMigrationSha256:
      EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationSha256,
    upstreamTarget: `/etc/nginx/leetplus/upstreams/${slot}.conf`,
    upstreamTargetSha256: seed.repeat(64),
    webBaseUrl: `http://127.0.0.1:${blue ? 3100 : 3200}`,
    webBuildId: RELEASE_SHA,
    webInvocationId: seed.repeat(32),
    webUnit: `leetplus-web@${slot}.service`,
    webUnitFileSha256: seed.repeat(64),
  };
}

function bridge(phase = "SOURCE_190", overrides = {}) {
  return {
    acceptedAt: "2026-09-01T10:00:00.000000000Z",
    active: bridgeSlot({ phase, seed: "1", slot: "green" }),
    bridgeContract:
      "EXTERNAL_LANGAME_SIMPLE_ONBOARDING_CURRENT190_DUAL_BRIDGE_CUTOVER_V1",
    cutoverGeneration: 8,
    cutoverReceiptName: `20260901T100000000000000Z-g8-${RELEASE_SHA}-green.receipt`,
    cutoverReceiptSha256: "6".repeat(64),
    latestReceiptConsumed: false,
    pendingIntentCount: 0,
    phase,
    productionControl: {
      attestationSha256: "7".repeat(64),
      installMapSha256: "8".repeat(64),
      receiptSha256: "9".repeat(64),
      releaseSha: RELEASE_SHA,
      rootManifestSha256: "a".repeat(64),
      verifierSha256: "b".repeat(64),
    },
    rollback: bridgeSlot({ phase, seed: "2", slot: "blue" }),
    topologyMode: "DUAL_BRIDGE_N_MINUS_ONE",
    ...overrides,
  };
}

function runtimeFixture() {
  let locks = 0;
  let source = bridge("SOURCE_190");
  let target = bridge("TARGET_191");
  return {
    adapter: {
      acquireLock: async () => {
        locks += 1;
      },
      inspectSource: async () => source,
      inspectTarget: async () => target,
      releaseLock: async () => {
        locks -= 1;
      },
    },
    locks: () => locks,
    setSource: (value) => {
      source = value;
    },
    setTarget: (value) => {
      target = value;
    },
  };
}

function finalRuntime() {
  const value = bridge("TARGET_191");
  return {
    ...value,
    active: {
      ...value.active,
      bugReportingMode: "LIVE",
      schemaBridgeMode: "OFF",
    },
    bridgeContract:
      "EXTERNAL_LANGAME_SIMPLE_ONBOARDING_CURRENT191_FINAL_RUNTIME_V1",
    phase: "FINAL_191",
    rollback: {
      ...value.rollback,
      bugReportingMode: "LIVE",
      schemaBridgeMode: "OFF",
    },
    topologyMode: "DUAL_CURRENT_N_MINUS_ONE",
  };
}

function finalRuntimeFixture(initial = finalRuntime()) {
  let locks = 0;
  let target = initial;
  return {
    adapter: {
      acquireLock: async () => {
        locks += 1;
      },
      inspectTarget: async () => target,
      releaseLock: async () => {
        locks -= 1;
      },
    },
    locks: () => locks,
    setTarget: (value) => {
      target = value;
    },
  };
}

async function planFixture() {
  const authority = approvalAuthority();
  const productionManifest = manifest(authority);
  let current = rawInventory("source");
  const runtime = runtimeFixture();
  const now = () => new Date("2026-09-01T10:00:00.000Z");
  const artifactInspector = async () => artifactEvidence();
  const adapter = { inspect: async () => structuredClone(current) };
  const plan = await buildExternalLangameCurrent191ProductionUpgradePlan({
    adapter,
    artifactInspector,
    manifest: productionManifest,
    now,
    runtimeAdapter: runtime.adapter,
  });
  const approval = signExternalLangameCurrent191ProductionUpgradePlan({
    manifest: productionManifest,
    plan,
    privateKeyPem: authority.privateKeyPem,
  });
  return {
    adapter,
    approval,
    artifactInspector,
    authority,
    makeTarget: () => {
      current = rawInventory("target");
    },
    manifest: productionManifest,
    now,
    plan,
    runtime,
  };
}

test("builds a signed exact CURRENT190 to CURRENT191 plan", async () => {
  const fixture = await planFixture();
  assert.equal(fixture.plan.sourceMigrationCount, 190);
  assert.equal(fixture.plan.targetMigrationCount, 191);
  assert.equal(fixture.plan.bridgeAttestation.phase, "SOURCE_190");
  assert.equal(fixture.runtime.locks(), 0);
  const inventory =
    await inspectExternalLangameCurrent191ProductionUpgradeInventory({
      adapter: fixture.adapter,
      artifactInspector: fixture.artifactInspector,
      manifest: fixture.manifest,
    });
  assert.equal(inventory.migrationCount, 190);
});

test("pins the production split-owner topology before any migration", async () => {
  const productionManifest = manifest();
  const artifactInspector = async () => artifactEvidence();
  const drifts = [
    {
      ticketTable: {
        acl: ["postgres=arwdDxt/postgres"],
        oid: "390873",
        owner: "postgres",
      },
    },
    {
      migrationTable: { acl: null, oid: "16392", owner: "postgres" },
    },
    {
      workerFunction: {
        acl: ["leetplus=X/leetplus"],
        oid: "286718",
        owner: "leetplus",
      },
    },
  ];
  for (const drift of drifts) {
    await assert.rejects(
      inspectExternalLangameCurrent191ProductionUpgradeInventory({
        adapter: { inspect: async () => rawInventory("source", drift) },
        artifactInspector,
        manifest: productionManifest,
      }),
      { reasonCode: "CURRENT191_UPGRADE_SOURCE_STATE_MISMATCH" },
    );
  }
});

test("executes relation DDL as leetplus and privileged function DDL as postgres", () => {
  const rawMigration = readFileSync(
    new URL(
      "../prisma/migrations/20260908180000_external_langame_simple_onboarding/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const sql = buildExternalLangameCurrent191ProductionMigrationSql({
    migrationId: "11111111-1111-4111-8111-111111111111",
    rawMigration,
    source: rawInventory("source"),
    target: manifest().target,
  });
  const firstApplicationRole = sql.indexOf('SET LOCAL ROLE "leetplus";');
  const relationDdl = sql.indexOf(
    'CREATE UNIQUE INDEX "store_external_identity_global_uidx"',
  );
  const resetToPostgres = sql.indexOf("RESET ROLE;", relationDdl);
  const privilegedDdl = sql.indexOf(
    'CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v1"',
  );
  const secondApplicationRole = sql.indexOf(
    'SET LOCAL ROLE "leetplus";',
    firstApplicationRole + 1,
  );
  assert.ok(firstApplicationRole >= 0);
  assert.ok(firstApplicationRole < relationDdl);
  assert.ok(relationDdl < resetToPostgres);
  assert.ok(resetToPostgres < privilegedDdl);
  assert.ok(privilegedDdl < secondApplicationRole);
  assert.equal(sql.match(/SET LOCAL ROLE "leetplus";/gu)?.length, 2);
  assert.equal(sql.includes('SET LOCAL ROLE "postgres";'), false);
});

test("applies once, preserves database authority and restores the worker", async () => {
  const fixture = await planFixture();
  const phases = [];
  let quiesced = false;
  const result = await applyExternalLangameCurrent191ProductionUpgradePlan({
    adapter: fixture.adapter,
    approval: fixture.approval,
    artifactInspector: fixture.artifactInspector,
    confirmPlanDigest: fixture.plan.planDigest,
    executor: {
      migrate: async () => {
        assert.equal(quiesced, true);
        fixture.makeTarget();
        return { status: "SUCCEEDED" };
      },
    },
    manifest: fixture.manifest,
    now: fixture.now,
    onPhase: async (phase) => phases.push(phase.phase),
    pinnedApprovalKeySpkiSha256: fixture.authority.publicKeySpkiSha256,
    plan: fixture.plan,
    productionConfirmation:
      EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONFIRMATION,
    runtimeAdapter: fixture.runtime.adapter,
    workerSafetyAdapter: {
      quiesce: async () => {
        quiesced = true;
        return {
          timerWasActive: true,
          timerWasEnabled: true,
          workerWasActive: false,
        };
      },
      restore: async () => {
        quiesced = false;
      },
    },
  });
  assert.equal(result.decision, "CURRENT191_UPGRADE_APPLIED");
  assert.equal(result.migrationCount, 191);
  assert.equal(quiesced, false);
  assert.equal(fixture.runtime.locks(), 0);
  assert.deepEqual(phases, [
    "APPROVAL_VERIFIED",
    "PRODUCTION_CONTROL_AND_CUTOVER_LOCKS_ACQUIRED",
    "SOURCE_190_AND_DUAL_SLOT_BRIDGE_VERIFIED",
    "LANGAME_DAILY_WORKER_QUIESCED",
    "PRIVILEGED_MIGRATION_INTENT_DURABLE",
    "PRIVILEGED_MIGRATION_RESPONSE",
    "FINAL_191_AND_DUAL_SLOT_RUNTIME_VERIFIED",
  ]);
  const verified = await verifyExternalLangameCurrent191ProductionUpgradeFinal({
    adapter: fixture.adapter,
    manifest: fixture.manifest,
    plan: fixture.plan,
    runtimeAdapter: fixture.runtime.adapter,
  });
  assert.equal(verified.migrationCount, 191);
});

test("fails closed on drift before migration and still releases the runtime lock", async () => {
  const fixture = await planFixture();
  const driftedBridge = bridge("SOURCE_190");
  fixture.runtime.setSource({
    ...driftedBridge,
    active: {
      ...driftedBridge.active,
      authenticatedSmokeSha256: "f".repeat(64),
    },
  });
  let migrationCalls = 0;
  await assert.rejects(
    applyExternalLangameCurrent191ProductionUpgradePlan({
      adapter: fixture.adapter,
      approval: fixture.approval,
      artifactInspector: fixture.artifactInspector,
      confirmPlanDigest: fixture.plan.planDigest,
      executor: {
        migrate: async () => {
          migrationCalls += 1;
        },
      },
      manifest: fixture.manifest,
      now: fixture.now,
      onPhase: async () => undefined,
      pinnedApprovalKeySpkiSha256: fixture.authority.publicKeySpkiSha256,
      plan: fixture.plan,
      productionConfirmation:
        EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONFIRMATION,
      runtimeAdapter: fixture.runtime.adapter,
      workerSafetyAdapter: {
        quiesce: async () => ({}),
        restore: async () => undefined,
      },
    }),
    { reasonCode: "CURRENT191_UPGRADE_FRESH_PLAN_MISMATCH" },
  );
  assert.equal(migrationCalls, 0);
  assert.equal(fixture.runtime.locks(), 0);
});

test("recovers a lost response from the exact final state without repeating DDL", async () => {
  const fixture = await planFixture();
  fixture.makeTarget();
  let migrationCalls = 0;
  let workerCalls = 0;
  const result = await applyExternalLangameCurrent191ProductionUpgradePlan({
    adapter: fixture.adapter,
    approval: fixture.approval,
    artifactInspector: fixture.artifactInspector,
    confirmPlanDigest: fixture.plan.planDigest,
    executor: {
      migrate: async () => {
        migrationCalls += 1;
      },
    },
    manifest: fixture.manifest,
    now: fixture.now,
    onPhase: async () => undefined,
    pinnedApprovalKeySpkiSha256: fixture.authority.publicKeySpkiSha256,
    plan: fixture.plan,
    productionConfirmation:
      EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONFIRMATION,
    runtimeAdapter: fixture.runtime.adapter,
    workerSafetyAdapter: {
      quiesce: async () => {
        workerCalls += 1;
        return {};
      },
      restore: async () => {
        workerCalls += 1;
      },
    },
  });
  assert.equal(result.recoveredFromLostResponse, true);
  assert.equal(migrationCalls, 0);
  assert.equal(workerCalls, 0);
  assert.equal(fixture.runtime.locks(), 0);
});

test("rejects a final state that changes protected ownership or ACL", async () => {
  const fixture = await planFixture();
  fixture.makeTarget();
  const drifts = [
    { ticketTable: { acl: null, oid: "390873", owner: "leetplus" } },
    { migrationTable: { acl: null, oid: "16392", owner: "postgres" } },
    {
      workerFunction: {
        acl: ["leetplus=X/leetplus"],
        oid: "286718",
        owner: "leetplus",
      },
    },
  ];
  for (const drift of drifts) {
    await assert.rejects(
      verifyExternalLangameCurrent191ProductionUpgradeFinal({
        adapter: { inspect: async () => rawInventory("target", drift) },
        manifest: fixture.manifest,
        plan: fixture.plan,
        runtimeAdapter: fixture.runtime.adapter,
      }),
      { reasonCode: "CURRENT191_UPGRADE_FINAL_DATABASE_STATE_NOT_REACHED" },
    );
  }
  assert.equal(fixture.runtime.locks(), 0);
});

test("publishes a CURRENT191 pre-final receipt only from an exact live check", async () => {
  const fixture = await planFixture();
  fixture.makeTarget();
  const verified = await verifyExternalLangameCurrent191ProductionUpgradeFinal({
    adapter: fixture.adapter,
    manifest: fixture.manifest,
    plan: fixture.plan,
    runtimeAdapter: fixture.runtime.adapter,
  });
  const receipt = createExternalLangameCurrent191ProductionCheckReceipt({
    manifest: fixture.manifest,
    now: fixture.now,
    plan: fixture.plan,
    verification: verified,
  });
  assert.equal(receipt.schemaPlanDigest, fixture.plan.planDigest);
  assert.equal(receipt.releaseSha, RELEASE_SHA);
  assert.equal(receipt.migrationCount, 191);
  assert.equal(
    receipt.targetMigrationSha256,
    EXTERNAL_LANGAME_CURRENT191_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationSha256,
  );
  assert.throws(
    () =>
      normalizeExternalLangameCurrent191ProductionCheckReceipt({
        ...receipt,
        migrationCount: 190,
      }),
    { reasonCode: "CURRENT191_UPGRADE_CHECK_RECEIPT_INVALID" },
  );
  assert.throws(
    () =>
      createExternalLangameCurrent191ProductionCheckReceipt({
        manifest: fixture.manifest,
        now: fixture.now,
        plan: fixture.plan,
        verification: { ...verified, databaseEvidenceDigest: "invalid" },
      }),
    { reasonCode: "CURRENT191_UPGRADE_CHECK_RECEIPT_INVALID" },
  );
});

test("accepts only two exact CURRENT191 slots after bridge finalization", async () => {
  const fixture = await planFixture();
  fixture.makeTarget();
  const runtime = finalRuntimeFixture();
  const verified =
    await verifyExternalLangameCurrent191ProductionRuntimeFinalized({
      adapter: fixture.adapter,
      manifest: fixture.manifest,
      plan: fixture.plan,
      runtimeAdapter: runtime.adapter,
    });
  assert.equal(verified.migrationCount, 191);
  assert.match(verified.runtimeFinalAttestationDigest, /^[0-9a-f]{64}$/u);
  assert.equal(runtime.locks(), 0);

  const drifted = finalRuntime();
  runtime.setTarget({
    ...drifted,
    rollback: {
      ...drifted.rollback,
      bugReportingMode: "OFF",
      schemaBridgeMode: "ALLOW_CURRENT_190",
    },
  });
  await assert.rejects(
    verifyExternalLangameCurrent191ProductionRuntimeFinalized({
      adapter: fixture.adapter,
      manifest: fixture.manifest,
      plan: fixture.plan,
      runtimeAdapter: runtime.adapter,
    }),
    { reasonCode: "CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID" },
  );
  assert.equal(runtime.locks(), 0);
});

test("rehearses the exact executor only on an isolated restored-copy target", async () => {
  const fixture = await planFixture();
  await assert.rejects(
    rehearseExternalLangameCurrent191ProductionUpgrade({
      adapter: fixture.adapter,
      artifactInspector: fixture.artifactInspector,
      executor: { migrate: async () => ({ status: "SUCCEEDED" }) },
      manifest: fixture.manifest,
    }),
    { reasonCode: "CURRENT191_UPGRADE_REHEARSAL_TARGET_REQUIRED" },
  );
  const restoredManifest = structuredClone(fixture.manifest);
  restoredManifest.target.databaseName = "leetplus_restored_current191_test";
  restoredManifest.target.port = 55488;
  restoredManifest.target.socketDirectory =
    "/srv/leetplus/restored-current191-test/socket";
  const restoredAdapter = {
    inspect: async () => ({
      ...(await fixture.adapter.inspect()),
      databaseName: restoredManifest.target.databaseName,
    }),
  };
  const result = await rehearseExternalLangameCurrent191ProductionUpgrade({
    adapter: restoredAdapter,
    artifactInspector: fixture.artifactInspector,
    executor: {
      migrate: async () => {
        fixture.makeTarget();
        return { status: "SUCCEEDED" };
      },
    },
    manifest: restoredManifest,
  });
  assert.equal(result.decision, "CURRENT191_RESTORED_COPY_REHEARSAL_PASS");
  assert.equal(result.migrationCount, 191);
});

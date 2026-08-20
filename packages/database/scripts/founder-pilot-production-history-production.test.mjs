import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_APPLIED,
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
  applyFounderPilotProductionHistoryProductionPlan,
  assertFounderPilotProductionHistoryProductionDatabaseUrl,
  buildFounderPilotProductionHistoryProductionPlan,
  founderPilotProductionHistoryProductionStaleRunSetDigest,
  inspectFounderPilotProductionHistoryProductionInventory,
  normalizeFounderPilotProductionHistoryProductionManifest,
  signFounderPilotProductionHistoryProductionPlan,
  verifyFounderPilotProductionHistoryProductionApproval,
  verifyFounderPilotProductionHistoryProductionFinal,
} from "./founder-pilot-production-history-production.mjs";
import {
  createFounderPilotProductionHistoryPhaseJournal,
  runBoundedFounderPilotProductionHistoryPrismaDeploy,
} from "./founder-pilot-production-history-production.cli.mjs";
import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS,
  inspectFounderPilotProductionHistorySourceTree,
  materializeFounderPilotProductionHistoryLane,
} from "./founder-pilot-production-history-rehearsal.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRISMA_ROOT = path.resolve(SCRIPT_ROOT, "../prisma");
const NOW = "2026-08-20T18:00:00.000Z";
const SYSTEM_IDENTIFIER = "7675301746759083084";
const RELEASE_SHA = "c".repeat(40);
const PRODUCTION_DATABASE_URL =
  "postgresql://leetplus_migration:0123456789abcdef@127.0.0.1:5432/leetplus?options=-c%20role%3Dleetplus_runtime";
const LEGACY_APPLIED_CHECKSUMS = new Map([
  [
    "20260518120000_guest_data_foundation",
    "98de87e5d79eb6611b0722e954fe0e7b2eb6480c7b485d9cf451ecff6dcf4341",
  ],
  [
    "20260519142000_guest_working_shifts",
    "226614a5e628a3d40a0fe584323d6ed2134f229092e35081ec9b05a24378eff5",
  ],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lp-prod-history-test-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function boundedDeployFixture(t) {
  const root = await temporaryRoot(t);
  const laneRoot = path.join(root, "lane");
  await mkdir(laneRoot, { recursive: true });
  const prismaCliPath = path.join(root, "prisma.js");
  await writeFile(prismaCliPath, "// fixture\n");
  await writeFile(path.join(laneRoot, "schema.prisma"), "datasource db {}\n");
  return { laneRoot, prismaCliPath };
}

function controlledTimers() {
  const handles = [];
  return {
    cancelTimer: (handle) => {
      handle.cancelled = true;
    },
    handles,
    scheduleTimer: (callback, delay) => {
      const handle = {
        callback,
        cancelled: false,
        delay,
        unref: () => {
          handle.unrefed = true;
        },
        unrefed: false,
      };
      handles.push(handle);
      return handle;
    },
  };
}

function deployChild(pid = 12345) {
  const child = new EventEmitter();
  child.exitCode = null;
  child.pid = pid;
  child.signalCode = null;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

function keys() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const privateKeyPem = pair.privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  const publicKeySpkiSha256 = sha256(
    pair.publicKey.export({ format: "der", type: "spki" }),
  );
  return { privateKeyPem, publicKeyPem, publicKeySpkiSha256 };
}

function staleRows() {
  return Array.from({ length: 4 }, (_, index) => ({
    completedAt: null,
    createdAt: new Date(`2026-06-0${index + 1}T00:00:00.000Z`),
    errorMessage: null,
    executionRevision: null,
    id: `11111111-1111-4111-8111-11111111111${index}`,
    scheduledForDate: `2026-06-0${index + 1}`,
    sentCount: 0,
    startedAt: new Date(`2026-06-0${index + 1}T00:00:00.000Z`),
    status: "RUNNING",
    tenantId: `22222222-2222-4222-8222-22222222222${index}`,
    type: "WEEKLY",
    updatedAt: new Date(`2026-06-0${index + 1}T00:00:01.000Z`),
  }));
}

function identity(overrides = {}) {
  return {
    activeRuntimeRoleNames: ["leetplus_runtime"],
    currentDatabase: "leetplus",
    currentRoleDirectMembershipCount: 0,
    databaseOwnerRoleName: "leetplus_runtime",
    databaseOwnerRoleOid: 19002,
    currentRoleBypassRls: false,
    currentRoleCanLogin: true,
    currentRoleCreateDb: false,
    currentRoleCreateRole: false,
    currentRoleName: "leetplus_runtime",
    currentRoleOid: 19002,
    currentRoleReplication: false,
    currentRoleSuperuser: false,
    inRecovery: false,
    publicClassOwnerMismatchCount: 0,
    publicProcOwnerMismatchCount: 0,
    publicTypeOwnerMismatchCount: 0,
    runtimeRoles: [
      {
        bypassRls: false,
        canLogin: true,
        createDb: false,
        createRole: false,
        name: "leetplus_runtime",
        oid: 19002,
        replication: false,
        superuser: false,
      },
    ],
    sessionDirectMembershipCount: 1,
    sessionOwnerMembershipCount: 1,
    sessionOwnerMembershipAdminOption: false,
    sessionOwnerMembershipInheritOption: false,
    sessionOwnerMembershipSetOption: true,
    sessionRoleBypassRls: false,
    sessionRoleCanLogin: true,
    sessionRoleCreateDb: false,
    sessionRoleCreateRole: false,
    sessionRoleInherit: false,
    sessionRoleName: "leetplus_migration",
    sessionRoleOid: 19001,
    sessionRoleReplication: false,
    sessionRoleSuperuser: false,
    serverAddress: "127.0.0.1",
    serverMajor: 16,
    serverPort: 5432,
    systemIdentifier: SYSTEM_IDENTIFIER,
    ...overrides,
  };
}

function sourceEvidence(rows = staleRows(), overrides = {}) {
  return {
    identity: identity(),
    migrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount,
    migrationHead:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead,
    migrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest,
    migrationRows: [],
    rolledBackMigrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
    rolledBackMigrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
    runningDigestRows: rows,
    unfinishedMigrationCount: 0,
    ...overrides,
  };
}

async function fixture(t) {
  const root = await temporaryRoot(t);
  const artifactPath = path.join(root, "release.tar.gz");
  const artifactBytes = Buffer.from("test-release-artifact", "utf8");
  await writeFile(artifactPath, artifactBytes);
  const key = keys();
  const rows = staleRows();
  const tree =
    await inspectFounderPilotProductionHistorySourceTree(PRISMA_ROOT);
  const manifest = normalizeFounderPilotProductionHistoryProductionManifest({
    approval: {
      keyId: "founder-prod-history-a1",
      maxPlanAgeSeconds: 900,
      publicKeyPem: key.publicKeyPem,
      publicKeySpkiSha256: key.publicKeySpkiSha256,
    },
    contractVersion: "FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_V1",
    environment: "PRODUCTION",
    operation: {
      deployTimeoutSeconds: 600,
      expectedStaleRunSetDigest:
        founderPilotProductionHistoryProductionStaleRunSetDigest(rows, NOW),
    },
    release: {
      artifactPath,
      artifactSha256: sha256(artifactBytes),
      materializedTreeDigest: tree.treeDigest,
      releaseSha: RELEASE_SHA,
    },
    target: {
      applicationRuntimeRoles: [{ name: "leetplus_runtime", oid: 19002 }],
      databaseName: "leetplus",
      expectedServerMajor: 16,
      expectedSystemIdentifier: SYSTEM_IDENTIFIER,
      host: "127.0.0.1",
      migrationRoleName: "leetplus_migration",
      migrationRoleOid: 19001,
      objectOwnerRoleName: "leetplus_runtime",
      objectOwnerRoleOid: 19002,
      port: 5432,
    },
  });
  return { key, manifest, root, rows };
}

async function planFor(fixtureValue, adapter) {
  return buildFounderPilotProductionHistoryProductionPlan({
    adapter,
    inspectArtifact: async ({ expectedSha256 }) => ({
      actualSha256: expectedSha256,
    }),
    manifest: fixtureValue.manifest,
    now: () => new Date(NOW),
    sourcePrismaRoot: PRISMA_ROOT,
  });
}

async function finalEvidence(laneRoot, identityValue) {
  const migrationRoot = path.join(laneRoot, "migrations");
  const migrationRows = await Promise.all(
    (await readdir(migrationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map(async (migrationName) => ({
        applied: true,
        checksum:
          LEGACY_APPLIED_CHECKSUMS.get(migrationName) ??
          sha256(
            await readFile(
              path.join(migrationRoot, migrationName, "migration.sql"),
            ),
          ),
        migrationName,
        rolledBack: false,
      })),
  );
  return {
    identity: identityValue,
    migrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalMigrationCount,
    migrationHead:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalMigrationHead,
    migrationManifestDigest: "unused-by-final-verifier",
    migrationRows,
    rolledBackMigrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
    rolledBackMigrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
    runningDigestRows: [],
    unfinishedMigrationCount: 0,
  };
}

function approvalFor(value, plan) {
  return signFounderPilotProductionHistoryProductionPlan({
    manifest: value.manifest,
    plan,
    privateKeyPem: value.key.privateKeyPem,
  });
}

test("builds a read-only exact 153/4/0 and four-row production plan", async (t) => {
  const value = await fixture(t);
  let inspected = 0;
  const plan = await planFor(value, {
    inspectTarget: async () => {
      inspected += 1;
      return sourceEvidence(value.rows);
    },
  });
  assert.equal(inspected, 1);
  assert.equal(plan.staleRunCount, 4);
  assert.equal(
    plan.staleRunSetDigest,
    value.manifest.operation.expectedStaleRunSetDigest,
  );
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(
    JSON.stringify(plan),
    /11111111|22222222|leetplus_migration/u,
  );
});

test("read-only inventory acquires only the strict digest and cannot authorize apply", async (t) => {
  const value = await fixture(t);
  const inventory =
    await inspectFounderPilotProductionHistoryProductionInventory({
      adapter: {
        inspectTarget: async () => sourceEvidence(value.rows),
      },
      manifest: {
        ...value.manifest,
        operation: {
          ...value.manifest.operation,
          expectedStaleRunSetDigest: "0".repeat(64),
        },
      },
      now: () => new Date(NOW),
    });
  assert.equal(
    inventory.decision,
    "PRODUCTION_HISTORY_INVENTORY_READY_NOT_AUTHORIZATION",
  );
  assert.equal(
    inventory.staleRunSetDigest,
    value.manifest.operation.expectedStaleRunSetDigest,
  );
  assert.equal("planDigest" in inventory, false);
});

test("requires exactly four immutable stale WEEKLY rows", async (t) => {
  const value = await fixture(t);
  for (const rows of [
    value.rows.slice(0, 3),
    value.rows.map((row, index) =>
      index === 0 ? { ...row, sentCount: 1 } : row,
    ),
  ]) {
    await assert.rejects(
      () =>
        planFor(value, {
          inspectTarget: async () => sourceEvidence(rows),
        }),
      (error) => error?.safeContractError === true,
    );
  }
});

test("rejects an unlisted or superuser application runtime identity", async (t) => {
  const value = await fixture(t);
  await assert.rejects(
    () =>
      planFor(value, {
        inspectTarget: async () =>
          sourceEvidence(value.rows, {
            identity: identity({ activeRuntimeRoleNames: ["postgres"] }),
          }),
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_ACTIVE_RUNTIME_ROLE_MISMATCH" },
  );
  await assert.rejects(
    () =>
      planFor(value, {
        inspectTarget: async () =>
          sourceEvidence(value.rows, {
            identity: identity({
              runtimeRoles: [
                {
                  bypassRls: true,
                  canLogin: true,
                  createDb: false,
                  createRole: false,
                  name: "leetplus_runtime",
                  oid: 19002,
                  replication: false,
                  superuser: true,
                },
              ],
            }),
          }),
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLE_STATE_MISMATCH" },
  );
});

test("accepts only the exact migration-session to object-owner role switch", async (t) => {
  const value = await fixture(t);
  const plan = await planFor(value, {
    inspectTarget: async () => sourceEvidence(value.rows),
  });
  assert.match(plan.targetIdentityDigest, /^[0-9a-f]{64}$/u);

  const mismatches = [
    { sessionRoleName: "leetplus_other_migration" },
    { sessionRoleOid: 19003 },
    { currentRoleName: "leetplus_other_owner" },
    { currentRoleOid: 19003 },
    { currentRoleDirectMembershipCount: 1 },
    { sessionDirectMembershipCount: 0 },
    { sessionDirectMembershipCount: 2 },
    { sessionOwnerMembershipCount: 0 },
    { sessionOwnerMembershipAdminOption: true },
    { sessionOwnerMembershipInheritOption: true },
    { sessionOwnerMembershipSetOption: false },
    { sessionRoleInherit: true },
    { databaseOwnerRoleName: "leetplus_other_owner" },
    { databaseOwnerRoleOid: 19003 },
    { sessionRoleSuperuser: true },
    { currentRoleBypassRls: true },
    { publicClassOwnerMismatchCount: 1 },
    { publicProcOwnerMismatchCount: 1 },
    { publicTypeOwnerMismatchCount: 1 },
  ];
  for (const mismatch of mismatches) {
    await assert.rejects(
      () =>
        planFor(value, {
          inspectTarget: async () =>
            sourceEvidence(value.rows, {
              identity: identity(mismatch),
            }),
        }),
      { reasonCode: "FOUNDER_PRODUCTION_HISTORY_LIVE_IDENTITY_MISMATCH" },
    );
  }
});

test("verifies a separately signed plan against an independent public-key pin", async (t) => {
  const value = await fixture(t);
  const plan = await planFor(value, {
    inspectTarget: async () => sourceEvidence(value.rows),
  });
  const approval = approvalFor(value, plan);
  const receipt = verifyFounderPilotProductionHistoryProductionApproval({
    approval,
    manifest: value.manifest,
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
  });
  assert.equal(receipt.planDigest, plan.planDigest);
  assert.throws(
    () =>
      verifyFounderPilotProductionHistoryProductionApproval({
        approval,
        manifest: value.manifest,
        pinnedApprovalKeySpkiSha256: "f".repeat(64),
        plan,
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_APPROVAL_KEY_PIN_MISMATCH" },
  );
});

test("production confirmation and independent key pin fail before any lock or effect", async (t) => {
  const value = await fixture(t);
  const plan = await planFor(value, {
    inspectTarget: async () => sourceEvidence(value.rows),
  });
  let lockCalls = 0;
  const adapter = {
    acquireLock: async () => {
      lockCalls += 1;
    },
  };
  const common = {
    adapter,
    approval: approvalFor(value, plan),
    confirmPlanDigest: plan.planDigest,
    deploy: async () => ({ status: "SUCCEEDED" }),
    inspectArtifact: async ({ expectedSha256 }) => ({
      actualSha256: expectedSha256,
    }),
    laneRoot: path.join(
      value.root,
      "leetplus-founder-production-history-prod-no-effect",
    ),
    manifest: value.manifest,
    now: () => new Date("2026-08-20T18:01:00.000Z"),
    onPhase: async () => undefined,
    plan,
    sourcePrismaRoot: PRISMA_ROOT,
  };
  await assert.rejects(
    () =>
      applyFounderPilotProductionHistoryProductionPlan({
        ...common,
        pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
        productionConfirmation: "WRONG",
      }),
    {
      reasonCode: "FOUNDER_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION_REQUIRED",
    },
  );
  await assert.rejects(
    () =>
      applyFounderPilotProductionHistoryProductionPlan({
        ...common,
        pinnedApprovalKeySpkiSha256: "f".repeat(64),
        productionConfirmation:
          FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_APPROVAL_KEY_PIN_MISMATCH" },
  );
  assert.equal(lockCalls, 0);
});

test("applies only after digest/signature/lock and verifies exact CURRENT187", async (t) => {
  const value = await fixture(t);
  const laneRoot = path.join(
    value.root,
    "leetplus-founder-production-history-prod-a1",
  );
  let state = sourceEvidence(value.rows);
  let reconciled = false;
  let locked = false;
  const phases = [];
  const adapter = {
    acquireLock: async () => {
      locked = true;
    },
    inspectFinal: async () => ({
      preterminalManifestDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalPreterminalManifestDigest,
      workerFunctionDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalWorkerFunctionDigest,
    }),
    inspectReconciliation: async () => (reconciled ? "APPLIED" : "NOT_APPLIED"),
    inspectTarget: async () => state,
    reconcile: async () => {
      assert.equal(locked, true);
      reconciled = true;
      state = { ...state, runningDigestRows: [] };
      return 4;
    },
    releaseLock: async () => {
      locked = false;
    },
  };
  const plan = await planFor(value, adapter);
  const result = await applyFounderPilotProductionHistoryProductionPlan({
    adapter,
    approval: approvalFor(value, plan),
    confirmPlanDigest: plan.planDigest,
    deploy: async () => {
      state = await finalEvidence(laneRoot, identity());
      return { status: "SUCCEEDED" };
    },
    inspectArtifact: async ({ expectedSha256 }) => ({
      actualSha256: expectedSha256,
    }),
    laneRoot,
    manifest: value.manifest,
    now: () => new Date("2026-08-20T18:01:00.000Z"),
    onPhase: async (phase) => phases.push(phase.phase),
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
    productionConfirmation:
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(result.decision, FOUNDER_PILOT_PRODUCTION_HISTORY_APPLIED);
  assert.equal(locked, false);
  assert.deepEqual(phases, [
    "APPROVAL_VERIFIED",
    "CONTROLLER_LOCK_ACQUIRED",
    "RECONCILIATION_INTENT_DURABLE",
    "RECONCILIATION_VERIFIED",
    "PRISMA_DEPLOY_INTENT_DURABLE",
    "PRISMA_DEPLOY_RESPONSE_SUCCEEDED",
    "FINAL_187_VERIFIED",
  ]);
});

test("reconciles a lost commit response before continuing and never repeats DML", async (t) => {
  const value = await fixture(t);
  const laneRoot = path.join(
    value.root,
    "leetplus-founder-production-history-prod-a2",
  );
  let state = sourceEvidence(value.rows);
  let reconciled = false;
  let reconciliationCalls = 0;
  let recoveredLocks = 0;
  const adapter = {
    acquireLock: async () => undefined,
    inspectFinal: async () => ({
      preterminalManifestDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalPreterminalManifestDigest,
      workerFunctionDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalWorkerFunctionDigest,
    }),
    inspectReconciliation: async () => (reconciled ? "APPLIED" : "NOT_APPLIED"),
    inspectTarget: async () => state,
    reconcile: async () => {
      reconciliationCalls += 1;
      reconciled = true;
      state = { ...state, runningDigestRows: [] };
      const error = new Error("lost response");
      error.code = "ECONNRESET";
      throw error;
    },
    recoverLock: async () => {
      recoveredLocks += 1;
    },
    releaseLock: async () => undefined,
  };
  const plan = await planFor(value, adapter);
  const result = await applyFounderPilotProductionHistoryProductionPlan({
    adapter,
    approval: approvalFor(value, plan),
    confirmPlanDigest: plan.planDigest,
    deploy: async () => {
      state = await finalEvidence(laneRoot, identity());
      return { status: "SUCCEEDED" };
    },
    inspectArtifact: async ({ expectedSha256 }) => ({
      actualSha256: expectedSha256,
    }),
    laneRoot,
    manifest: value.manifest,
    now: () => new Date("2026-08-20T18:01:00.000Z"),
    onPhase: async () => undefined,
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
    productionConfirmation:
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(result.reconciliationRecovered, true);
  assert.equal(reconciliationCalls, 1);
  assert.equal(recoveredLocks, 1);
});

test("retries one ambiguous deploy only after exact source-state reconciliation", async (t) => {
  const value = await fixture(t);
  const laneRoot = path.join(
    value.root,
    "leetplus-founder-production-history-prod-a3",
  );
  let state = sourceEvidence(value.rows);
  let reconciled = false;
  let deployCalls = 0;
  const adapter = {
    acquireLock: async () => undefined,
    inspectFinal: async () => ({
      preterminalManifestDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalPreterminalManifestDigest,
      workerFunctionDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalWorkerFunctionDigest,
    }),
    inspectReconciliation: async () => (reconciled ? "APPLIED" : "NOT_APPLIED"),
    inspectTarget: async () => state,
    reconcile: async () => {
      reconciled = true;
      state = { ...state, runningDigestRows: [] };
      return 4;
    },
    releaseLock: async () => undefined,
  };
  const plan = await planFor(value, adapter);
  const result = await applyFounderPilotProductionHistoryProductionPlan({
    adapter,
    approval: approvalFor(value, plan),
    confirmPlanDigest: plan.planDigest,
    deploy: async () => {
      deployCalls += 1;
      if (deployCalls === 1) return { status: "AMBIGUOUS" };
      state = await finalEvidence(laneRoot, identity());
      return { status: "SUCCEEDED" };
    },
    inspectArtifact: async ({ expectedSha256 }) => ({
      actualSha256: expectedSha256,
    }),
    laneRoot,
    manifest: value.manifest,
    now: () => new Date("2026-08-20T18:01:00.000Z"),
    onPhase: async () => undefined,
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
    productionConfirmation:
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(result.deploymentAttempt, 2);
  assert.equal(deployCalls, 2);
});

test("never retries an ambiguous deploy after any partial migration state", async (t) => {
  const value = await fixture(t);
  const laneRoot = path.join(
    value.root,
    "leetplus-founder-production-history-prod-partial",
  );
  let state = sourceEvidence(value.rows);
  let reconciled = false;
  let deployCalls = 0;
  const adapter = {
    acquireLock: async () => undefined,
    inspectFinal: async () => ({
      preterminalManifestDigest: null,
      workerFunctionDigest: null,
    }),
    inspectReconciliation: async () => (reconciled ? "APPLIED" : "NOT_APPLIED"),
    inspectTarget: async () => state,
    reconcile: async () => {
      reconciled = true;
      state = { ...state, runningDigestRows: [] };
      return 4;
    },
    releaseLock: async () => undefined,
  };
  const plan = await planFor(value, adapter);
  await assert.rejects(
    () =>
      applyFounderPilotProductionHistoryProductionPlan({
        adapter,
        approval: approvalFor(value, plan),
        confirmPlanDigest: plan.planDigest,
        deploy: async () => {
          deployCalls += 1;
          state = {
            ...state,
            migrationCount: 154,
            migrationHead: "20260721120000_tenant_execution_control_plane",
          };
          return { status: "AMBIGUOUS" };
        },
        inspectArtifact: async ({ expectedSha256 }) => ({
          actualSha256: expectedSha256,
        }),
        laneRoot,
        manifest: value.manifest,
        now: () => new Date("2026-08-20T18:01:00.000Z"),
        onPhase: async () => undefined,
        pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
        plan,
        productionConfirmation:
          FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
        sourcePrismaRoot: PRISMA_ROOT,
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_PRISMA_DEPLOY_AMBIGUOUS" },
  );
  assert.equal(deployCalls, 1);
});

test("resumes from a durable reconciliation marker without repeating reconciliation", async (t) => {
  const value = await fixture(t);
  const laneRoot = path.join(
    value.root,
    "leetplus-founder-production-history-prod-a4",
  );
  const planningAdapter = {
    inspectTarget: async () => sourceEvidence(value.rows),
  };
  const plan = await planFor(value, planningAdapter);
  let state = { ...sourceEvidence(value.rows), runningDigestRows: [] };
  let reconcileCalls = 0;
  const phases = [];
  const adapter = {
    acquireLock: async () => undefined,
    inspectFinal: async () => ({
      preterminalManifestDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalPreterminalManifestDigest,
      workerFunctionDigest:
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalWorkerFunctionDigest,
    }),
    inspectReconciliation: async () => "APPLIED",
    inspectTarget: async () => state,
    reconcile: async () => {
      reconcileCalls += 1;
      return 4;
    },
    releaseLock: async () => undefined,
  };
  const result = await applyFounderPilotProductionHistoryProductionPlan({
    adapter,
    approval: approvalFor(value, plan),
    confirmPlanDigest: plan.planDigest,
    deploy: async () => {
      state = await finalEvidence(laneRoot, identity());
      return { status: "SUCCEEDED" };
    },
    inspectArtifact: async ({ expectedSha256 }) => ({
      actualSha256: expectedSha256,
    }),
    laneRoot,
    manifest: value.manifest,
    now: () => new Date("2026-08-20T18:02:00.000Z"),
    onPhase: async (phase) => phases.push(phase.phase),
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
    productionConfirmation:
      FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  assert.equal(result.decision, FOUNDER_PILOT_PRODUCTION_HISTORY_APPLIED);
  assert.equal(reconcileCalls, 0);
  assert.ok(phases.includes("DURABLE_RECONCILIATION_RESUME_VERIFIED"));
});

test("bounded deploy runner exposes only digests and a minimal child environment", async (t) => {
  const { laneRoot, prismaCliPath } = await boundedDeployFixture(t);
  const timers = controlledTimers();
  const signals = [];
  let childOptions = null;
  const result = await runBoundedFounderPilotProductionHistoryPrismaDeploy({
    cancelTimer: timers.cancelTimer,
    databaseUrl: PRODUCTION_DATABASE_URL,
    laneRoot,
    prismaCliPath,
    scheduleTimer: timers.scheduleTimer,
    signalProcess: (_child, signal) => {
      signals.push(signal);
      return true;
    },
    spawnProcess: (_command, _args, options) => {
      childOptions = options;
      const child = deployChild();
      queueMicrotask(() => {
        child.stdout.end("applied\n");
        child.stderr.end();
        child.exitCode = 0;
        child.emit("close", 0, null);
      });
      return child;
    },
    timeoutSeconds: 60,
  });
  assert.equal(result.status, "SUCCEEDED");
  assert.deepEqual(signals, []);
  assert.equal(timers.handles.length, 1);
  assert.equal(timers.handles[0].cancelled, true);
  assert.equal(timers.handles[0].unrefed, true);
  assert.match(result.stdoutSha256, /^[0-9a-f]{64}$/u);
  assert.equal("SYNC_SERVICE_TOKEN" in childOptions.env, false);
  assert.equal(childOptions.env.DATABASE_URL, PRODUCTION_DATABASE_URL);
  assert.deepEqual(Object.keys(childOptions.env).sort(), [
    "DATABASE_URL",
    "NODE_ENV",
    "NO_COLOR",
    "PATH",
    "PRISMA_HIDE_UPDATE_MESSAGE",
  ]);
  assert.equal(
    childOptions.env.PATH,
    process.platform === "win32"
      ? path.dirname(process.execPath)
      : "/usr/bin:/bin",
  );
});

test("bounded deploy watchdog cannot SIGKILL a completed or reused child", async (t) => {
  const { laneRoot, prismaCliPath } = await boundedDeployFixture(t);
  const timers = controlledTimers();
  const signals = [];
  let child;
  let spawnedResolve;
  const spawned = new Promise((resolve) => {
    spawnedResolve = resolve;
  });
  const execution = runBoundedFounderPilotProductionHistoryPrismaDeploy({
    cancelTimer: timers.cancelTimer,
    databaseUrl: PRODUCTION_DATABASE_URL,
    laneRoot,
    prismaCliPath,
    scheduleTimer: timers.scheduleTimer,
    signalProcess: (_child, signal) => {
      signals.push(signal);
      return true;
    },
    spawnProcess: () => {
      child = deployChild();
      spawnedResolve();
      return child;
    },
    timeoutSeconds: 60,
  });
  await spawned;
  assert.equal(timers.handles.length, 1);
  timers.handles[0].callback();
  timers.handles[0].callback();
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(timers.handles.length, 2);
  const escalation = timers.handles[1];
  assert.equal(escalation.delay, 5000);
  assert.equal(escalation.unrefed, true);

  child.exitCode = 0;
  child.emit("close", 0, null);
  const result = await execution;
  assert.equal(result.status, "AMBIGUOUS");
  assert.equal(escalation.cancelled, true);
  escalation.callback();
  assert.deepEqual(signals, ["SIGTERM"]);
});

test("bounded deploy watchdog escalates a live child at most once", async (t) => {
  const { laneRoot, prismaCliPath } = await boundedDeployFixture(t);
  const timers = controlledTimers();
  const signals = [];
  let child;
  let spawnedResolve;
  const spawned = new Promise((resolve) => {
    spawnedResolve = resolve;
  });
  const execution = runBoundedFounderPilotProductionHistoryPrismaDeploy({
    cancelTimer: timers.cancelTimer,
    databaseUrl: PRODUCTION_DATABASE_URL,
    laneRoot,
    prismaCliPath,
    scheduleTimer: timers.scheduleTimer,
    signalProcess: (_child, signal) => {
      signals.push(signal);
      return signal === "SIGTERM";
    },
    spawnProcess: () => {
      child = deployChild();
      spawnedResolve();
      return child;
    },
    timeoutSeconds: 60,
  });
  await spawned;
  timers.handles[0].callback();
  const escalation = timers.handles[1];
  escalation.callback();
  escalation.callback();
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  child.signalCode = "SIGKILL";
  child.emit("close", null, "SIGKILL");
  const result = await execution;
  assert.equal(result.status, "AMBIGUOUS");
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("bounded deploy watchdog never escalates after a rejected SIGTERM", async (t) => {
  const { laneRoot, prismaCliPath } = await boundedDeployFixture(t);
  const timers = controlledTimers();
  const signals = [];
  let child;
  let spawnedResolve;
  const spawned = new Promise((resolve) => {
    spawnedResolve = resolve;
  });
  const execution = runBoundedFounderPilotProductionHistoryPrismaDeploy({
    cancelTimer: timers.cancelTimer,
    databaseUrl: PRODUCTION_DATABASE_URL,
    laneRoot,
    prismaCliPath,
    scheduleTimer: timers.scheduleTimer,
    signalProcess: (_child, signal) => {
      signals.push(signal);
      return false;
    },
    spawnProcess: () => {
      child = deployChild();
      spawnedResolve();
      return child;
    },
    timeoutSeconds: 60,
  });
  await spawned;
  const watchdog = timers.handles[0];
  watchdog.callback();
  watchdog.callback();
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(timers.handles.length, 1);

  child.exitCode = 0;
  child.emit("close", 0, null);
  const result = await execution;
  assert.equal(result.status, "AMBIGUOUS");
  watchdog.callback();
  assert.deepEqual(signals, ["SIGTERM"]);
  assert.equal(timers.handles.length, 1);
});

test("bounded deploy spawn error cancels all timers idempotently", async (t) => {
  const { laneRoot, prismaCliPath } = await boundedDeployFixture(t);
  const timers = controlledTimers();
  const signals = [];
  let child;
  let spawnedResolve;
  const spawned = new Promise((resolve) => {
    spawnedResolve = resolve;
  });
  const execution = runBoundedFounderPilotProductionHistoryPrismaDeploy({
    cancelTimer: timers.cancelTimer,
    databaseUrl: PRODUCTION_DATABASE_URL,
    laneRoot,
    prismaCliPath,
    scheduleTimer: timers.scheduleTimer,
    signalProcess: (_child, signal) => {
      signals.push(signal);
      return true;
    },
    spawnProcess: () => {
      child = deployChild();
      spawnedResolve();
      return child;
    },
    timeoutSeconds: 60,
  });
  await spawned;
  const watchdog = timers.handles[0];
  child.emit("error", new Error("spawn failed"));
  assert.equal(watchdog.cancelled, true);
  watchdog.callback();
  watchdog.callback();
  assert.deepEqual(signals, []);
  child.exitCode = 1;
  child.emit("close", 1, null);
  const result = await execution;
  assert.equal(result.status, "AMBIGUOUS");
  assert.deepEqual(signals, []);
});

test("phase journal is exclusive, append-only, hash chained and fsynced by record", async (t) => {
  const root = await temporaryRoot(t);
  const journalPath = path.join(root, "production-history-receipt.jsonl");
  const journal =
    await createFounderPilotProductionHistoryPhaseJournal(journalPath);
  await journal.record({ phase: "INTENT", planDigest: "a".repeat(64) });
  await journal.record({ phase: "APPLIED", planDigest: "a".repeat(64) });
  await journal.close();
  const records = (await readFile(journalPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records.length, 2);
  assert.equal(records[0].sequence, 1);
  assert.equal(records[1].sequence, 2);
  assert.equal(records[1].previousRecordDigest, records[0].recordDigest);
  await assert.rejects(
    () => createFounderPilotProductionHistoryPhaseJournal(journalPath),
    (error) => error?.code === "EEXIST",
  );
});

test("production database URL requires one canonical owner role switch", async (t) => {
  const value = await fixture(t);
  assert.deepEqual(
    assertFounderPilotProductionHistoryProductionDatabaseUrl(
      PRODUCTION_DATABASE_URL,
      value.manifest.target,
    ),
    {
      databaseName: "leetplus",
      host: "127.0.0.1",
      migrationRoleName: "leetplus_migration",
      objectOwnerRoleName: "leetplus_runtime",
      port: 5432,
    },
  );
  for (const rejectedUrl of [
    "postgresql://leetplus_migration:0123456789abcdef@127.0.0.1:5432/leetplus",
    "postgresql://leetplus_migration:0123456789abcdef@127.0.0.1:5432/leetplus?options=-c%20role%3Dleetplus_other_owner",
    "postgresql://leetplus_migration:0123456789abcdef@127.0.0.1:5432/leetplus?options=-c+role%3Dleetplus_runtime",
    "postgresql://leetplus_migration:0123456789abcdef@127.0.0.1:5432/leetplus?options=-c%20role%3Dleetplus_runtime&sslmode=require",
    "postgresql://leetplus_migration:0123456789abcdef@127.0.0.1:5432/leetplus?options=-c%20role%3Dleetplus_runtime&options=-c%20role%3Dleetplus_runtime",
  ]) {
    assert.throws(
      () =>
        assertFounderPilotProductionHistoryProductionDatabaseUrl(
          rejectedUrl,
          value.manifest.target,
        ),
      { reasonCode: "FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_MISMATCH" },
    );
  }
  for (const rejectedRawUrl of [
    `${PRODUCTION_DATABASE_URL}#`,
    `${PRODUCTION_DATABASE_URL} `,
    ` ${PRODUCTION_DATABASE_URL}`,
    `${PRODUCTION_DATABASE_URL}\n`,
  ]) {
    assert.throws(
      () =>
        assertFounderPilotProductionHistoryProductionDatabaseUrl(
          rejectedRawUrl,
          value.manifest.target,
        ),
      { reasonCode: "FOUNDER_PRODUCTION_HISTORY_DATABASE_URL_INVALID" },
    );
  }
});

test("manifest binds the object owner to one exact application runtime role", async (t) => {
  const value = await fixture(t);
  for (const targetOverride of [
    { objectOwnerRoleName: "leetplus_other_owner", objectOwnerRoleOid: 19003 },
    { objectOwnerRoleName: "leetplus_runtime", objectOwnerRoleOid: 19003 },
  ]) {
    assert.throws(
      () =>
        normalizeFounderPilotProductionHistoryProductionManifest({
          ...value.manifest,
          target: {
            ...value.manifest.target,
            ...targetOverride,
          },
        }),
      { reasonCode: "FOUNDER_PRODUCTION_HISTORY_RUNTIME_ROLES_INVALID" },
    );
  }
});

test("production final check rejects any public object owner mismatch", async (t) => {
  const value = await fixture(t);
  const laneRoot = path.join(
    value.root,
    "leetplus-founder-production-history-final-owner-mismatch",
  );
  await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot: PRISMA_ROOT,
  });
  const state = await finalEvidence(
    laneRoot,
    identity({ publicClassOwnerMismatchCount: 1 }),
  );
  await assert.rejects(
    () =>
      verifyFounderPilotProductionHistoryProductionFinal({
        adapter: {
          inspectFinal: async () => ({
            preterminalManifestDigest:
              FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalPreterminalManifestDigest,
            workerFunctionDigest:
              FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.finalWorkerFunctionDigest,
          }),
          inspectTarget: async () => state,
        },
        laneRoot,
        manifest: value.manifest,
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_LIVE_IDENTITY_MISMATCH" },
  );
});

test("restored-copy production database names stay forbidden", async (t) => {
  const value = await fixture(t);
  assert.throws(
    () =>
      normalizeFounderPilotProductionHistoryProductionManifest({
        ...value.manifest,
        target: {
          ...value.manifest.target,
          databaseName: "leetplus_restored_copy",
        },
      }),
    { reasonCode: "FOUNDER_PRODUCTION_HISTORY_TARGET_DATABASE_FORBIDDEN" },
  );
});

test("production source preserves the bounded lock order and contains no automatic entrypoint", async () => {
  const source = await readFile(
    path.join(SCRIPT_ROOT, "founder-pilot-production-history-production.mjs"),
    "utf8",
  );
  assert.match(source, /pg_try_advisory_lock\(\$1::bigint\)/u);
  assert.match(
    source,
    /LOCK TABLE public\."_prisma_migrations" IN SHARE MODE/u,
  );
  assert.match(
    source,
    /LOCK TABLE public\."ReportDigestScheduleRun" IN SHARE ROW EXCLUSIVE MODE/u,
  );
  assert.match(source, /SET LOCAL lock_timeout = '3s'/u);
  assert.match(source, /SET LOCAL statement_timeout = '20s'/u);
  assert.match(source, /session_role\.rolname = SESSION_USER/u);
  assert.match(source, /current_role\.rolname = CURRENT_USER/u);
  assert.match(source, /session_role\.rolinherit AS "sessionRoleInherit"/u);
  assert.match(source, /FROM pg_catalog\.pg_auth_members AS membership/u);
  assert.match(source, /membership\.admin_option/u);
  assert.match(source, /membership\.inherit_option/u);
  assert.match(source, /membership\.set_option/u);
  assert.doesNotMatch(source, /process\.env|pathToFileURL\(process\.argv/u);
  assert.doesNotMatch(source, /DELETE FROM public\."ReportDigestScheduleRun"/u);
});

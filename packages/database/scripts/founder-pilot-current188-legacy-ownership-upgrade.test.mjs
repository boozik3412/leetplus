import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
  FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS,
  applyFounderPilotCurrent188LegacyOwnershipPlan,
  buildFounderPilotCurrent188LegacyOwnershipPlan,
  normalizeFounderPilotCurrent188LegacyOwnershipManifest,
  signFounderPilotCurrent188LegacyOwnershipPlan,
  verifyFounderPilotCurrent188LegacyOwnershipApproval,
} from "./founder-pilot-current188-legacy-ownership-upgrade.mjs";
import { FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS } from "./founder-pilot-production-history-rehearsal.mjs";
import { materializeFounderPilotProductionHistoryLane } from "./founder-pilot-production-history-rehearsal.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRISMA_ROOT = path.resolve(SCRIPT_ROOT, "../prisma");
const NOW = "2026-08-29T10:00:00.000Z";
const SYSTEM_IDENTIFIER = "7675301746759083084";
const RELEASE_SHA = "c".repeat(40);
const HISTORICAL_OWNERSHIP_DIGEST = "a".repeat(64);
const MEMBERSHIP_DIGEST = "b".repeat(64);
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

function migrationDigest(rows) {
  return sha256(
    rows
      .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
      .sort()
      .join("\n"),
  );
}

function keys() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKeyPem: pair.publicKey.export({ format: "pem", type: "spki" }),
    publicKeySpkiSha256: sha256(
      pair.publicKey.export({ format: "der", type: "spki" }),
    ),
  };
}

const EXPECTED_ROLES = [
  {
    bypassRls: false,
    canLogin: false,
    createDb: false,
    createRole: false,
    inherit: true,
    name: "leetplus",
    oid: 19001,
    replication: false,
    superuser: false,
  },
  {
    bypassRls: false,
    canLogin: true,
    createDb: false,
    createRole: false,
    inherit: false,
    name: "leetplus_runtime",
    oid: 19002,
    replication: false,
    superuser: false,
  },
  {
    bypassRls: false,
    canLogin: true,
    createDb: true,
    createRole: true,
    inherit: true,
    name: "postgres",
    oid: 10,
    replication: true,
    superuser: true,
  },
];

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lp-current188-legacy-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function targetRows(laneRoot) {
  const migrationsRoot = path.join(laneRoot, "migrations");
  const names = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (migrationName) => ({
      applied: true,
      checksum:
        LEGACY_APPLIED_CHECKSUMS.get(migrationName) ??
        sha256(
          await readFile(
            path.join(migrationsRoot, migrationName, "migration.sql"),
          ),
        ),
      migrationName,
      rolledBack: false,
    })),
  );
}

function bridgeAttestation(phase) {
  const source = phase === "SOURCE_187";
  return {
    acceptedAt: "2026-08-29T09:58:00.000000000Z",
    activeTarget: "/etc/nginx/leetplus/upstreams/green.conf",
    activeTargetSha256: "1".repeat(64),
    apiBaseUrl: "http://127.0.0.1:4200",
    apiUnit: "leetplus-api@green.service",
    apiUnitFileSha256: "2".repeat(64),
    bridgeContract: "GUEST_SUPPORT_CURRENT187_ACTIVE_BRIDGE_CUTOVER_V1",
    bugReportingMode: "OFF",
    canarySafeEnvironmentSha256: "3".repeat(64),
    compatibilityMode: source ? "GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE" : null,
    compatibilityTargetMigration: source
      ? FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetMigrationHead
      : null,
    compatibilityTargetMigrationCount: source ? 188 : null,
    cutoverGeneration: 4,
    cutoverReceiptName: `20260829T095800000000000Z-g4-${RELEASE_SHA}-green.receipt`,
    cutoverReceiptSha256: "4".repeat(64),
    databaseMigration: source
      ? FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.sourceMigrationHead
      : FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetMigrationHead,
    databaseMigrationCount: source ? 187 : 188,
    latestReceiptConsumed: false,
    pendingIntentCount: 0,
    phase,
    releaseSha: RELEASE_SHA,
    runtimeEnvironmentSha256: "5".repeat(64),
    runtimeRole: "COMBINED",
    schemaBridgeMode: "ALLOW_CURRENT_187",
    slot: "green",
    slotEnvironmentSha256: "6".repeat(64),
    webBaseUrl: "http://127.0.0.1:3200",
    webBuildId: RELEASE_SHA,
    webUnit: "leetplus-web@green.service",
    webUnitFileSha256: "7".repeat(64),
  };
}

function runtimeAdapter() {
  let locks = 0;
  return {
    adapter: {
      acquireLock: async () => {
        locks += 1;
      },
      inspectSource: async () => bridgeAttestation("SOURCE_187"),
      inspectTarget: async () => bridgeAttestation("TARGET_188"),
      releaseLock: async () => {
        locks -= 1;
      },
    },
    locks: () => locks,
  };
}

function support(mode) {
  if (mode === "SOURCE") {
    return {
      constraintNames: [],
      enumTypes: [],
      indexNames: [],
      migrationChecksum: null,
      publicTablePrivilegeCount: 0,
      publicTypePrivilegeCount: 0,
      publicWorkerExecuteCount: 0,
      tableAccess: [],
      tableNames: [],
      typeAccess: [],
      workerFunctionOwnerRoleName: "postgres",
    };
  }
  const final = mode === "FINAL";
  return {
    constraintNames:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportConstraints,
    enumTypes: FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportEnums,
    indexNames:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportIndexes,
    migrationChecksum:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetMigrationSha256,
    publicTablePrivilegeCount: 0,
    publicTypePrivilegeCount: final ? 0 : 2,
    publicWorkerExecuteCount: 0,
    tableAccess:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportTables.map(
        (name) => ({
          name,
          nonOwnerPrivileges: final
            ? FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportTablePrivileges[
                name
              ].map((privilege) => ({
                grantable: false,
                grantee: "leetplus_runtime",
                privilege,
              }))
            : [],
          ownerName: "postgres",
        }),
      ),
    tableNames:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportTables,
    typeAccess:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.supportEnums.map(
        ({ name }) => ({
          name,
          nonOwnerPrivileges: [
            {
              grantable: false,
              grantee: final ? "leetplus_runtime" : "PUBLIC",
              privilege: "USAGE",
            },
          ],
          ownerName: "postgres",
        }),
      ),
    workerFunctionOwnerRoleName: "postgres",
  };
}

function evidence(rows, mode = "SOURCE", overrides = {}) {
  const applied = mode === "SOURCE" ? rows.slice(0, -1) : rows;
  return {
    activeRuntimeRoleNames: ["leetplus_runtime"],
    applicationRuntimeSchemaCreate: false,
    applicationRuntimeSchemaUsage: true,
    currentDatabase: "leetplus",
    databaseOwnerRoleName: "leetplus",
    databaseOwnerRoleOid: 19001,
    historicalOwnershipDigest: HISTORICAL_OWNERSHIP_DIGEST,
    inRecovery: false,
    migrationCount: applied.length,
    migrationHead: applied.at(-1).migrationName,
    migrationManifestDigest: migrationDigest(applied),
    migrationRows: applied,
    ownershipCounts: { leetplus: 10, postgres: 3 },
    preterminalManifestDigest:
      mode === "SOURCE"
        ? FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetPreterminalManifestSha256
        : FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetPreterminalManifestSha256,
    roleMembershipDigest: MEMBERSHIP_DIGEST,
    roles: EXPECTED_ROLES,
    rolledBackMigrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
    rolledBackMigrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
    serverAddress: "127.0.0.1",
    serverMajor: 16,
    serverPort: 5432,
    sessionRoleName: "leetplus_runtime",
    sessionRoleOid: 19002,
    support: support(mode),
    systemIdentifier: SYSTEM_IDENTIFIER,
    unfinishedMigrationCount: 0,
    workerFunctionDigest:
      mode === "SOURCE"
        ? FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.sourceWorkerFunctionSha256
        : FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetWorkerFunctionSha256,
    workerFunctionComment:
      mode === "SOURCE"
        ? FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.sourceWorkerFunctionComment
        : FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetWorkerFunctionComment,
    workerFunctionOwnerRoleName: "postgres",
    workerFunctionOwnerRoleOid: 10,
    ...overrides,
  };
}

function stateAdapter(initial) {
  let state = initial;
  let locks = 0;
  return {
    adapter: {
      acquireLock: async () => {
        locks += 1;
      },
      inspect: async () => state,
      releaseLock: async () => {
        locks -= 1;
      },
    },
    locks: () => locks,
    set: (value) => {
      state = value;
    },
  };
}

async function fixture(t) {
  const root = await temporaryRoot(t);
  const laneRoot = path.join(
    root,
    "leetplus-founder-production-history-current188-legacy-test",
  );
  const lane = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot: PRISMA_ROOT,
    targetMigrationCount: 188,
    targetMigrationHead:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONSTANTS.targetMigrationHead,
  });
  const rows = await targetRows(laneRoot);
  const key = keys();
  const artifactPath = path.join(root, "release.tar.gz");
  const artifact = Buffer.from("current188-legacy-release\n", "utf8");
  await writeFile(artifactPath, artifact, { flag: "wx", mode: 0o600 });
  const manifest = normalizeFounderPilotCurrent188LegacyOwnershipManifest({
    approval: {
      keyId: "current188-legacy-test",
      maxPlanAgeSeconds: 900,
      maxRecoveryAgeSeconds: 86400,
      publicKeyPem: key.publicKeyPem,
      publicKeySpkiSha256: key.publicKeySpkiSha256,
    },
    contractVersion: "FOUNDER_PILOT_CURRENT188_LEGACY_MIXED_OWNERSHIP_V1",
    environment: "PRODUCTION",
    operation: { deployTimeoutSeconds: 120 },
    release: {
      artifactPath,
      artifactSha256: sha256(artifact),
      materializedTreeDigest: lane.treeDigest,
      releaseSha: RELEASE_SHA,
    },
    target: {
      activeRuntimeRoleNames: ["leetplus_runtime"],
      applicationRuntimeRole: { name: "leetplus_runtime", oid: 19002 },
      databaseName: "leetplus",
      databaseOwnerRole: { name: "leetplus", oid: 19001 },
      expectedHistoricalOwnershipDigest: HISTORICAL_OWNERSHIP_DIGEST,
      expectedRoleMembershipDigest: MEMBERSHIP_DIGEST,
      expectedRoles: EXPECTED_ROLES,
      expectedServerMajor: 16,
      expectedSystemIdentifier: SYSTEM_IDENTIFIER,
      host: "127.0.0.1",
      inspectionRole: { name: "leetplus_runtime", oid: 19002 },
      port: 5432,
      privilegedExecutionRole: { name: "postgres", oid: 10 },
      workerFunctionOwnerRole: { name: "postgres", oid: 10 },
    },
  });
  return { key, laneRoot, manifest, rows, runtime: runtimeAdapter() };
}

async function buildPlan(value, state) {
  return buildFounderPilotCurrent188LegacyOwnershipPlan({
    adapter: state.adapter,
    laneRoot: value.laneRoot,
    manifest: value.manifest,
    now: () => new Date(NOW),
    runtimeAdapter: value.runtime.adapter,
    sourcePrismaRoot: PRISMA_ROOT,
  });
}

function approval(value, plan) {
  return signFounderPilotCurrent188LegacyOwnershipPlan({
    manifest: value.manifest,
    plan,
    privateKeyPem: value.key.privateKeyPem,
  });
}

function applyOptions(
  value,
  state,
  plan,
  executor,
  now = "2026-08-29T10:01:00.000Z",
) {
  return {
    adapter: state.adapter,
    approval: approval(value, plan),
    confirmPlanDigest: plan.planDigest,
    executor,
    laneRoot: value.laneRoot,
    manifest: value.manifest,
    now: () => new Date(now),
    onPhase: async () => undefined,
    pinnedApprovalKeySpkiSha256: value.manifest.approval.publicKeySpkiSha256,
    plan,
    productionConfirmation:
      FOUNDER_PILOT_CURRENT188_LEGACY_OWNERSHIP_CONFIRMATION,
    runtimeAdapter: value.runtime.adapter,
    sourcePrismaRoot: PRISMA_ROOT,
  };
}

test("builds and signs a mixed-owner exact plan", async (t) => {
  const value = await fixture(t);
  const state = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, state);
  assert.equal(plan.historicalOwnershipDigest, HISTORICAL_OWNERSHIP_DIGEST);
  assert.equal(plan.targetMigrationCount, 188);
  const signed = approval(value, plan);
  assert.match(signed.signature, /^[A-Za-z0-9_-]{86}$/u);
  assert.match(
    verifyFounderPilotCurrent188LegacyOwnershipApproval({
      approval: signed,
      manifest: value.manifest,
      pinnedApprovalKeySpkiSha256: value.manifest.approval.publicKeySpkiSha256,
      plan,
    }).approvalDigest,
    /^[0-9a-f]{64}$/u,
  );
  assert.equal(value.runtime.locks(), 0);
});

test("migrates, applies only the runtime ACL and reaches final", async (t) => {
  const value = await fixture(t);
  const state = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, state);
  const calls = [];
  const result = await applyFounderPilotCurrent188LegacyOwnershipPlan(
    applyOptions(value, state, plan, {
      grantRuntimeAccess: async () => {
        calls.push("grant");
        state.set(evidence(value.rows, "FINAL"));
        return { status: "SUCCEEDED" };
      },
      migrate: async () => {
        calls.push("migrate");
        state.set(evidence(value.rows, "PRE_GRANT"));
        return { status: "SUCCEEDED" };
      },
    }),
  );
  assert.deepEqual(calls, ["migrate", "grant"]);
  assert.equal(result.decision, "CURRENT188_LEGACY_OWNERSHIP_APPLIED");
  assert.equal(result.deploymentAttempt, 1);
  assert.equal(result.grantAttempt, 1);
  assert.equal(state.locks(), 0);
  assert.equal(value.runtime.locks(), 0);
});

test("recovers after migration committed before ACL grants", async (t) => {
  const value = await fixture(t);
  const sourceState = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, sourceState);
  const state = stateAdapter(evidence(value.rows, "PRE_GRANT"));
  let migrated = false;
  const result = await applyFounderPilotCurrent188LegacyOwnershipPlan(
    applyOptions(value, state, plan, {
      grantRuntimeAccess: async () => {
        state.set(evidence(value.rows, "FINAL"));
        return { status: "SUCCEEDED" };
      },
      migrate: async () => {
        migrated = true;
        return { status: "SUCCEEDED" };
      },
    }),
  );
  assert.equal(migrated, false);
  assert.equal(result.deploymentAttempt, 0);
  assert.equal(result.recoveredFromLostResponse, true);
});

test("expired effect window permits only signed post-migration recovery", async (t) => {
  const value = await fixture(t);
  const sourceState = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, sourceState);
  const state = stateAdapter(evidence(value.rows, "PRE_GRANT"));
  let migrated = false;
  const result = await applyFounderPilotCurrent188LegacyOwnershipPlan(
    applyOptions(
      value,
      state,
      plan,
      {
        grantRuntimeAccess: async () => {
          state.set(evidence(value.rows, "FINAL"));
          return { status: "SUCCEEDED" };
        },
        migrate: async () => {
          migrated = true;
          return { status: "SUCCEEDED" };
        },
      },
      "2026-08-29T11:00:00.000Z",
    ),
  );
  assert.equal(migrated, false);
  assert.equal(result.deploymentAttempt, 0);
  assert.equal(result.grantAttempt, 1);
});

test("expired effect window cannot start migration from source", async (t) => {
  const value = await fixture(t);
  const state = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, state);
  await assert.rejects(
    applyFounderPilotCurrent188LegacyOwnershipPlan(
      applyOptions(
        value,
        state,
        plan,
        {
          grantRuntimeAccess: async () => {
            throw new Error("MUST_NOT_GRANT");
          },
          migrate: async () => {
            throw new Error("MUST_NOT_MIGRATE");
          },
        },
        "2026-08-29T11:00:00.000Z",
      ),
    ),
    { reasonCode: "CURRENT188_LEGACY_RECOVERY_SOURCE_EFFECT_FORBIDDEN" },
  );
});

test("accepts a lost ACL response only after exact final inspection", async (t) => {
  const value = await fixture(t);
  const sourceState = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, sourceState);
  const state = stateAdapter(evidence(value.rows, "PRE_GRANT"));
  const result = await applyFounderPilotCurrent188LegacyOwnershipPlan(
    applyOptions(value, state, plan, {
      grantRuntimeAccess: async () => {
        state.set(evidence(value.rows, "FINAL"));
        return { status: "AMBIGUOUS" };
      },
      migrate: async () => ({ status: "SUCCEEDED" }),
    }),
  );
  assert.equal(result.recoveredFromLostResponse, true);
  assert.equal(result.grantAttempt, 1);
});

test("replay at exact final is a no-op", async (t) => {
  const value = await fixture(t);
  const sourceState = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, sourceState);
  const state = stateAdapter(evidence(value.rows, "FINAL"));
  const result = await applyFounderPilotCurrent188LegacyOwnershipPlan(
    applyOptions(value, state, plan, {
      grantRuntimeAccess: async () => {
        throw new Error("MUST_NOT_GRANT");
      },
      migrate: async () => {
        throw new Error("MUST_NOT_MIGRATE");
      },
    }),
  );
  assert.equal(result.deploymentAttempt, 0);
  assert.equal(result.grantAttempt, 0);
});

test("ownership drift after approval fails closed and releases locks", async (t) => {
  const value = await fixture(t);
  const sourceState = stateAdapter(evidence(value.rows));
  const plan = await buildPlan(value, sourceState);
  const drifted = stateAdapter(
    evidence(value.rows, "SOURCE", {
      historicalOwnershipDigest: "d".repeat(64),
    }),
  );
  await assert.rejects(
    applyFounderPilotCurrent188LegacyOwnershipPlan(
      applyOptions(value, drifted, plan, {
        grantRuntimeAccess: async () => ({ status: "SUCCEEDED" }),
        migrate: async () => ({ status: "SUCCEEDED" }),
      }),
    ),
    { reasonCode: "CURRENT188_LEGACY_SOURCE_STATE_MISMATCH" },
  );
  assert.equal(drifted.locks(), 0);
  assert.equal(value.runtime.locks(), 0);
});

test("manifest rejects a privileged application runtime role", async (t) => {
  const value = await fixture(t);
  const raw = structuredClone(value.manifest);
  raw.target.expectedRoles = raw.target.expectedRoles.map((role) =>
    role.name === "leetplus_runtime" ? { ...role, superuser: true } : role,
  );
  assert.throws(
    () => normalizeFounderPilotCurrent188LegacyOwnershipManifest(raw),
    { reasonCode: "CURRENT188_LEGACY_TARGET_INVALID" },
  );
});

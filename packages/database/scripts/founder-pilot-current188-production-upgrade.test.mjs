import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
  FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS,
  applyFounderPilotCurrent188ProductionUpgradePlan,
  buildFounderPilotCurrent188ProductionUpgradePlan,
  createFounderPilotCurrent188ProductionBridgeRuntimeAdapter,
  founderPilotCurrent188BridgeAttestationDigest,
  normalizeFounderPilotCurrent188BridgeAttestation,
  normalizeFounderPilotCurrent188ProductionUpgradeManifest,
  signFounderPilotCurrent188ProductionUpgradePlan,
  verifyFounderPilotCurrent188ProductionUpgradeApproval,
} from "./founder-pilot-current188-production-upgrade.mjs";
import { FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS } from "./founder-pilot-production-history-rehearsal.mjs";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRISMA_ROOT = path.resolve(SCRIPT_ROOT, "../prisma");
const NOW = "2026-08-28T14:00:00.000Z";
const SYSTEM_IDENTIFIER = "7675301746759083084";
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

const SUPPORT_TABLES = [
  "GuestSupportAttachment",
  "GuestSupportTicket",
  "GuestSupportTicketAuditEvent",
  "GuestSupportTicketComment",
];
const SUPPORT_INDEXES = [
  "GuestSupportAttachment_pkey",
  "GuestSupportTicketAuditEvent_pkey",
  "GuestSupportTicketComment_pkey",
  "GuestSupportTicket_pkey",
  "GuestSupportTicket_ticketNumber_key",
  "guest_support_attachment_sha_idx",
  "guest_support_attachment_state_idx",
  "guest_support_attachment_ticket_idx",
  "guest_support_audit_actor_idx",
  "guest_support_audit_ticket_idx",
  "guest_support_comment_author_idx",
  "guest_support_comment_ticket_idx",
  "guest_support_ticket_assignee_status_idx",
  "guest_support_ticket_guest_idx",
  "guest_support_ticket_profile_idempotency_uidx",
  "guest_support_ticket_status_activity_idx",
  "guest_support_ticket_store_created_idx",
  "guest_support_ticket_tenant_id_uidx",
  "guest_support_ticket_topic_created_idx",
].sort();
const SUPPORT_CONSTRAINTS = [
  "GuestSupportAttachment_pkey",
  "GuestSupportAttachment_tenantId_fkey",
  "GuestSupportAttachment_tenantId_ticketId_fkey",
  "GuestSupportTicketAuditEvent_actorUserId_fkey",
  "GuestSupportTicketAuditEvent_pkey",
  "GuestSupportTicketAuditEvent_tenantId_fkey",
  "GuestSupportTicketAuditEvent_tenantId_ticketId_fkey",
  "GuestSupportTicketComment_authorUserId_fkey",
  "GuestSupportTicketComment_pkey",
  "GuestSupportTicketComment_tenantId_fkey",
  "GuestSupportTicketComment_tenantId_ticketId_fkey",
  "GuestSupportTicket_assignedToUserId_fkey",
  "GuestSupportTicket_pkey",
  "GuestSupportTicket_tenantId_fkey",
  "GuestSupportTicket_tenantId_guestId_fkey",
  "GuestSupportTicket_tenantId_profileId_fkey",
  "GuestSupportTicket_tenantId_storeId_fkey",
  "guest_support_attachment_content_type_chk",
  "guest_support_attachment_sha_chk",
  "guest_support_attachment_size_chk",
  "guest_support_attachment_state_chk",
  "guest_support_comment_body_length_chk",
  "guest_support_ticket_description_length_chk",
  "guest_support_ticket_idempotency_format_chk",
  "guest_support_ticket_kind_chk",
  "guest_support_ticket_number_format_chk",
  "guest_support_ticket_terminal_timestamps_chk",
  "guest_support_ticket_topic_chk",
].sort();

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

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lp-current188-upgrade-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function rowsFromLane(laneRoot) {
  const migrationsRoot = path.join(laneRoot, "migrations");
  return Promise.all(
    (await readdir(migrationsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .map(async (migrationName) => ({
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

function evidence(rows, overrides = {}) {
  const applied = rows.filter((row) => row.applied === true);
  return {
    identity: identity(),
    migrationCount: applied.length,
    migrationHead: applied.at(-1)?.migrationName ?? null,
    migrationManifestDigest: migrationDigest(applied),
    migrationRows: rows,
    rolledBackMigrationCount:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
    rolledBackMigrationManifestDigest:
      FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
    runningDigestRows: [],
    unfinishedMigrationCount: 0,
    ...overrides,
  };
}

function supportContract(overrides = {}) {
  return {
    constraintNames: SUPPORT_CONSTRAINTS,
    enumTypes: [
      {
        labels: ["PENDING", "AVAILABLE", "REJECTED"],
        name: "GuestSupportAttachmentState",
      },
      {
        labels: ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"],
        name: "GuestSupportTicketStatus",
      },
    ],
    indexNames: SUPPORT_INDEXES,
    migrationChecksum:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationSha256,
    publicTablePrivilegeCount: 0,
    publicWorkerExecuteCount: 0,
    tableNames: SUPPORT_TABLES,
    ...overrides,
  };
}

function bridgeSlotAttestation({ phase, releaseSha, slot, seed }) {
  const source = phase === "SOURCE_187";
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
    compatibilityMode: source ? "GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE" : null,
    compatibilityTargetMigration: source
      ? FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead
      : null,
    compatibilityTargetMigrationCount: source
      ? FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationCount
      : null,
    databaseMigration: source
      ? FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationHead
      : FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead,
    databaseMigrationCount: source
      ? FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationCount
      : FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationCount,
    hydratedManifestSha256: seed.repeat(64),
    hydratedSha256SumsSha256: seed.repeat(64),
    hydrationAttestationSha256: seed.repeat(64),
    releaseProvenanceMigration:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead,
    releaseProvenanceMigrationCount:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationCount,
    releaseProvenanceSha256: seed.repeat(64),
    releaseSha,
    runtimeEnvironmentSha256: seed.repeat(64),
    runtimeRole: "COMBINED",
    schemaBridgeMode: "ALLOW_CURRENT_187",
    sha256SumsSha256: seed.repeat(64),
    slot,
    slotEnvironmentSha256: seed.repeat(64),
    slotLinkReceiptSha256: seed.repeat(64),
    symlinkManifestSha256: seed.repeat(64),
    targetMigrationSha256:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationSha256,
    upstreamTarget: `/etc/nginx/leetplus/upstreams/${slot}.conf`,
    upstreamTargetSha256: seed.repeat(64),
    webBaseUrl: `http://127.0.0.1:${blue ? 3100 : 3200}`,
    webBuildId: releaseSha,
    webInvocationId: seed.repeat(32),
    webUnit: `leetplus-web@${slot}.service`,
    webUnitFileSha256: seed.repeat(64),
  };
}

function bridgeAttestation(phase = "SOURCE_187", overrides = {}) {
  const releaseSha = "c".repeat(40);
  return {
    acceptedAt: "2026-08-28T13:58:00.000000000Z",
    active: bridgeSlotAttestation({
      phase,
      releaseSha,
      seed: "1",
      slot: "green",
    }),
    bridgeContract: "GUEST_SUPPORT_CURRENT187_DUAL_BRIDGE_CUTOVER_V2",
    cutoverGeneration: 4,
    cutoverReceiptName: `20260828T135800000000000Z-g4-${releaseSha}-green.receipt`,
    cutoverReceiptSha256: "4".repeat(64),
    latestReceiptConsumed: false,
    pendingIntentCount: 0,
    phase,
    productionControl: {
      attestationSha256: "5".repeat(64),
      installMapSha256: "6".repeat(64),
      receiptSha256: "7".repeat(64),
      releaseSha,
      rootManifestSha256: "8".repeat(64),
      verifierSha256: "9".repeat(64),
    },
    rollback: bridgeSlotAttestation({
      phase,
      releaseSha: "b".repeat(40),
      seed: "a",
      slot: "blue",
    }),
    topologyMode: "DUAL_BRIDGE_N_MINUS_ONE",
    ...overrides,
  };
}

function bridgeRuntimeAdapter() {
  let locks = 0;
  let source = bridgeAttestation("SOURCE_187");
  let target = bridgeAttestation("TARGET_188");
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

async function fixture(t) {
  const root = await temporaryRoot(t);
  const laneRoot = path.join(
    root,
    "leetplus-founder-production-history-current188-test",
  );
  const artifactPath = path.join(root, "release.tar.gz");
  const artifactBytes = Buffer.from("current188-release-artifact", "utf8");
  await writeFile(artifactPath, artifactBytes);
  const { materializeFounderPilotProductionHistoryLane } =
    await import("./founder-pilot-production-history-rehearsal.mjs");
  const lane = await materializeFounderPilotProductionHistoryLane({
    laneRoot,
    sourcePrismaRoot: PRISMA_ROOT,
    targetMigrationCount:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationCount,
    targetMigrationHead:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead,
  });
  const migrationRows = await rowsFromLane(laneRoot);
  const key = keys();
  const manifest = normalizeFounderPilotCurrent188ProductionUpgradeManifest({
    approval: {
      keyId: "current188-prod-a1",
      maxPlanAgeSeconds: 900,
      publicKeyPem: key.publicKeyPem,
      publicKeySpkiSha256: key.publicKeySpkiSha256,
    },
    contractVersion: "FOUNDER_PILOT_PRODUCTION_HISTORY_187_TO_188_V3",
    environment: "PRODUCTION",
    operation: { deployTimeoutSeconds: 600 },
    release: {
      artifactPath,
      artifactSha256: sha256(artifactBytes),
      materializedTreeDigest: lane.treeDigest,
      releaseSha: "c".repeat(40),
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
  return {
    bridge: bridgeRuntimeAdapter(),
    key,
    laneRoot,
    manifest,
    root,
    source: evidence(migrationRows.slice(0, -1)),
    target: evidence(migrationRows),
  };
}

function adapterWithState(initialState) {
  let state = initialState;
  let locks = 0;
  const adapter = {
    acquireLock: async () => {
      locks += 1;
    },
    inspectCurrent188SupportContract: async () => supportContract(),
    inspectFinal: async () => ({
      preterminalManifestDigest:
        FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetPreterminalManifestSha256,
      workerFunctionDigest:
        FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetWorkerFunctionSha256,
    }),
    inspectTarget: async () => state,
    releaseLock: async () => {
      locks -= 1;
    },
  };
  return {
    adapter,
    locks: () => locks,
    setState: (next) => {
      state = next;
    },
  };
}

async function buildPlan(value, adapter) {
  return buildFounderPilotCurrent188ProductionUpgradePlan({
    adapter,
    laneRoot: value.laneRoot,
    manifest: value.manifest,
    now: () => new Date(NOW),
    runtimeAdapter: value.bridge.adapter,
    sourcePrismaRoot: PRISMA_ROOT,
  });
}

function approval(value, plan) {
  return signFounderPilotCurrent188ProductionUpgradePlan({
    manifest: value.manifest,
    plan,
    privateKeyPem: value.key.privateKeyPem,
  });
}

function applyOptions(value, state, plan, deploy) {
  return {
    adapter: state.adapter,
    approval: approval(value, plan),
    confirmPlanDigest: plan.planDigest,
    deploy,
    laneRoot: value.laneRoot,
    manifest: value.manifest,
    now: () => new Date("2026-08-28T14:01:00.000Z"),
    onPhase: async () => undefined,
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
    productionConfirmation:
      FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONFIRMATION,
    runtimeAdapter: value.bridge.adapter,
    sourcePrismaRoot: PRISMA_ROOT,
  };
}

test("builds and signs an exact 187 to 188 plan", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  assert.equal(plan.sourceMigrationCount, 187);
  assert.equal(plan.targetMigrationCount, 188);
  assert.equal(plan.bridgeAttestation.phase, "SOURCE_187");
  assert.equal(plan.bridgeAttestation.cutoverGeneration, 4);
  assert.match(
    founderPilotCurrent188BridgeAttestationDigest(plan.bridgeAttestation, {
      expectedPhase: "SOURCE_187",
      expectedReleaseSha: "c".repeat(40),
    }),
    /^[0-9a-f]{64}$/u,
  );
  assert.equal(
    plan.targetMigrationSha256,
    "c40d5eeb84cc980053af48b56385bf48882ee355aec718a442dab855ea33eb9b",
  );
  const signed = approval(value, plan);
  const checked = verifyFounderPilotCurrent188ProductionUpgradeApproval({
    approval: signed,
    manifest: value.manifest,
    pinnedApprovalKeySpkiSha256: value.key.publicKeySpkiSha256,
    plan,
  });
  assert.match(checked.approvalDigest, /^[0-9a-f]{64}$/u);
});

test("refuses plan creation from a partial or already-final history", async (t) => {
  const value = await fixture(t);
  await assert.rejects(
    () => buildPlan(value, adapterWithState(value.target).adapter),
    { reasonCode: "CURRENT188_UPGRADE_SOURCE_STATE_MISMATCH" },
  );
  await assert.rejects(
    () =>
      buildPlan(
        value,
        adapterWithState({ ...value.source, unfinishedMigrationCount: 1 })
          .adapter,
      ),
    { reasonCode: "CURRENT188_UPGRADE_SOURCE_STATE_MISMATCH" },
  );
});

test("applies exactly once and verifies the support contract", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  let calls = 0;
  const result = await applyFounderPilotCurrent188ProductionUpgradePlan(
    applyOptions(value, state, plan, async () => {
      calls += 1;
      state.setState(value.target);
      return {
        exitCode: 0,
        stderrBytes: 0,
        stderrSha256: sha256(""),
        stdoutBytes: 0,
        stdoutSha256: sha256(""),
        status: "SUCCEEDED",
      };
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.decision, "CURRENT188_UPGRADE_APPLIED");
  assert.equal(result.migrationCount, 188);
  assert.equal(state.locks(), 0);
});

test("recovers an ambiguous response only from an exact final state", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  const result = await applyFounderPilotCurrent188ProductionUpgradePlan(
    applyOptions(value, state, plan, async () => {
      state.setState(value.target);
      return { status: "AMBIGUOUS" };
    }),
  );
  assert.equal(result.recoveredFromLostResponse, true);
  assert.equal(result.deploymentAttempt, 1);
});

test("retries one no-effect ambiguous response and never a partial state", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  let calls = 0;
  const result = await applyFounderPilotCurrent188ProductionUpgradePlan(
    applyOptions(value, state, plan, async () => {
      calls += 1;
      if (calls === 2) state.setState(value.target);
      return { status: calls === 1 ? "AMBIGUOUS" : "SUCCEEDED" };
    }),
  );
  assert.equal(calls, 2);
  assert.equal(result.deploymentAttempt, 2);

  const partialState = adapterWithState(value.source);
  const partialPlan = await buildPlan(value, partialState.adapter);
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, partialState, partialPlan, async () => {
          partialState.setState({
            ...value.source,
            unfinishedMigrationCount: 1,
          });
          return { status: "AMBIGUOUS" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_PRISMA_DEPLOY_AMBIGUOUS" },
  );
});

test("confirmation and signature pins fail before any effect", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan({
        ...applyOptions(value, state, plan, async () => {
          throw new Error("must not deploy");
        }),
        productionConfirmation: "wrong",
      }),
    { reasonCode: "CURRENT188_UPGRADE_PRODUCTION_CONFIRMATION_REQUIRED" },
  );
  assert.equal(state.locks(), 0);
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan({
        ...applyOptions(value, state, plan, async () => {
          throw new Error("must not deploy");
        }),
        pinnedApprovalKeySpkiSha256: "f".repeat(64),
      }),
    { reasonCode: "CURRENT188_UPGRADE_APPROVAL_INVALID" },
  );
  assert.equal(state.locks(), 0);
});

test("postcheck rejects catalog drift after a completed migration", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  state.adapter.inspectCurrent188SupportContract = async () =>
    supportContract({ indexNames: SUPPORT_INDEXES.slice(1) });
  const plan = await buildPlan(value, state.adapter);
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, state, plan, async () => {
          state.setState(value.target);
          return { status: "SUCCEEDED" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_FINAL_STATE_NOT_REACHED" },
  );
  assert.equal(state.locks(), 0);
});

test("bridge attestation is exact and rejects unsafe first-cutover states", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const exact = bridgeAttestation("SOURCE_187");
  assert.equal(
    normalizeFounderPilotCurrent188BridgeAttestation(exact, {
      expectedPhase: "SOURCE_187",
      expectedReleaseSha: "c".repeat(40),
    }).active.runtimeRole,
    "COMBINED",
  );
  assert.equal(exact.topologyMode, "DUAL_BRIDGE_N_MINUS_ONE");
  for (const unsafe of [
    { ...exact, active: { ...exact.active, bugReportingMode: "LIVE" } },
    { ...exact, rollback: { ...exact.rollback, schemaBridgeMode: "OFF" } },
    { ...exact, rollback: { ...exact.rollback, runtimeRole: "GUEST" } },
    { ...exact, pendingIntentCount: 1 },
    { ...exact, latestReceiptConsumed: true },
    { ...exact, active: { ...exact.active, releaseSha: "d".repeat(40) } },
    {
      ...exact,
      rollback: { ...exact.rollback, databaseMigrationCount: 188 },
    },
    {
      ...exact,
      active: { ...exact.active, targetMigrationSha256: "d".repeat(64) },
    },
    {
      ...exact,
      rollback: {
        ...exact.rollback,
        authenticatedSmokeUsersCatalog: "",
      },
    },
    {
      ...exact,
      productionControl: {
        ...exact.productionControl,
        releaseSha: "d".repeat(40),
      },
    },
    { ...exact, cutoverReceiptName: "forged.receipt" },
  ]) {
    value.bridge.setSource(unsafe);
    await assert.rejects(() => buildPlan(value, state.adapter), {
      reasonCode: "CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID",
    });
    assert.equal(value.bridge.locks(), 0);
  }
});

test("production bridge adapter has no unprivileged or non-Linux fallback", () => {
  assert.deepEqual(
    [...FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.bridgeAuthorityLockPaths],
    [
      "/run/leetplus-production-control/install.lock",
      "/var/lib/leetplus/deploy-receipts/cutover.lock",
    ],
  );
  if (
    process.platform !== "linux" ||
    typeof process.geteuid !== "function" ||
    process.geteuid() !== 0
  ) {
    assert.throws(
      () =>
        createFounderPilotCurrent188ProductionBridgeRuntimeAdapter({
          releaseSha: "c".repeat(40),
        }),
      { reasonCode: "CURRENT188_UPGRADE_BRIDGE_RUNTIME_AUTHORITY_REQUIRED" },
    );
  }
});

test("apply refuses bridge drift after approval before any database effect", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  value.bridge.setSource(
    bridgeAttestation("SOURCE_187", {
      cutoverGeneration: 5,
      cutoverReceiptName: `20260828T135900000000000Z-g5-${"c".repeat(40)}-green.receipt`,
      cutoverReceiptSha256: "8".repeat(64),
    }),
  );
  let deployCalls = 0;
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, state, plan, async () => {
          deployCalls += 1;
          return { status: "SUCCEEDED" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_BRIDGE_ATTESTATION_MISMATCH" },
  );
  assert.equal(deployCalls, 0);
  assert.equal(state.locks(), 0);
  assert.equal(value.bridge.locks(), 0);
});

test("apply refuses rollback-slot drift after approval before any database effect", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  const exact = bridgeAttestation("SOURCE_187");
  let deployCalls = 0;
  for (const rollbackDrift of [
    { hydrationAttestationSha256: "d".repeat(64) },
    { slotLinkReceiptSha256: "d".repeat(64) },
    { webUnitFileSha256: "d".repeat(64) },
    { runtimeEnvironmentSha256: "d".repeat(64) },
    { webInvocationId: "e".repeat(32) },
    { authenticatedSmokeUsersCatalog: "CURRENT_DRIFT" },
  ]) {
    value.bridge.setSource({
      ...exact,
      rollback: { ...exact.rollback, ...rollbackDrift },
    });
    await assert.rejects(
      () =>
        applyFounderPilotCurrent188ProductionUpgradePlan(
          applyOptions(value, state, plan, async () => {
            deployCalls += 1;
            return { status: "SUCCEEDED" };
          }),
        ),
      { reasonCode: "CURRENT188_UPGRADE_BRIDGE_ATTESTATION_MISMATCH" },
    );
    assert.equal(state.locks(), 0);
    assert.equal(value.bridge.locks(), 0);
  }
  assert.equal(deployCalls, 0);
});

test("post-migration verification requires the same accepted bridge cutover", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  value.bridge.setTarget(
    bridgeAttestation("TARGET_188", {
      cutoverReceiptSha256: "9".repeat(64),
    }),
  );
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, state, plan, async () => {
          state.setState(value.target);
          return { status: "SUCCEEDED" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH" },
  );
  assert.equal(state.locks(), 0);
  assert.equal(value.bridge.locks(), 0);
});

test("post-migration verification requires the same rollback-slot authority", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  const target = bridgeAttestation("TARGET_188");
  value.bridge.setTarget({
    ...target,
    rollback: {
      ...target.rollback,
      authenticatedSmokeSha256: "d".repeat(64),
    },
  });
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, state, plan, async () => {
          state.setState(value.target);
          return { status: "SUCCEEDED" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH" },
  );
  assert.equal(state.locks(), 0);
  assert.equal(value.bridge.locks(), 0);
});

test("post-migration verification rejects a changed production-control generation", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  const target = bridgeAttestation("TARGET_188");
  value.bridge.setTarget({
    ...target,
    productionControl: {
      ...target.productionControl,
      receiptSha256: "d".repeat(64),
    },
  });
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, state, plan, async () => {
          state.setState(value.target);
          return { status: "SUCCEEDED" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_BRIDGE_TARGET_STATE_MISMATCH" },
  );
  assert.equal(state.locks(), 0);
  assert.equal(value.bridge.locks(), 0);
});

test("post-migration verification cannot succeed while one slot remains on CURRENT_187", async (t) => {
  const value = await fixture(t);
  const state = adapterWithState(value.source);
  const plan = await buildPlan(value, state.adapter);
  const target = bridgeAttestation("TARGET_188");
  value.bridge.setTarget({
    ...target,
    rollback: {
      ...target.rollback,
      compatibilityMode: "GUEST_SUPPORT_SCHEMA_FORWARD_BRIDGE",
      compatibilityTargetMigration:
        FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationHead,
      compatibilityTargetMigrationCount:
        FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.targetMigrationCount,
      databaseMigration:
        FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationHead,
      databaseMigrationCount:
        FOUNDER_PILOT_CURRENT188_PRODUCTION_UPGRADE_CONSTANTS.sourceMigrationCount,
    },
  });
  await assert.rejects(
    () =>
      applyFounderPilotCurrent188ProductionUpgradePlan(
        applyOptions(value, state, plan, async () => {
          state.setState(value.target);
          return { status: "SUCCEEDED" };
        }),
      ),
    { reasonCode: "CURRENT188_UPGRADE_BRIDGE_ATTESTATION_INVALID" },
  );
  assert.equal(state.locks(), 0);
  assert.equal(value.bridge.locks(), 0);
});

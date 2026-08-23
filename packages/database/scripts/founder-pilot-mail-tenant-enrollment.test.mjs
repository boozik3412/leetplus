import assert from "node:assert/strict";
import test from "node:test";

import {
  FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY,
  createFounderPilotMailTenantEnrollmentAdapterForTestOnly,
  expectedFounderPilotMailTenantEnrollmentConfirmation,
  runFounderPilotMailTenantEnrollment,
} from "./founder-pilot-mail-tenant-enrollment.mjs";
import {
  IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS,
  IDENTITY_MAIL_WORKER_FUNCTIONS,
} from "./identity-mail-worker-enrollment.mjs";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
} from "./staff-task-integrity-migration-state.mjs";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_OID = 42_001n;
const RELEASE_SHA = "a".repeat(40);
const PROVIDER_AUTHORITY_DIGEST = "b".repeat(64);
const NOW = new Date("2026-08-18T10:00:00.000Z");

function functionState(entry, allowed) {
  return {
    ...entry,
    actualLanguage: entry.language,
    actualSecurityDefiner: entry.securityDefiner,
    actualVolatility: entry.volatility,
    configuration: ["search_path=pg_catalog"],
    directExecute: allowed,
    directGrantOption: false,
    effectiveExecute: allowed,
    exists: true,
    ownerName: "owner_role",
    publicExecute: false,
  };
}

function workerSnapshot() {
  return {
    allowedFunctions: IDENTITY_MAIL_WORKER_FUNCTIONS.map((entry) =>
      functionState(entry, true),
    ),
    deniedFunctions: IDENTITY_MAIL_WORKER_DENIED_FUNCTIONS.map((entry) =>
      functionState(entry, false),
    ),
    enrollment: { enabledCount: 0, totalCount: 0 },
    migration: {
      completedCount: CURRENT_EXPECTED_MIGRATION_COUNT,
      completedTargetCount: 1,
      latestCompletedMigration: CURRENT_EXPECTED_LATEST_MIGRATION,
      unfinishedCount: 0,
    },
    role: {
      bypassesRls: false,
      canLogin: true,
      createsDatabase: false,
      createsRole: false,
      databaseConnect: true,
      databaseCreate: false,
      databaseTemporary: false,
      directColumnPrivilegeCount: 0,
      directFunctionExecuteCount: IDENTITY_MAIL_WORKER_FUNCTIONS.length,
      directRelationPrivilegeCount: 0,
      directSchemaCreateCount: 0,
      directSequencePrivilegeCount: 0,
      effectiveColumnPrivilegeCount: 0,
      effectiveFunctionExecuteCount: IDENTITY_MAIL_WORKER_FUNCTIONS.length,
      effectiveRelationPrivilegeCount: 0,
      effectiveSchemaUsageCount: 1,
      effectiveSequencePrivilegeCount: 0,
      hasRoleConfiguration: false,
      inherits: false,
      liveActivationBindingCount: 0,
      liveMarkerBindingCount: 0,
      membershipCount: 0,
      oid: ROLE_OID,
      ownershipCount: 0,
      publicSchemaCreate: false,
      publicSchemaUsage: true,
      replication: false,
      roleSettingCount: 0,
      superuser: false,
    },
    server: {
      currentUserName: "owner_role",
      currentUserOid: 10n,
      databaseName: "leetplus_prod",
      databaseOwnerName: "owner_role",
      databaseOwnerOid: 10n,
      serverVersionNumber: 160_015,
      sessionUserName: "owner_role",
      sessionUserOid: 10n,
      tlsActive: false,
      tlsCipher: null,
      tlsVersion: null,
    },
  };
}

function state() {
  return {
    activation: {
      environment: "production",
      inviteAcceptedAt: null,
      inviteExpiresAt: new Date("2026-08-25T10:00:00.000Z"),
      inviteRevokedAt: null,
      outboxHasCiphertext: true,
      outboxReleasedAt: NOW,
      outboxStatus: "PENDING",
      outboxTerminalAt: null,
      releaseSha: RELEASE_SHA,
      tenantId: TENANT_ID,
    },
    claimedOutboxCount: 0,
    databaseNow: NOW,
    enrollment: null,
    tenant: {
      customerStage: "PILOT",
      id: TENANT_ID,
      onboardingStatus: "OWNER_INVITED",
      status: "ACTIVE",
      trialEndsAt: new Date("2026-09-17T10:00:00.000Z"),
      trialStartsAt: NOW,
    },
    worker: workerSnapshot(),
  };
}

function request(mode, operationId = "22222222-2222-4222-8222-222222222222") {
  const value = {
    confirmation: null,
    databaseName: "leetplus_prod",
    environment: "production",
    mode,
    operationId,
    providerAuthorityDigest: PROVIDER_AUTHORITY_DIGEST,
    releaseSha: RELEASE_SHA,
    roleName: "identity_mail_worker",
    roleOid: ROLE_OID.toString(),
    tenantId: TENANT_ID,
    transportPolicy: "LOOPBACK_PLAINTEXT",
  };
  if (["apply", "disable"].includes(mode)) {
    value.confirmation =
      expectedFounderPilotMailTenantEnrollmentConfirmation(value);
  }
  return value;
}

function fakeAdapter(initial = state(), options = {}) {
  const current = structuredClone(initial);
  let transactions = 0;
  const adapter = createFounderPilotMailTenantEnrollmentAdapterForTestOnly(
    async (_request, callback) => {
      transactions += 1;
      const result = await callback({
        apply: async (target) => {
          current.enrollment = {
            ...FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY,
            disabledAt: null,
            enabled: true,
            enabledAt: NOW,
            policyRevision: 1,
            providerAuthorityDigest: target.providerAuthorityDigest,
            tenantId: target.tenantId,
            workerRoleName: target.roleName,
            workerRoleOid: target.roleOid,
          };
          return 1;
        },
        disable: async (_target, enrollment) => {
          current.enrollment = {
            ...current.enrollment,
            disabledAt: NOW,
            enabled: false,
            policyRevision: enrollment.policyRevision + 1,
          };
          return 1;
        },
        inspect: async () => structuredClone(current),
      });
      if (options.loseFirstResponse === true && transactions === 1) {
        throw new Error("connection ended after COMMIT");
      }
      return result;
    },
  );
  return { adapter, current, transactions: () => transactions };
}

test("plan is PII-free, deterministic and mutation-free", async () => {
  const fixture = fakeAdapter();
  const result = await runFounderPilotMailTenantEnrollment({
    adapter: fixture.adapter,
    request: request("plan"),
  });
  assert.equal(result.decision, "READY_TO_APPLY");
  assert.match(result.planDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.receiptDigest, /^[0-9a-f]{64}$/u);
  assert.equal(fixture.current.enrollment, null);
  assert.doesNotMatch(JSON.stringify(result), /email|token|ciphertext/iu);
});

test("apply, check and disable preserve the exact tenant/role binding", async () => {
  const fixture = fakeAdapter();
  const applied = await runFounderPilotMailTenantEnrollment({
    adapter: fixture.adapter,
    request: request("apply"),
  });
  assert.equal(applied.decision, "ACTIVE");
  assert.equal(applied.policyRevision, 1);

  const checked = await runFounderPilotMailTenantEnrollment({
    adapter: fixture.adapter,
    request: request("check", "33333333-3333-4333-8333-333333333333"),
  });
  assert.equal(checked.decision, "ACTIVE");

  const disabled = await runFounderPilotMailTenantEnrollment({
    adapter: fixture.adapter,
    request: request("disable", "44444444-4444-4444-8444-444444444444"),
  });
  assert.equal(disabled.decision, "DISABLED");
  assert.equal(disabled.policyRevision, 2);
  assert.equal(fixture.current.enrollment.tenantId, TENANT_ID);
});

test("lost apply response is reconciled from fresh exact state", async () => {
  const fixture = fakeAdapter(state(), { loseFirstResponse: true });
  const result = await runFounderPilotMailTenantEnrollment({
    adapter: fixture.adapter,
    request: request("apply"),
  });
  assert.equal(result.decision, "ACTIVE");
  assert.equal(result.reconciledAfterLostResponse, true);
  assert.equal(result.replayed, true);
  assert.equal(fixture.transactions(), 2);
});

test("wrong confirmation fails before the adapter is called", async () => {
  const fixture = fakeAdapter();
  await assert.rejects(
    runFounderPilotMailTenantEnrollment({
      adapter: fixture.adapter,
      request: { ...request("apply"), confirmation: "wrong" },
    }),
    { reasonCode: "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONFIRMATION_INVALID" },
  );
  assert.equal(fixture.transactions(), 0);
});

test("release drift and cross-tenant substitution fail closed", async () => {
  const releaseDrift = state();
  releaseDrift.activation.releaseSha = "c".repeat(40);
  await assert.rejects(
    runFounderPilotMailTenantEnrollment({
      adapter: fakeAdapter(releaseDrift).adapter,
      request: request("plan"),
    }),
    {
      reasonCode:
        "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ACTIVATION_STATE_INVALID",
    },
  );

  const tenantDrift = state();
  tenantDrift.activation.tenantId = "55555555-5555-4555-8555-555555555555";
  await assert.rejects(
    runFounderPilotMailTenantEnrollment({
      adapter: fakeAdapter(tenantDrift).adapter,
      request: request("plan"),
    }),
    {
      reasonCode:
        "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ACTIVATION_STATE_INVALID",
    },
  );
});

test("worker grant drift and claimed delivery block mutation", async () => {
  const grantDrift = state();
  grantDrift.worker.role.effectiveFunctionExecuteCount = 6;
  await assert.rejects(
    runFounderPilotMailTenantEnrollment({
      adapter: fakeAdapter(grantDrift).adapter,
      request: request("plan"),
    }),
    {
      reasonCode: "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_WORKER_NOT_COMPLIANT",
      violationCodes: ["EFFECTIVE_FUNCTION_ALLOWLIST_MISMATCH"],
    },
  );

  const claimed = state();
  claimed.claimedOutboxCount = 1;
  await assert.rejects(
    runFounderPilotMailTenantEnrollment({
      adapter: fakeAdapter(claimed).adapter,
      request: request("apply"),
    }),
    { reasonCode: "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_OUTBOX_CLAIMED" },
  );
});

test("plain or cloned adapters are rejected", async () => {
  await assert.rejects(
    runFounderPilotMailTenantEnrollment({
      adapter: { transaction: async () => undefined },
      request: request("plan"),
    }),
    { reasonCode: "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ADAPTER_INVALID" },
  );
});

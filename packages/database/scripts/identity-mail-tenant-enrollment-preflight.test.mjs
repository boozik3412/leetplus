import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT } from "./identity-mail-tenant-enrollment-contract.mjs";
import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_CONTRACT,
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DEFERRED_CONTROLS,
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_FINDINGS,
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION,
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT,
  IdentityMailTenantEnrollmentPreflightError,
  evaluateIdentityMailTenantEnrollmentPreflight,
  identityMailTenantEnrollmentPreflightProhibitedDataFindings,
  mapIdentityMailTenantEnrollmentLegacyState,
} from "./identity-mail-tenant-enrollment-preflight.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PREFLIGHT_PATH = join(
  SCRIPT_DIR,
  "identity-mail-tenant-enrollment-preflight.mjs",
);
const NOW = new Date("2026-08-01T09:00:00.000Z");
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const DATABASE_NAME = "leetplus_beta";
const DATABASE_OID = 16_384;
const WORKER_ROLE_NAME = "identity_mail_worker_v1";
const WORKER_ROLE_OID = 16_385;
const MARKER_DIGEST = "1".repeat(64);
const PROVIDER_DIGEST = "2".repeat(64);
const RELEASE_SHA = "3".repeat(40);
const RUNTIME_DIGEST = "4".repeat(64);

function policy(overrides = {}) {
  return {
    acknowledgeSeconds: 120,
    baseRetrySeconds: 60,
    leaseSeconds: 120,
    maxAttempts: 5,
    maxRetrySeconds: 3_600,
    ...overrides,
  };
}

function proposal(overrides = {}) {
  const base = {
    action: "ENABLE",
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT,
    deploymentMarkerDigest: MARKER_DIGEST,
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: DATABASE_OID,
    expectedRevision: 0,
    expectedState: "ABSENT",
    expiresAt: "2026-08-01T09:10:00.000Z",
    nextRevision: 1,
    policy: policy(),
    providerAuthorityDigest: PROVIDER_DIGEST,
    releaseSha: RELEASE_SHA,
    requestId: "11111111-1111-4111-8111-111111111111",
    requestedAt: "2026-08-01T08:59:00.000Z",
    runtimeConfigDigest: RUNTIME_DIGEST,
    tenantId: TENANT_ID,
    workerRoleName: WORKER_ROLE_NAME,
    workerRoleOid: WORKER_ROLE_OID,
  };
  return {
    ...base,
    ...overrides,
    policy: overrides.policy ?? base.policy,
  };
}

function compliantWorkerRole(overrides = {}) {
  return {
    bypassesRls: false,
    canLogin: true,
    createsDatabase: false,
    createsRole: false,
    databaseConnect: true,
    databaseCreate: false,
    databaseTemporary: false,
    deniedFunctionExecuteCount: 0,
    directColumnPrivilegeCount: 0,
    directFunctionExecuteCount: 5,
    directRelationPrivilegeCount: 0,
    directSchemaCreateCount: 0,
    directSequencePrivilegeCount: 0,
    effectiveColumnPrivilegeCount: 0,
    effectiveFunctionExecuteCount: 5,
    effectiveRelationPrivilegeCount: 0,
    effectiveSchemaUsageCount: 1,
    effectiveSequencePrivilegeCount: 0,
    functionCatalogViolationCount: 0,
    grantOptionFunctionCount: 0,
    hasRoleConfiguration: false,
    inherits: false,
    liveActivationBindingCount: 0,
    liveMarkerBindingCount: 0,
    membershipCount: 0,
    name: WORKER_ROLE_NAME,
    oid: WORKER_ROLE_OID,
    ownedObjectCount: 0,
    publicExecuteFunctionCount: 0,
    publicSchemaCreate: false,
    publicSchemaUsage: true,
    replication: false,
    roleSettingCount: 0,
    superuser: false,
    ...overrides,
  };
}

function activeEnrollment(overrides = {}) {
  return {
    acknowledgeSeconds: 120,
    baseRetrySeconds: 60,
    disabledAt: null,
    enabled: true,
    enabledAt: "2026-08-01T08:00:00.000Z",
    leaseSeconds: 120,
    maxAttempts: 5,
    maxRetrySeconds: 3_600,
    policyRevision: 7,
    providerAuthorityDigest: PROVIDER_DIGEST,
    tenantId: TENANT_ID,
    workerRoleName: WORKER_ROLE_NAME,
    workerRoleOid: WORKER_ROLE_OID,
    ...overrides,
  };
}

function logicalSnapshot(overrides = {}) {
  const base = {
    database: {
      migrationCount: IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT,
      migrationHead: IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION,
      name: DATABASE_NAME,
      oid: DATABASE_OID,
      postgresMajor: 16,
      unfinishedMigrationCount: 0,
    },
    drain: {
      claimedCount: 0,
      markedClaimedCount: 0,
      unmarkedClaimedCount: 0,
    },
    enrollment: null,
    marker: {
      actualContextMatches: true,
      buildBindingMatches: true,
      challengeBindingMatches: true,
      current: true,
      databaseIdentityMatches: true,
      migrationCount: IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT,
      migrationHead: IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION,
      payloadDigest: MARKER_DIGEST,
      payloadDigestMatches: true,
      releaseSha: RELEASE_SHA,
      revokedAt: null,
      stateRevision: 1,
      validAtSnapshot: true,
      validUntil: "2026-08-01T10:00:00.000Z",
    },
    providerAuthorityDigest: PROVIDER_DIGEST,
    targetPolicy: policy(),
    tenant: { exists: true, id: TENANT_ID },
    transaction: { isolation: "REPEATABLE_READ", readOnly: true },
    workerRole: compliantWorkerRole(),
  };
  return {
    ...base,
    ...overrides,
    database: { ...base.database, ...(overrides.database ?? {}) },
    drain: { ...base.drain, ...(overrides.drain ?? {}) },
    enrollment: Object.hasOwn(overrides, "enrollment")
      ? overrides.enrollment
      : base.enrollment,
    marker: Object.hasOwn(overrides, "marker")
      ? overrides.marker === null
        ? null
        : { ...base.marker, ...overrides.marker }
      : base.marker,
    targetPolicy: {
      ...base.targetPolicy,
      ...(overrides.targetPolicy ?? {}),
    },
    tenant: { ...base.tenant, ...(overrides.tenant ?? {}) },
    transaction: {
      ...base.transaction,
      ...(overrides.transaction ?? {}),
    },
    workerRole: Object.hasOwn(overrides, "workerRole")
      ? overrides.workerRole === null
        ? null
        : { ...base.workerRole, ...overrides.workerRole }
      : base.workerRole,
  };
}

function evaluate(proposalInput = proposal(), snapshot = logicalSnapshot()) {
  return evaluateIdentityMailTenantEnrollmentPreflight(
    proposalInput,
    snapshot,
    { now: NOW },
  );
}

function reverseRecords(value) {
  if (Array.isArray(value)) return value.map((item) => reverseRecords(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, reverseRecords(entry)]),
  );
}

test("returns one immutable deterministic non-authorizing MATCHED report", () => {
  const report = evaluate();
  assert.equal(
    report.contract,
    IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_CONTRACT,
  );
  assert.equal(report.inspectionDecision, "MATCHED");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(
    report.deferredControls,
    IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DEFERRED_CONTROLS,
  );
  assert.equal(report.runtimeConfigDigestEvaluation, "DEFERRED");
  assert.equal(report.proposal.runtimeConfigDigest, RUNTIME_DIGEST);
  assert.equal(report.observed.enrollment.state, "ABSENT");
  assert.equal(report.observed.enrollment.revision, 0);
  assert.equal(report.drainRequired, false);
  assert.equal(report.drainComplete, null);
  assert.match(report.snapshotDigest, /^[0-9a-f]{64}$/u);
  assert.match(report.reportDigest, /^[0-9a-f]{64}$/u);
  const { reportDigest, ...digestPayload } = report;
  assert.equal(
    reportDigest,
    createHash("sha256")
      .update(JSON.stringify(digestPayload), "utf8")
      .digest("hex"),
  );
  assert(Object.isFrozen(report));
  assert(Object.isFrozen(report.observed));
  assert(Object.isFrozen(report.proposal.policy));
  assert.throws(() => report.findings.push("MUTATED"), TypeError);
});

test("normalization makes report and snapshot digests independent of key order", () => {
  const canonical = evaluate();
  const reordered = evaluate(
    reverseRecords(proposal()),
    reverseRecords(logicalSnapshot()),
  );
  assert.deepEqual(reordered, canonical);
  assert.equal(reordered.reportDigest, canonical.reportDigest);
  assert.equal(reordered.snapshotDigest, canonical.snapshotDigest);
});

test("maps only valid legacy enrollment shapes", () => {
  assert.equal(mapIdentityMailTenantEnrollmentLegacyState(null), "ABSENT");
  assert.equal(
    mapIdentityMailTenantEnrollmentLegacyState(activeEnrollment()),
    "ACTIVE",
  );
  assert.equal(
    mapIdentityMailTenantEnrollmentLegacyState(
      activeEnrollment({ enabled: false, enabledAt: null }),
    ),
    "DISABLED",
  );
  assert.equal(
    mapIdentityMailTenantEnrollmentLegacyState(
      activeEnrollment({
        disabledAt: "2026-08-01T08:30:00.000Z",
        enabled: false,
      }),
    ),
    "DISABLED",
  );
  const invalid = [
    undefined,
    {},
    activeEnrollment({ enabled: true, enabledAt: null }),
    activeEnrollment({
      disabledAt: "2026-08-01T07:59:59.999Z",
      enabled: false,
    }),
    activeEnrollment({ disabledAt: null, enabled: false }),
    activeEnrollment({ disabledAt: "invalid", enabled: false }),
  ];
  for (const row of invalid) {
    assert.equal(mapIdentityMailTenantEnrollmentLegacyState(row), "INVALID");
  }

  let getterCalls = 0;
  const accessor = activeEnrollment();
  Object.defineProperty(accessor, "enabled", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  assert.equal(mapIdentityMailTenantEnrollmentLegacyState(accessor), "INVALID");
  assert.equal(getterCalls, 0);
});

test("supports ENABLE from DISABLED, ROTATE with drain, and exact DISABLE", () => {
  const disabledRow = activeEnrollment({
    disabledAt: "2026-08-01T08:30:00.000Z",
    enabled: false,
    policyRevision: 4,
    providerAuthorityDigest: "a".repeat(64),
    workerRoleName: "old_identity_mail_worker",
    workerRoleOid: 16_386,
  });
  const enabled = evaluate(
    proposal({
      expectedRevision: 4,
      expectedState: "DISABLED",
      nextRevision: 5,
    }),
    logicalSnapshot({ enrollment: disabledRow }),
  );
  assert.equal(enabled.inspectionDecision, "MATCHED");

  const rotatedPolicy = policy({ maxAttempts: 6 });
  const rotate = evaluate(
    proposal({
      action: "ROTATE",
      expectedRevision: 7,
      expectedState: "ACTIVE",
      nextRevision: 8,
      policy: rotatedPolicy,
      providerAuthorityDigest: "b".repeat(64),
    }),
    logicalSnapshot({
      drain: {
        claimedCount: 2,
        markedClaimedCount: 1,
        unmarkedClaimedCount: 1,
      },
      enrollment: activeEnrollment(),
      providerAuthorityDigest: "b".repeat(64),
      targetPolicy: rotatedPolicy,
    }),
  );
  assert.equal(rotate.inspectionDecision, "MATCHED");
  assert.equal(rotate.drainRequired, true);
  assert.equal(rotate.drainComplete, false);

  const disable = evaluate(
    proposal({
      action: "DISABLE",
      expectedRevision: 7,
      expectedState: "ACTIVE",
      nextRevision: 8,
    }),
    logicalSnapshot({ enrollment: activeEnrollment() }),
  );
  assert.equal(disable.inspectionDecision, "MATCHED");
  assert.equal(disable.drainRequired, true);
  assert.equal(disable.drainComplete, true);
});

test("reports exact database, migration, marker, authority and policy drift", () => {
  const report = evaluate(
    proposal(),
    logicalSnapshot({
      database: {
        migrationCount: 178,
        migrationHead: "20260731110000_guest_game_case_reward_contract",
        name: "leetplus_other",
        oid: 16_390,
        postgresMajor: 15,
        unfinishedMigrationCount: 1,
      },
      marker: {
        actualContextMatches: false,
        buildBindingMatches: false,
        challengeBindingMatches: false,
        current: false,
        databaseIdentityMatches: false,
        migrationCount: 178,
        migrationHead: "20260731110000_guest_game_case_reward_contract",
        payloadDigest: "5".repeat(64),
        payloadDigestMatches: false,
        releaseSha: "6".repeat(40),
        revokedAt: "2026-08-01T08:30:00.000Z",
        stateRevision: 2,
        validAtSnapshot: false,
        validUntil: "2026-08-01T09:00:00.000Z",
      },
      providerAuthorityDigest: "7".repeat(64),
      targetPolicy: { maxAttempts: 6 },
      transaction: { isolation: "READ_COMMITTED", readOnly: false },
    }),
  );
  assert.equal(report.inspectionDecision, "BLOCKED");
  assert.deepEqual(report.findings, [...report.findings].sort());
  const expected = [
    "DATABASE_NAME_MISMATCH",
    "DATABASE_OID_MISMATCH",
    "MARKER_ACTUAL_CONTEXT_INVALID",
    "MARKER_BUILD_BINDING_INVALID",
    "MARKER_CHALLENGE_BINDING_INVALID",
    "MARKER_DATABASE_IDENTITY_INVALID",
    "MARKER_DIGEST_MISMATCH",
    "MARKER_EXPIRED",
    "MARKER_MIGRATION_COUNT_MISMATCH",
    "MARKER_MIGRATION_HEAD_MISMATCH",
    "MARKER_NOT_CURRENT",
    "MARKER_PAYLOAD_DIGEST_INVALID",
    "MARKER_RELEASE_SHA_MISMATCH",
    "MARKER_REVOKED",
    "MARKER_STATE_REVISION_MISMATCH",
    "MIGRATION_COUNT_MISMATCH",
    "MIGRATION_HEAD_MISMATCH",
    "POSTGRESQL_MAJOR_MISMATCH",
    "PROVIDER_AUTHORITY_DIGEST_MISMATCH",
    "TARGET_POLICY_MISMATCH",
    "TRANSACTION_ISOLATION_MISMATCH",
    "TRANSACTION_NOT_READ_ONLY",
    "UNFINISHED_MIGRATION_PRESENT",
  ];
  for (const finding of expected) assert(report.findings.includes(finding));
});

test("missing marker and every hostile worker boundary fail closed", () => {
  const missing = evaluate(proposal(), logicalSnapshot({ marker: null }));
  assert.deepEqual(missing.findings, ["CURRENT_MARKER_MISSING"]);

  const hostile = evaluate(
    proposal(),
    logicalSnapshot({
      workerRole: compliantWorkerRole({
        bypassesRls: true,
        canLogin: false,
        databaseConnect: false,
        databaseCreate: true,
        deniedFunctionExecuteCount: 1,
        directColumnPrivilegeCount: 1,
        directFunctionExecuteCount: 6,
        directRelationPrivilegeCount: 1,
        directSchemaCreateCount: 1,
        directSequencePrivilegeCount: 1,
        effectiveColumnPrivilegeCount: 1,
        effectiveFunctionExecuteCount: 6,
        effectiveRelationPrivilegeCount: 1,
        effectiveSchemaUsageCount: 2,
        effectiveSequencePrivilegeCount: 1,
        functionCatalogViolationCount: 1,
        grantOptionFunctionCount: 1,
        inherits: true,
        liveActivationBindingCount: 1,
        membershipCount: 1,
        name: "different_worker_role",
        oid: 16_399,
        publicExecuteFunctionCount: 1,
        publicSchemaCreate: true,
        publicSchemaUsage: false,
        superuser: true,
      }),
    }),
  );
  assert.deepEqual(hostile.findings, [
    "WORKER_ROLE_ACTIVATION_BINDING_PRESENT",
    "WORKER_ROLE_ATTRIBUTES_UNSAFE",
    "WORKER_ROLE_CATALOG_INVALID",
    "WORKER_ROLE_COLUMN_PRIVILEGES_UNSAFE",
    "WORKER_ROLE_DATABASE_PRIVILEGES_UNSAFE",
    "WORKER_ROLE_FUNCTION_PRIVILEGES_UNSAFE",
    "WORKER_ROLE_NAME_MISMATCH",
    "WORKER_ROLE_OID_MISMATCH",
    "WORKER_ROLE_RELATION_PRIVILEGES_UNSAFE",
    "WORKER_ROLE_SCHEMA_PRIVILEGES_UNSAFE",
    "WORKER_ROLE_SEQUENCE_PRIVILEGES_UNSAFE",
  ]);
  assert.deepEqual(
    evaluate(proposal(), logicalSnapshot({ workerRole: null })).findings,
    ["WORKER_ROLE_MISSING"],
  );
});

test("tenant, legacy state, revision and action-specific current bindings are exact", () => {
  const wrong = evaluate(
    proposal({
      action: "DISABLE",
      expectedRevision: 7,
      expectedState: "ACTIVE",
      nextRevision: 8,
    }),
    logicalSnapshot({
      enrollment: activeEnrollment({
        maxAttempts: 6,
        policyRevision: 8,
        providerAuthorityDigest: "8".repeat(64),
        tenantId: "33333333-3333-4333-8333-333333333333",
        workerRoleName: "different_worker_role",
        workerRoleOid: 16_390,
      }),
      tenant: {
        exists: true,
        id: "44444444-4444-4444-8444-444444444444",
      },
    }),
  );
  assert.deepEqual(wrong.findings, [
    "CURRENT_AUTHORITY_MISMATCH",
    "CURRENT_POLICY_MISMATCH",
    "CURRENT_ROLE_BINDING_MISMATCH",
    "ENROLLMENT_REVISION_MISMATCH",
    "ENROLLMENT_TENANT_MISMATCH",
    "TENANT_ID_MISMATCH",
  ]);

  const invalidState = evaluate(
    proposal({
      expectedRevision: 7,
      expectedState: "DISABLED",
      nextRevision: 8,
    }),
    logicalSnapshot({
      enrollment: activeEnrollment({ enabled: false, disabledAt: null }),
    }),
  );
  assert(invalidState.findings.includes("ENROLLMENT_STATE_INVALID"));
  assert.equal(
    invalidState.findings.includes("ENROLLMENT_STATE_MISMATCH"),
    false,
  );

  const missingTenant = evaluate(
    proposal(),
    logicalSnapshot({ tenant: { exists: false, id: null } }),
  );
  assert.deepEqual(missingTenant.findings, ["TENANT_MISSING"]);
});

test("ROTATE rejects a no-op target and drain counts are internally exact", () => {
  const noOp = evaluate(
    proposal({
      action: "ROTATE",
      expectedRevision: 7,
      expectedState: "ACTIVE",
      nextRevision: 8,
    }),
    logicalSnapshot({ enrollment: activeEnrollment() }),
  );
  assert.deepEqual(noOp.findings, ["ROTATE_TARGET_UNCHANGED"]);

  const inconsistentDrain = evaluate(
    proposal(),
    logicalSnapshot({
      drain: {
        claimedCount: 2,
        markedClaimedCount: 0,
        unmarkedClaimedCount: 1,
      },
    }),
  );
  assert.deepEqual(inconsistentDrain.findings, [
    "CLAIMED_WORK_PRESENT_FOR_ENABLE",
    "DRAIN_COUNTS_INVALID",
  ]);
});

test("recursive prohibited-data scan never invokes accessors or echoes data", () => {
  let getterCalls = 0;
  const unsafe = logicalSnapshot();
  unsafe.debug = {
    recipientEmail: "tester@example.com",
    raw: Buffer.from("ciphertext"),
    url: "https://example.com/register#invite=raw-secret",
  };
  Object.defineProperty(unsafe.debug, "lazy", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "must-not-be-read";
    },
  });
  unsafe.debug[Symbol("secret")] = true;

  assert.deepEqual(
    identityMailTenantEnrollmentPreflightProhibitedDataFindings(unsafe),
    [
      "PROHIBITED_DATA_ACCESSOR",
      "PROHIBITED_DATA_BINARY",
      "PROHIBITED_DATA_KEY",
      "PROHIBITED_DATA_SYMBOL_KEY",
      "PROHIBITED_DATA_VALUE",
    ],
  );
  assert.equal(getterCalls, 0);

  const report = evaluate(proposal(), unsafe);
  assert.equal(report.inspectionDecision, "BLOCKED");
  assert.equal(report.observed, null);
  assert.equal(report.snapshotDigest, null);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /tester@example\.com|raw-secret/u);
  assert.equal(getterCalls, 0);
});

test("benign malformed snapshots produce only a minimal blocked report", () => {
  const malformed = logicalSnapshot();
  malformed.benignExtra = true;
  const report = evaluate(proposal(), malformed);
  assert.deepEqual(report.findings, ["LOGICAL_SNAPSHOT_INVALID"]);
  assert.equal(report.observed, null);
  assert.equal(report.snapshotDigest, null);

  const cyclic = logicalSnapshot();
  cyclic.database.loop = cyclic;
  const cyclicReport = evaluate(proposal(), cyclic);
  assert.deepEqual(cyclicReport.findings, ["PROHIBITED_DATA_STRUCTURE"]);
  assert.equal(cyclicReport.observed, null);
});

test("requires an explicit deterministic observation time", () => {
  for (const options of [undefined, {}, { now: new Date("invalid") }]) {
    assert.throws(
      () =>
        evaluateIdentityMailTenantEnrollmentPreflight(
          proposal(),
          logicalSnapshot(),
          options,
        ),
      (error) =>
        error instanceof IdentityMailTenantEnrollmentPreflightError &&
        error.exitCode === 3,
    );
  }
});

test("module is pure and reports contain no recursively prohibited data", async () => {
  const source = await readFile(PREFLIGHT_PATH, "utf8");
  const importSpecifiers = [
    ...source.matchAll(/from\s+["']([^"']+)["']/gu),
  ].map((match) => match[1]);
  assert.deepEqual(importSpecifiers, [
    "node:crypto",
    "./identity-mail-tenant-enrollment-contract.mjs",
    "./staff-task-integrity-migration-state.mjs",
  ]);
  assert.doesNotMatch(
    source,
    /(?:@prisma\/client|PrismaClient|\$executeRaw|\$queryRaw|node:fs|node:http|node:https|node:net|node:tls)/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/u,
  );

  const report = evaluate();
  assert.deepEqual(
    identityMailTenantEnrollmentPreflightProhibitedDataFindings(report),
    [],
  );
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS,
  identityMailDutyRoleCatalogCurrent186ActualDigests,
  identityMailDutyRoleCatalogCurrent186Digest,
  identityMailDutyRoleCatalogCurrent186Target,
  identityMailDutyRoleCatalogCurrent186TargetDigests,
  identityMailDutyRoleDefinitionManifestCurrent186Digest,
} from "./identity-mail-duty-role-catalog-current186.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_AUTHORIZED_EPOCH_READ_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_APPEND_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_READ_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EMERGENCY_IDENTITY_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OPERATION_RECOVERY_READ_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PUBLIC_ROUTINE_BINDING_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RUNTIME_SESSION_COUNT_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_STRICT_MEMBERSHIP_CONTAINMENT_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TERMINATE_RUNTIME_SQL,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PREAMBLE,
  IdentityMailDutyRoleDeploymentCurrent186Error,
  buildIdentityMailDutyRoleDeploymentCurrent186Plan,
  createIdentityMailDutyRoleDeploymentCurrent186OperationId,
  normalizeIdentityMailDutyRoleDeploymentCurrent186Config,
  identityMailDutyRoleDeploymentCurrent186Internals,
  runIdentityMailDutyRoleDeploymentCurrent186,
} from "./identity-mail-duty-role-deployment-current186.mjs";
import { identityMailDutyRoleCatalogCurrent186Fixture } from "./identity-mail-duty-role-current186-fixture.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const SHA256 = "b".repeat(64);
const SUPPORT_ROUTINE_IDENTITY = 'public."identity_email_claim_lock_v1"(text)';
const QUOTED_BYSTANDER_NAME = 'Outside "QA" Operator';
const QUOTED_BYSTANDER_OID = 8_888;
const SUPPORT_RELATION_IDENTITIES = Object.freeze([
  ...new Set(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.map(
      (identity) => identity.slice(0, identity.lastIndexOf(".")),
    ),
  ),
]);
const SUPPORT_ONLY_RELATION_IDENTITIES = Object.freeze([
  'public."IdentityEmailClaim"',
  'public."SharedBetaRuntimeReleaseMarker"',
  'public."Tenant"',
  'public."UserInvite"',
]);
const PROTECTED_RELATION_IDENTITIES = Object.freeze(
  [
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS,
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS,
    ...SUPPORT_ONLY_RELATION_IDENTITIES,
  ].sort(),
);

function supportColumnList(relationIdentity, privilege = null) {
  const identities =
    privilege === null
      ? IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES
      : IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.filter(
          (entry) => entry.privilege === privilege,
        ).map((entry) => entry.objectIdentity);
  return identities
    .filter((identity) => identity.startsWith(`${relationIdentity}.`))
    .map((identity) => identity.slice(relationIdentity.length + 1))
    .join(", ");
}

function expectedSupportGrantStatements() {
  return [
    ...SUPPORT_RELATION_IDENTITIES.flatMap((relationIdentity) =>
      ["SELECT", "UPDATE"].flatMap((privilege) => {
        const columns = supportColumnList(relationIdentity, privilege);
        return columns.length === 0
          ? []
          : [
              `GRANT ${privilege} (${columns}) ON TABLE ${relationIdentity} TO "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
            ];
      }),
    ),
    `GRANT EXECUTE ON ROUTINE ${SUPPORT_ROUTINE_IDENTITY} TO "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
  ];
}

function assertNoBroadSupportGrant(statements) {
  const sql = statements.join("\n");
  for (const relationIdentity of SUPPORT_RELATION_IDENTITIES) {
    for (const privilege of ["SELECT", "UPDATE"]) {
      if (supportColumnList(relationIdentity, privilege).length === 0) continue;
      assert.equal(
        statements.includes(
          `GRANT ${privilege} ON TABLE ${relationIdentity} TO "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
        ),
        false,
        `${relationIdentity} ${privilege}`,
      );
    }
  }
  assert.doesNotMatch(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+ROUTINE\s+public\."identity_email_claim_lock_v1"\(text\)\s+TO\s+(?:PUBLIC|"identity_mail_enrollment_coordinator"|"identity_mail_worker_v2")(?:\s|$)/iu,
  );
  assert.doesNotMatch(
    sql,
    /GRANT\s+EXECUTE\s+ON\s+ROUTINE\s+public\."identity_email_claim_lock_v1"\(text\)[^\n]*WITH\s+GRANT\s+OPTION/iu,
  );
}

function aclRichSupportBeforeImage({ includeBystander = true } = {}) {
  const before = identityMailDutyRoleCatalogCurrent186Fixture();
  const relationGrants = [
    {
      granteeName: "public",
      granteeOid: 0,
      grantorName: before.database.ownerName,
      grantorOid: before.database.ownerOid,
      identity: 'public."SharedBetaRuntimeReleaseMarker"',
      isGrantable: false,
      privilege: "SELECT",
    },
    {
      granteeName: QUOTED_BYSTANDER_NAME,
      granteeOid: QUOTED_BYSTANDER_OID,
      grantorName: before.database.ownerName,
      grantorOid: before.database.ownerOid,
      identity: 'public."IdentityEmailClaim"',
      isGrantable: false,
      privilege: "UPDATE",
    },
  ];
  for (const { identity, ...acl } of relationGrants.filter(
    (entry) => includeBystander || entry.granteeOid === 0,
  )) {
    const relation = before.objects.find(
      (entry) => entry.kind === "RELATION" && entry.identity === identity,
    );
    assert.ok(relation, identity);
    relation.acls.push(structuredClone(acl));
  }
  const columnGrants = [
    {
      granteeName: "public",
      granteeOid: 0,
      grantorName: before.database.ownerName,
      grantorOid: before.database.ownerOid,
      isGrantable: false,
      objectIdentity: 'public."Tenant"."id"',
      objectKind: "COLUMN",
      privilege: "SELECT",
      source: "ACL",
    },
    {
      granteeName: QUOTED_BYSTANDER_NAME,
      granteeOid: QUOTED_BYSTANDER_OID,
      grantorName: before.database.ownerName,
      grantorOid: before.database.ownerOid,
      isGrantable: true,
      objectIdentity: 'public."UserInvite"."id"',
      objectKind: "COLUMN",
      privilege: "UPDATE",
      source: "ACL",
    },
  ];
  const includedColumnGrants = columnGrants.filter(
    (entry) => includeBystander || entry.granteeOid === 0,
  );
  before.directAuthorities.push(...includedColumnGrants);
  return {
    before,
    columnGrants: includedColumnGrants,
    relationGrants: relationGrants.filter(
      (entry) => includeBystander || entry.granteeOid === 0,
    ),
  };
}

function assertGrantExecutedAs(statements, grant, grantorName) {
  const grantIndex = statements.indexOf(grant);
  assert.ok(grantIndex >= 0, grant);
  const roleBoundary = statements
    .slice(0, grantIndex)
    .findLast(
      (statement) =>
        statement === "SET LOCAL ROLE NONE" ||
        statement.startsWith("SET LOCAL ROLE "),
    );
  assert.equal(
    roleBoundary,
    `SET LOCAL ROLE "${grantorName.replaceAll('"', '""')}"`,
    grant,
  );
}

export function identityMailDutyRoleDeploymentCurrent186ConfigFixture(
  overrides = {},
) {
  return {
    actualContextDigest: "1".repeat(64),
    applicationArtifactSha256: "2".repeat(64),
    applicationContract: "IDENTITY_MAIL_TENANT_ENROLLMENT_MANIFEST_BOUND_V2",
    applicationReleaseSha: "3".repeat(40),
    coordinatorRoleOid: 94,
    databaseIdentityDigest: "a".repeat(64),
    databaseName: "leetplus_beta",
    databaseOid: 91,
    deploymentMarkerDigest: "4".repeat(64),
    deploymentMarkerId: "20000000-0000-4000-8000-000000000001",
    deploymentRoleName: "leetplus_owner",
    deploymentRoleOid: 92,
    definitionManifestDigest:
      identityMailDutyRoleCatalogCurrent186Fixture().definitionManifestDigest,
    expectedEpoch: 0,
    migrationCount: 186,
    migrationHead: "20260803010000_identity_mail_duty_role_runtime_boundary_v2",
    migrationManifestDigest: "6".repeat(64),
    operationId: createIdentityMailDutyRoleDeploymentCurrent186OperationId(),
    schemaOwnerRoleOid: 93,
    workerRoleOid: 95,
    ...overrides,
  };
}

function epochRow({
  applyReceiptDigest = "7".repeat(64),
  beforeCatalogDigest = "8".repeat(64),
  catalogDigest,
  definitionManifestDigest = identityMailDutyRoleCatalogCurrent186Fixture()
    .definitionManifestDigest,
  deploymentRoleName = "leetplus_owner",
  deploymentRoleOid = 92,
  epoch,
  exactGrantsDigest,
  operationId,
  ownerSurfaceDigest,
  payloadDigest = SHA256,
  planDigest = "9".repeat(64),
  reasonCode,
}) {
  return {
    applyReceiptDigest,
    beforeCatalogDigest,
    catalogDigest,
    definitionManifestDigest,
    deploymentRoleName,
    deploymentRoleOid: String(deploymentRoleOid),
    epoch: String(epoch),
    exactGrantsDigest,
    operationId,
    ownerSurfaceDigest,
    payloadDigest,
    planDigest,
    reasonCode,
  };
}

class FakeAdapter {
  constructor({
    authorizedEpoch = null,
    catalogs = [],
    epoch = null,
    failError = null,
    failOn = null,
    lostCommitTransactions = [],
    operationRecoveryRows = [],
    publicRoutineBindingBatches = [],
    remainingSessionCounts = [0],
    terminationBatches = [[]],
  } = {}) {
    this.authorizedEpoch = authorizedEpoch;
    this.catalogs = [...catalogs];
    this.committedStatements = [];
    this.epoch = epoch;
    this.events = [];
    this.failError = failError;
    this.failOn = failOn;
    this.lastCommittedResult = null;
    this.lostCommitTransactions = new Set(lostCommitTransactions);
    this.operationRecoveryRows = structuredClone(operationRecoveryRows);
    this.pendingStatements = null;
    this.publicRoutineBindingBatches = publicRoutineBindingBatches.map(
      (batch) => structuredClone(batch),
    );
    this.queryCalls = [];
    this.remainingSessionCounts = [...remainingSessionCounts];
    this.terminationBatches = terminationBatches.map((batch) =>
      structuredClone(batch),
    );
    this.transactionCount = 0;
  }

  async readCatalog() {
    this.events.push("catalog");
    if (this.catalogs.length === 0)
      throw new Error("catalog fixture exhausted");
    return structuredClone(this.catalogs.shift());
  }

  async execute(sql) {
    this.events.push(`execute:${sql}`);
    if (this.failOn?.test(sql)) {
      throw this.failError ?? new Error("injected transaction failure");
    }
    (this.pendingStatements ?? this.committedStatements).push(sql);
    return 0;
  }

  async query(sql, parameters = []) {
    this.queryCalls.push({ parameters: structuredClone(parameters), sql });
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL) {
      this.events.push("lock");
      return [{ epoch: String(this.epoch?.epoch ?? 0) }];
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_AUTHORIZED_EPOCH_READ_SQL) {
      this.events.push("authorized-epoch-read");
      return this.authorizedEpoch === null
        ? []
        : [structuredClone(this.authorizedEpoch)];
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_READ_SQL) {
      this.events.push("epoch-read");
      return this.epoch === null ? [] : [structuredClone(this.epoch)];
    }
    if (
      sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OPERATION_RECOVERY_READ_SQL
    ) {
      this.events.push("operation-recovery-read");
      return structuredClone(
        this.operationRecoveryRows.filter(
          (row) => row.operationId === parameters[0],
        ),
      );
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PUBLIC_ROUTINE_BINDING_SQL) {
      this.events.push("public-routine-binding-read");
      const expected = JSON.parse(parameters[0]);
      const batch =
        this.publicRoutineBindingBatches.length > 1
          ? this.publicRoutineBindingBatches.shift()
          : this.publicRoutineBindingBatches[0];
      return structuredClone(
        batch ??
          expected.map((entry) => ({
            ...entry,
            oid: String(entry.oid),
            ownerOid: String(entry.ownerOid),
          })),
      );
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_APPEND_SQL) {
      this.events.push("epoch-append");
      const payload = JSON.parse(parameters[0]);
      const payloadDigest = parameters[1];
      this.epoch = epochRow({
        applyReceiptDigest: payload.applyReceiptDigest,
        beforeCatalogDigest: payload.beforeCatalogDigest,
        catalogDigest: payload.catalogDigest,
        definitionManifestDigest: payload.definitionManifestDigest,
        deploymentRoleName: payload.deploymentRoleName,
        deploymentRoleOid: payload.deploymentRoleOid,
        epoch: payload.epoch,
        exactGrantsDigest: payload.exactGrantsDigest,
        operationId: payload.operationId,
        ownerSurfaceDigest: payload.ownerSurfaceDigest,
        payloadDigest,
        planDigest: payload.planDigest,
        reasonCode: payload.reasonCode,
      });
      if (["APPLY", "ROTATE"].includes(payload.reasonCode)) {
        this.authorizedEpoch = this.epoch;
      }
      this.operationRecoveryRows.push({
        ...structuredClone(this.epoch),
        beforeCatalogCanonicalJson: parameters[2],
        payloadCanonicalJson: parameters[0],
        recordedAtEpochMs: "1785700800000",
        recordedTransactionId: "1001",
      });
      return [
        {
          receipt: {
            authorization: false,
            applyReceiptDigest: payload.applyReceiptDigest,
            authorityScope: "CURRENT_DATABASE_ONLY",
            beforeCatalogDigest: payload.beforeCatalogDigest,
            canMutate: false,
            candidateStatus: "NOT_DEPLOYABLE",
            crossDatabaseAuthorityControlled: false,
            decision: "APPENDED",
            definitionManifestDigest: payload.definitionManifestDigest,
            directDutyAclDigest: payload.directDutyAclDigest,
            epoch: payload.epoch,
            evidenceDigest: payload.evidenceDigest,
            futureCreatorDefaultPrivilegesControlled: false,
            applicationRoleAllowlistBound: false,
            operation: "APPEND_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH",
            operationId: payload.operationId,
            payloadDigest,
            planDigest: payload.planDigest,
            productionApplyAuthorized: false,
            recordedAtEpochMs: 1_785_700_800_000,
            recordedTransactionId: "1001",
            schemaVersion: 1,
            systemPublicAclBaselineDigest:
              payload.systemPublicAclBaselineDigest,
          },
        },
      ];
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EMERGENCY_IDENTITY_SQL) {
      this.events.push("emergency-identity");
      return [
        {
          coordinatorRoleName: "identity_mail_enrollment_coordinator",
          coordinatorRoleOid: "94",
          databaseName: "leetplus_beta",
          databaseOid: "91",
          currentUserName: "leetplus_owner",
          currentUserOid: "92",
          deploymentRoleName: "leetplus_owner",
          deploymentRoleOid: "92",
          deploymentRoleSuperuser: true,
          sessionUserName: "leetplus_owner",
          sessionUserOid: "92",
          schemaOwnerRoleName: "identity_mail_schema_owner",
          schemaOwnerRoleOid: "93",
          workerRoleName: "identity_mail_worker_v2",
          workerRoleOid: "95",
        },
      ];
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TERMINATE_RUNTIME_SQL) {
      this.events.push("terminate-runtime");
      const batch =
        this.terminationBatches.length > 1
          ? this.terminationBatches.shift()
          : this.terminationBatches[0];
      return structuredClone(batch ?? []);
    }
    if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RUNTIME_SESSION_COUNT_SQL) {
      this.events.push("runtime-session-count");
      const count =
        this.remainingSessionCounts.length > 1
          ? this.remainingSessionCounts.shift()
          : this.remainingSessionCounts[0];
      return [{ remainingSessionCount: String(count ?? 0) }];
    }
    throw new Error("unexpected query");
  }

  async transaction(callback) {
    this.transactionCount += 1;
    const transactionNumber = this.transactionCount;
    const oldEpoch = this.epoch === null ? null : structuredClone(this.epoch);
    const oldAuthorized =
      this.authorizedEpoch === null
        ? null
        : structuredClone(this.authorizedEpoch);
    const oldOperationRecoveryRows = structuredClone(
      this.operationRecoveryRows,
    );
    this.pendingStatements = [];
    let committed = false;
    try {
      const result = await callback(this);
      this.lastCommittedResult = structuredClone(result);
      this.committedStatements.push(...this.pendingStatements);
      this.pendingStatements = null;
      this.events.push("transaction-commit");
      committed = true;
      if (this.lostCommitTransactions.delete(transactionNumber)) {
        this.events.push("transaction-response-lost");
        throw new Error("injected response lost after commit");
      }
      return result;
    } catch (error) {
      if (!committed) {
        this.epoch = oldEpoch;
        this.authorizedEpoch = oldAuthorized;
        this.operationRecoveryRows = oldOperationRecoveryRows;
      }
      this.pendingStatements = null;
      throw error;
    }
  }
}

class EnvelopeFakeAdapter extends FakeAdapter {
  async query(sql, parameters = []) {
    return { rows: await super.query(sql, parameters) };
  }
}

function beforeAndTarget() {
  const before = identityMailDutyRoleCatalogCurrent186Fixture();
  before.publicRoutineAcls.push({
    grantorName: "leetplus_owner",
    grantorOid: 92,
    isGrantable: false,
    oid: 8_001,
    ownerName: "leetplus_owner",
    ownerOid: 92,
    routineKind: "f",
    signature: 'public."unrelated_helper"(text)',
  });
  return {
    before,
    target: identityMailDutyRoleCatalogCurrent186Target(before),
  };
}

async function applyFixture() {
  const { before, target } = beforeAndTarget();
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture();
  const adapter = new FakeAdapter({ catalogs: [before, before, target] });
  const receipt = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config,
    mode: "apply",
    receipt: null,
  });
  return { adapter, before, config, receipt, target };
}

function publicRoutineBindingRows(catalog) {
  return catalog.publicRoutineAcls.map((entry) => ({
    oid: String(entry.oid),
    ownerName: entry.ownerName,
    ownerOid: String(entry.ownerOid),
    routineKind: entry.routineKind,
    signature: entry.signature,
  }));
}

function containedCatalog(catalog) {
  const contained = structuredClone(catalog);
  contained.roles.schemaOwner.canLogin = false;
  contained.roles.coordinator.canLogin = false;
  contained.roles.worker.canLogin = false;
  const dutyRoleOids = new Set(
    Object.values(contained.roles).map((role) => role.oid),
  );
  for (const object of contained.objects) {
    object.acls = object.acls.filter(
      (entry) => !dutyRoleOids.has(entry.granteeOid),
    );
  }
  contained.databaseRoleSettings = [];
  contained.defaultAcls = [];
  contained.directAuthorities = contained.directAuthorities.filter(
    (entry) => !dutyRoleOids.has(entry.granteeOid),
  );
  contained.effectivePrivileges = contained.effectivePrivileges.filter(
    (entry) => entry.objectKind === "SCHEMA",
  );
  contained.memberships = [];
  contained.publicRoutineAcls = [];
  contained.roleSettings = [];
  contained.unexpectedOwnedObjects = [];
  return contained;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function expectedEmergencyPlanDigest(config) {
  const names = IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES;
  const core = {
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SCOPE,
    config,
    drainProtocol: {
      attempts: 20,
      delayMs: 50,
      profile: "CURRENT186_POST_COMMIT_TERMINATE_AND_ZERO_SESSION_V1",
      roleNames: [names.schemaOwner, names.coordinator, names.worker],
      sessionCountSqlSha256: sha256(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RUNTIME_SESSION_COUNT_SQL,
      ),
      terminateSqlSha256: sha256(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TERMINATE_RUNTIME_SQL,
      ),
    },
    mode: "emergency",
    phase1Protocol: {
      aclLockSqlSha256: sha256(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL),
      attempts: 3,
      epochReadSqlSha256: sha256(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_READ_SQL,
      ),
      profile: "CURRENT186_LOCKED_IDEMPOTENT_PHASE1_COMMIT_RECOVERY_V1",
    },
    phase1: [
      `ALTER ROLE "${names.schemaOwner}" NOLOGIN`,
      `ALTER ROLE "${names.coordinator}" NOLOGIN`,
      `ALTER ROLE "${names.worker}" NOLOGIN`,
      `ALTER ROLE "${names.schemaOwner}" RESET ALL`,
      `ALTER ROLE "${names.coordinator}" RESET ALL`,
      `ALTER ROLE "${names.worker}" RESET ALL`,
      `ALTER ROLE "${names.schemaOwner}" IN DATABASE "${config.databaseName}" RESET ALL`,
      `ALTER ROLE "${names.coordinator}" IN DATABASE "${config.databaseName}" RESET ALL`,
      `ALTER ROLE "${names.worker}" IN DATABASE "${config.databaseName}" RESET ALL`,
      `REVOKE CONNECT ON DATABASE "${config.databaseName}" FROM "${names.schemaOwner}"`,
      `REVOKE CONNECT ON DATABASE "${config.databaseName}" FROM "${names.coordinator}"`,
      `REVOKE CONNECT ON DATABASE "${config.databaseName}" FROM "${names.worker}"`,
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_STRICT_MEMBERSHIP_CONTAINMENT_SQL,
    ],
    phase2Digest: sha256(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    ),
    transactionProtocol: {
      idleInTransactionSessionTimeoutMs: 30_000,
      lockTimeoutMs: 60_000,
      profile: "CURRENT186_LOCK_60S_STATEMENT_90S_IDLE_30S_V1",
      statementTimeoutMs: 90_000,
      transactionPreambleSqlSha256: sha256(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PREAMBLE,
      ),
    },
  };
  return sha256(
    `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_PLAN_CURRENT186_V1\n${canonicalStringify(core)}\n`,
  );
}

test("CURRENT186 config is exact and binds the frozen migration/application context", () => {
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture();
  assert.deepEqual(
    normalizeIdentityMailDutyRoleDeploymentCurrent186Config(config),
    config,
  );
  for (const patch of [
    { migrationCount: 187 },
    { migrationHead: "other" },
    { applicationContract: "other" },
    { deploymentMarkerId: "not-a-uuid" },
  ]) {
    assert.throws(
      () =>
        normalizeIdentityMailDutyRoleDeploymentCurrent186Config({
          ...config,
          ...patch,
        }),
      /deployment is blocked/u,
    );
  }
});

test("CURRENT186 plan surfaces global PUBLIC impact and remains NOT_DEPLOYABLE", () => {
  const { before } = beforeAndTarget();
  const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    before,
    identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
  );
  assert.equal(plan.candidateStatus, "NOT_DEPLOYABLE");
  assert.equal(plan.globalEffects.productionApplyAuthorized, false);
  assert.equal(
    plan.globalEffects.futureRoutineDefaultPrivilegesControlled,
    false,
  );
  assert.equal(
    plan.globalEffects.requiresExplicitApplicationRoleAllowlist,
    true,
  );
  assert.equal(plan.globalEffects.publicRoutineExecuteRevocationCount, 1);
  assert.deepEqual(plan.transactionProtocol, {
    idleInTransactionSessionTimeoutMs: 30_000,
    lockTimeoutMs: 60_000,
    profile: "CURRENT186_LOCK_60S_STATEMENT_90S_IDLE_30S_V1",
    statementTimeoutMs: 90_000,
    transactionPreambleSqlSha256: sha256(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_TRANSACTION_PREAMBLE,
    ),
  });
  assert.ok(
    plan.transactionProtocol.statementTimeoutMs >
      plan.transactionProtocol.lockTimeoutMs,
  );
  const publicSchemaUsageGrant =
    'GRANT USAGE ON SCHEMA "public" TO PUBLIC';
  const coordinatorRoutineGrant =
    'GRANT EXECUTE ON ROUTINE public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text) TO "identity_mail_enrollment_coordinator"';
  assert.ok(
    plan.statements.indexOf(publicSchemaUsageGrant) <
      plan.statements.indexOf(coordinatorRoutineGrant),
    'schema USAGE must be restored before schema-qualified routine grants',
  );
  assertGrantExecutedAs(
    plan.statements,
    publicSchemaUsageGrant,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner,
  );
  const epochAppendOwnerTransfer =
    'ALTER ROUTINE public."identity_mail_duty_role_acl_epoch_append_v1"(text,text,text) OWNER TO "identity_mail_schema_owner"';
  const epochAppendOwnerGrant =
    'GRANT ALL PRIVILEGES ON ROUTINE public."identity_mail_duty_role_acl_epoch_append_v1"(text,text,text) TO "identity_mail_schema_owner" WITH GRANT OPTION';
  assert.ok(plan.statements.includes(epochAppendOwnerTransfer));
  assert.equal(
    plan.statements.indexOf(epochAppendOwnerGrant),
    plan.statements.indexOf(epochAppendOwnerTransfer) + 1,
    'owner capability must be restored immediately after routine ownership transfer',
  );
  assert.ok(
    plan.statements.includes(
      'REVOKE ALL PRIVILEGES ON DATABASE "leetplus_beta" FROM PUBLIC',
    ),
  );
  assert.ok(
    plan.statements.includes(
      'REVOKE EXECUTE ON ROUTINE public."unrelated_helper"(text) FROM PUBLIC',
    ),
  );
  for (const relationIdentity of SUPPORT_RELATION_IDENTITIES) {
    const columnList = supportColumnList(relationIdentity);
    for (const privilege of ["SELECT", "UPDATE"]) {
      const privilegeColumnList = supportColumnList(
        relationIdentity,
        privilege,
      );
      if (privilegeColumnList.length === 0) continue;
      const columnGrantStatement = `GRANT ${privilege} (${privilegeColumnList}) ON TABLE ${relationIdentity} TO "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`;
      assert.equal(
        plan.statements.filter((entry) => entry === columnGrantStatement)
          .length,
        1,
        `${relationIdentity} ${privilege}`,
      );
    }
    assert.ok(
      plan.statements.includes(
        `REVOKE ALL PRIVILEGES ON TABLE ${relationIdentity} FROM "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
      ),
    );
    assert.ok(
      plan.statements.includes(
        `REVOKE ALL PRIVILEGES (${columnList}) ON TABLE ${relationIdentity} FROM "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
      ),
    );
  }
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES,
    [{ objectIdentity: SUPPORT_ROUTINE_IDENTITY, privilege: "EXECUTE" }],
  );
  assert.ok(
    plan.statements.includes(
      `GRANT EXECUTE ON ROUTINE ${SUPPORT_ROUTINE_IDENTITY} TO "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
    ),
  );
  assert.ok(
    plan.statements.includes(
      `REVOKE ALL PRIVILEGES ON ROUTINE ${SUPPORT_ROUTINE_IDENTITY} FROM PUBLIC`,
    ),
  );
  assertNoBroadSupportGrant(plan.statements);
  assert.doesNotMatch(plan.statements.join("\n"), /CREATE ROLE|DROP ROLE/iu);
});

test("CURRENT186 APPLY plan clears PUBLIC and quoted-bystander ACLs across the full 13-relation snapshot", () => {
  const { before, columnGrants, relationGrants } = aclRichSupportBeforeImage();
  const target = identityMailDutyRoleCatalogCurrent186Target(before);
  const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    before,
    identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
  );
  assert.equal(
    target.objects.filter((entry) => entry.kind === "RELATION").length,
    13,
  );
  assert.deepEqual(
    target.objects
      .filter((entry) => entry.kind === "RELATION")
      .map((entry) => entry.identity)
      .sort(),
    PROTECTED_RELATION_IDENTITIES,
  );
  for (const principal of ["PUBLIC", '"Outside ""QA"" Operator"']) {
    for (const relationIdentity of PROTECTED_RELATION_IDENTITIES) {
      assert.ok(
        plan.statements.includes(
          `REVOKE ALL PRIVILEGES ON TABLE ${relationIdentity} FROM ${principal}`,
        ),
        `${relationIdentity} ${principal}`,
      );
    }
  }
  for (const expected of relationGrants) {
    const grantee =
      expected.granteeOid === 0 ? "PUBLIC" : '"Outside ""QA"" Operator"';
    assert.equal(
      plan.statements.includes(
        `GRANT ${expected.privilege} ON TABLE ${expected.identity} TO ${grantee}${expected.isGrantable ? " WITH GRANT OPTION" : ""}`,
      ),
      false,
      expected.identity,
    );
  }
  for (const expected of columnGrants) {
    const relationIdentity = expected.objectIdentity.slice(
      0,
      expected.objectIdentity.lastIndexOf("."),
    );
    const grantee =
      expected.granteeOid === 0 ? "PUBLIC" : '"Outside ""QA"" Operator"';
    assert.ok(
      plan.statements.includes(
        `REVOKE ALL PRIVILEGES (${supportColumnList(relationIdentity)}) ON TABLE ${relationIdentity} FROM ${grantee}`,
      ),
      expected.objectIdentity,
    );
    assert.equal(
      plan.statements.some(
        (statement) =>
          statement.startsWith(`GRANT ${expected.privilege} (`) &&
          statement.includes(`ON TABLE ${relationIdentity} TO ${grantee}`),
      ),
      false,
      expected.objectIdentity,
    );
  }
  assert.equal(
    target.directAuthorities.some(
      (entry) =>
        [0, QUOTED_BYSTANDER_OID].includes(entry.granteeOid) &&
        (entry.objectKind === "RELATION" || entry.objectKind === "COLUMN"),
    ),
    false,
  );
  assert.ok(plan.safetyBlockers.includes("UNEXPECTED_ACL_PRINCIPAL"));
  assert.ok(plan.safetyBlockers.includes("UNEXPECTED_DIRECT_AUTHORITY"));
  assertNoBroadSupportGrant(plan.statements);
});

test("CURRENT186 beforeImageRestore restores canonical DB-owner-to-PUBLIC support ACL rows exactly", () => {
  const { before } = aclRichSupportBeforeImage({
    includeBystander: false,
  });
  const target = identityMailDutyRoleCatalogCurrent186Target(before);
  const statements =
    identityMailDutyRoleDeploymentCurrent186Internals.beforeImageRestoreStatements(
      before,
      target,
    );
  assertGrantExecutedAs(
    statements,
    'GRANT SELECT ON TABLE public."SharedBetaRuntimeReleaseMarker" TO PUBLIC',
    before.database.ownerName,
  );
  assertGrantExecutedAs(
    statements,
    'GRANT SELECT ("id") ON TABLE public."Tenant" TO PUBLIC',
    before.database.ownerName,
  );
  for (const relationIdentity of PROTECTED_RELATION_IDENTITIES) {
    assert.ok(
      statements.includes(
        `REVOKE ALL PRIVILEGES ON TABLE ${relationIdentity} FROM PUBLIC`,
      ),
      relationIdentity,
    );
  }
  assert.equal(
    statements.includes(
      'GRANT SELECT ON TABLE public."SharedBetaRuntimeReleaseMarker" TO PUBLIC WITH GRANT OPTION',
    ),
    false,
  );
  assert.doesNotMatch(
    statements.join("\n"),
    /GRANT[^\n]+TO "Outside ""QA"" Operator"/u,
  );
  assert.ok(statements.includes("SET LOCAL ROLE NONE"));
  assert.equal(statements.includes("RESET ROLE"), false);
});

test("CURRENT186 fake APPLY removes and ROLLBACK restores DB-owner-to-PUBLIC support ACLs", async () => {
  const { before } = aclRichSupportBeforeImage({
    includeBystander: false,
  });
  const target = identityMailDutyRoleCatalogCurrent186Target(before);
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture();
  const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    before,
    config,
  );
  assert.deepEqual(plan.safetyBlockers, []);
  const applyAdapter = new FakeAdapter({
    catalogs: [before, before, target],
  });
  const receipt = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter: applyAdapter,
    config,
    mode: "apply",
    receipt: null,
  });
  assert.equal(
    applyAdapter.committedStatements.includes(
      'GRANT SELECT ON TABLE public."SharedBetaRuntimeReleaseMarker" TO PUBLIC',
    ),
    false,
  );
  assert.equal(
    applyAdapter.committedStatements.includes(
      'GRANT SELECT ("id") ON TABLE public."Tenant" TO PUBLIC',
    ),
    false,
  );

  const applyEpoch = structuredClone(applyAdapter.epoch);
  const rollbackAdapter = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [target, target, before],
    epoch: applyEpoch,
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter: rollbackAdapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 1,
    }),
    mode: "rollback",
    receipt,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_DEPLOYMENT_ROLLED_BACK");
  assertGrantExecutedAs(
    rollbackAdapter.committedStatements,
    'GRANT SELECT ON TABLE public."SharedBetaRuntimeReleaseMarker" TO PUBLIC',
    before.database.ownerName,
  );
  assertGrantExecutedAs(
    rollbackAdapter.committedStatements,
    'GRANT SELECT ("id") ON TABLE public."Tenant" TO PUBLIC',
    before.database.ownerName,
  );
  assert.equal(
    rollbackAdapter.committedStatements.includes("RESET ROLE"),
    false,
  );
});

test("CURRENT186 rollback repairs ACL drift of an exact pinned duty role", async () => {
  const applied = await applyFixture();
  const drift = structuredClone(applied.target);
  const relation = drift.objects.find(
    (entry) =>
      entry.kind === "RELATION" &&
      entry.identity === 'public."IdentityMailDutyRoleAclEpochV1"',
  );
  assert.ok(relation);
  const extraAcl = {
    granteeName: drift.roles.worker.name,
    granteeOid: drift.roles.worker.oid,
    grantorName: relation.ownerName,
    grantorOid: relation.ownerOid,
    isGrantable: false,
    privilege: "SELECT",
  };
  relation.acls.push(structuredClone(extraAcl));
  drift.directAuthorities.push({
    ...structuredClone(extraAcl),
    objectIdentity: relation.identity,
    objectKind: "RELATION",
    source: "ACL",
  });
  drift.effectivePrivileges.push({
    objectIdentity: relation.identity,
    objectKind: "RELATION",
    privilege: "SELECT",
    roleName: drift.roles.worker.name,
    roleOid: drift.roles.worker.oid,
  });

  const applyEpoch = structuredClone(applied.adapter.epoch);
  const adapter = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [drift, drift, applied.before],
    epoch: applyEpoch,
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 1,
    }),
    mode: "rollback",
    receipt: applied.receipt,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_DEPLOYMENT_ROLLED_BACK");
  assert.ok(
    adapter.committedStatements.includes(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    ),
  );
});

test("CURRENT186 blocks named grantees, non-owner grantors and impossible PUBLIC grant option before DDL", async () => {
  const scenarios = [
    {
      label: "quoted table grantee",
      mutate(before) {
        const relation = before.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."IdentityEmailClaim"',
        );
        const acl = {
          granteeName: QUOTED_BYSTANDER_NAME,
          granteeOid: QUOTED_BYSTANDER_OID,
          grantorName: before.database.ownerName,
          grantorOid: before.database.ownerOid,
          isGrantable: false,
          privilege: "SELECT",
        };
        relation.acls.push(acl);
      },
    },
    {
      label: "quoted column grantee",
      mutate(before) {
        before.directAuthorities.push({
          granteeName: QUOTED_BYSTANDER_NAME,
          granteeOid: QUOTED_BYSTANDER_OID,
          grantorName: before.database.ownerName,
          grantorOid: before.database.ownerOid,
          isGrantable: false,
          objectIdentity: 'public."UserInvite"."id"',
          objectKind: "COLUMN",
          privilege: "UPDATE",
          source: "ACL",
        });
      },
    },
    {
      label: "non-owner table grantor",
      mutate(before) {
        const relation = before.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."SharedBetaRuntimeReleaseMarker"',
        );
        const acl = {
          granteeName: "public",
          granteeOid: 0,
          grantorName: before.roles.schemaOwner.name,
          grantorOid: before.roles.schemaOwner.oid,
          isGrantable: false,
          privilege: "SELECT",
        };
        relation.acls.push(acl);
      },
    },
    {
      label: "non-owner column grantor",
      mutate(before) {
        before.directAuthorities.push({
          granteeName: "public",
          granteeOid: 0,
          grantorName: before.roles.schemaOwner.name,
          grantorOid: before.roles.schemaOwner.oid,
          isGrantable: false,
          objectIdentity: 'public."Tenant"."id"',
          objectKind: "COLUMN",
          privilege: "SELECT",
          source: "ACL",
        });
      },
    },
    {
      label: "PUBLIC table grant option",
      mutate(before) {
        const relation = before.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."SharedBetaRuntimeReleaseMarker"',
        );
        const acl = {
          granteeName: "public",
          granteeOid: 0,
          grantorName: before.database.ownerName,
          grantorOid: before.database.ownerOid,
          isGrantable: true,
          privilege: "SELECT",
        };
        relation.acls.push(acl);
      },
    },
    {
      label: "PUBLIC column grant option",
      mutate(before) {
        before.directAuthorities.push({
          granteeName: "public",
          granteeOid: 0,
          grantorName: before.database.ownerName,
          grantorOid: before.database.ownerOid,
          isGrantable: true,
          objectIdentity: 'public."Tenant"."id"',
          objectKind: "COLUMN",
          privilege: "SELECT",
          source: "ACL",
        });
      },
    },
  ];
  for (const scenario of scenarios) {
    const before = identityMailDutyRoleCatalogCurrent186Fixture();
    scenario.mutate(before);
    const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
      before,
      identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    );
    assert.ok(plan.safetyBlockers.length > 0, scenario.label);
    const adapter = new FakeAdapter({ catalogs: [before] });
    await assert.rejects(
      runIdentityMailDutyRoleDeploymentCurrent186({
        adapter,
        config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
        mode: "apply",
        receipt: null,
      }),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_PREFLIGHT_BLOCKED",
      scenario.label,
    );
    assert.equal(adapter.transactionCount, 0, scenario.label);
    assert.deepEqual(adapter.committedStatements, [], scenario.label);
    assert.equal(adapter.epoch, null, scenario.label);
  }
});

test("CURRENT186 treats full support-table SELECT and UPDATE as unsafe and never re-grants either", () => {
  for (const relationIdentity of SUPPORT_RELATION_IDENTITIES) {
    for (const privilege of ["SELECT", "UPDATE"]) {
      if (supportColumnList(relationIdentity, privilege).length === 0) continue;
      const catalog = identityMailDutyRoleCatalogCurrent186Fixture();
      catalog.directAuthorities.push({
        granteeName: catalog.roles.schemaOwner.name,
        granteeOid: catalog.roles.schemaOwner.oid,
        grantorName: catalog.database.ownerName,
        grantorOid: catalog.database.ownerOid,
        isGrantable: false,
        objectIdentity: relationIdentity,
        objectKind: "RELATION",
        privilege,
        source: "ACL",
      });
      catalog.effectivePrivileges.push({
        objectIdentity: relationIdentity,
        objectKind: "RELATION",
        privilege,
        roleName: catalog.roles.schemaOwner.name,
        roleOid: catalog.roles.schemaOwner.oid,
      });
      const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
        catalog,
        identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      );
      assert.ok(
        plan.safetyBlockers.includes("UNEXPECTED_DIRECT_AUTHORITY"),
        `${relationIdentity} ${privilege}`,
      );
      assert.ok(
        plan.statements.includes(
          `REVOKE ALL PRIVILEGES ON TABLE ${relationIdentity} FROM "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
        ),
      );
      assert.equal(
        plan.statements.includes(
          `GRANT ${privilege} ON TABLE ${relationIdentity} TO "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
        ),
        false,
      );
    }
  }
});

test("CURRENT186 removes PUBLIC and bystander EXECUTE from the support lock without widening its grant", () => {
  for (const principal of [
    { name: "public", oid: 0 },
    { name: "Outside QA Operator", oid: 8_888 },
  ]) {
    const catalog = identityMailDutyRoleCatalogCurrent186Fixture();
    const routine = catalog.objects.find(
      (entry) =>
        entry.kind === "ROUTINE" && entry.identity === SUPPORT_ROUTINE_IDENTITY,
    );
    assert.ok(routine);
    routine.acls.push({
      granteeName: principal.name,
      granteeOid: principal.oid,
      grantorName: catalog.database.ownerName,
      grantorOid: catalog.database.ownerOid,
      isGrantable: false,
      privilege: "EXECUTE",
    });
    if (principal.oid === 0) {
      catalog.publicRoutineAcls.push({
        grantorName: catalog.database.ownerName,
        grantorOid: catalog.database.ownerOid,
        isGrantable: false,
        oid: routine.oid,
        ownerName: catalog.database.ownerName,
        ownerOid: catalog.database.ownerOid,
        routineKind: "f",
        signature: SUPPORT_ROUTINE_IDENTITY,
      });
    } else {
      catalog.directAuthorities.push({
        granteeName: principal.name,
        granteeOid: principal.oid,
        grantorName: catalog.database.ownerName,
        grantorOid: catalog.database.ownerOid,
        isGrantable: false,
        objectIdentity: SUPPORT_ROUTINE_IDENTITY,
        objectKind: "ROUTINE",
        privilege: "EXECUTE",
        source: "ACL",
      });
    }

    const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
      catalog,
      identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    );
    if (principal.oid === 0) {
      assert.equal(plan.globalEffects.publicRoutineExecuteRevocationCount, 1);
    } else {
      assert.ok(
        plan.safetyBlockers.includes("UNEXPECTED_DIRECT_AUTHORITY"),
        principal.name,
      );
    }
    const grantee = principal.oid === 0 ? "PUBLIC" : `"${principal.name}"`;
    assert.ok(
      plan.statements.includes(
        `REVOKE ALL PRIVILEGES ON ROUTINE ${SUPPORT_ROUTINE_IDENTITY} FROM ${grantee}`,
      ),
      principal.name,
    );
    assert.equal(
      plan.statements.some(
        (statement) =>
          statement ===
          `GRANT EXECUTE ON ROUTINE ${SUPPORT_ROUTINE_IDENTITY} TO ${grantee}`,
      ),
      false,
      principal.name,
    );
  }
});

test("CURRENT186 plans PUBLIC EXECUTE repair for every executable routine kind", () => {
  const before = identityMailDutyRoleCatalogCurrent186Fixture();
  before.publicRoutineAcls = [
    ["f", 'public."function_helper"(text)'],
    ["p", 'public."procedure_helper"(integer)'],
    ["a", 'public."aggregate_helper"(bigint)'],
    ["w", 'public."window_helper"(text)'],
  ].map(([routineKind, signature], index) => ({
    grantorName: before.database.ownerName,
    grantorOid: before.database.ownerOid,
    isGrantable: false,
    oid: 8_100 + index,
    ownerName: before.database.ownerName,
    ownerOid: before.database.ownerOid,
    routineKind,
    signature,
  }));
  const plan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    before,
    identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
  );
  for (const entry of before.publicRoutineAcls) {
    assert.ok(
      plan.statements.includes(
        `REVOKE EXECUTE ON ROUTINE ${entry.signature} FROM PUBLIC`,
      ),
    );
  }
});

test("CURRENT186 normal apply blocks custom-schema authority before DDL", async () => {
  const { before } = beforeAndTarget();
  before.effectivePrivileges.push({
    objectIdentity: "custom_schema",
    objectKind: "SCHEMA",
    privilege: "USAGE",
    roleName: before.roles.worker.name,
    roleOid: before.roles.worker.oid,
  });
  const adapter = new FakeAdapter({ catalogs: [before] });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_PREFLIGHT_BLOCKED",
  );
  assert.equal(adapter.transactionCount, 0);
  assert.deepEqual(adapter.committedStatements, []);
});

test("CURRENT186 check and plan are persistently read-only", async () => {
  for (const mode of ["check", "plan"]) {
    const { target } = beforeAndTarget();
    const adapter = new FakeAdapter({ catalogs: [target] });
    const result = await runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode,
      receipt: null,
    });
    assert.equal(result.authorization, false);
    assert.equal(result.canMutate, false);
    assert.equal(adapter.transactionCount, 0);
    assert.deepEqual(adapter.committedStatements, []);
    assert.equal(
      adapter.events.some((event) => event.startsWith("execute:")),
      false,
    );
  }
});

test("CURRENT186 apply locks, re-reads, mutates, verifies and appends in order", async () => {
  const { adapter, receipt } = await applyFixture();
  assert.equal(receipt.decision, "CURRENT186_DUTY_ROLE_DEPLOYMENT_APPLIED");
  assert.equal(receipt.candidateStatus, "NOT_DEPLOYABLE");
  assert.equal(receipt.epoch, 1);
  assert.equal(adapter.epoch.reasonCode, "APPLY");
  const lock = adapter.events.indexOf("lock");
  const firstCatalog = adapter.events.indexOf("catalog");
  const lockedCatalog = adapter.events.indexOf("catalog", firstCatalog + 1);
  const lastCatalog = adapter.events.lastIndexOf("catalog");
  const append = adapter.events.indexOf("epoch-append");
  assert.ok(lock >= 3);
  assert.ok(firstCatalog < lock);
  assert.ok(lock < lockedCatalog);
  assert.ok(lockedCatalog < lastCatalog);
  assert.ok(lastCatalog < append);
  assert.equal(adapter.committedStatements[0], "SET LOCAL ROLE NONE");
  assert.equal(
    adapter.committedStatements[1],
    "SET LOCAL lock_timeout = '60s'",
  );
  assert.equal(
    adapter.committedStatements[2],
    "SET LOCAL statement_timeout = '90s'",
  );
  assert.match(
    adapter.committedStatements[3],
    /idle_in_transaction_session_timeout/u,
  );
  for (const statement of expectedSupportGrantStatements()) {
    assert.equal(
      adapter.committedStatements.filter((entry) => entry === statement).length,
      1,
      statement,
    );
  }
  assertNoBroadSupportGrant(adapter.committedStatements);
});

test("CURRENT186 rejects a receipt bound to the legacy 30s statement profile", async () => {
  const applied = await applyFixture();
  const rebuilt = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    applied.receipt.beforeCatalog,
    applied.receipt.applyConfig,
  );
  const legacyCore = structuredClone(rebuilt);
  delete legacyCore.planDigest;
  legacyCore.transactionProtocol = {
    idleInTransactionSessionTimeoutMs: 30_000,
    lockTimeoutMs: 60_000,
    profile: "CURRENT186_LOCK_60S_STATEMENT_30S_IDLE_30S_V1",
    statementTimeoutMs: 30_000,
    transactionPreambleSqlSha256: sha256(
      "SET LOCAL lock_timeout = '60s'; SET LOCAL statement_timeout = '30s'; SET LOCAL idle_in_transaction_session_timeout = '30s';",
    ),
  };
  const legacyPlanDigest = sha256(
    `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_PLAN_CURRENT186_V1\n${canonicalStringify(legacyCore)}\n`,
  );
  assert.notEqual(legacyPlanDigest, rebuilt.planDigest);
  const tampered = structuredClone(applied.receipt);
  tampered.planDigest = legacyPlanDigest;
  const adapter = new FakeAdapter();
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: tampered,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
  );
  assert.equal(adapter.transactionCount, 0);
  assert.equal(adapter.queryCalls.length, 0);
});

test("CURRENT186 apply recovers the exact committed receipt by operationId after a lost response", async () => {
  const { before, target } = beforeAndTarget();
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture({
    operationId: "29000000-0000-4000-8000-000000000001",
  });
  const adapter = new FakeAdapter({
    catalogs: [before, before, target],
    lostCommitTransactions: [1],
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config,
      mode: "apply",
      receipt: null,
    }),
    /response lost after commit/u,
  );
  const originalReceipt = structuredClone(adapter.lastCommittedResult);
  const committedStatements = structuredClone(adapter.committedStatements);
  assert.equal(adapter.epoch.epoch, "1");
  assert.equal(adapter.operationRecoveryRows.length, 1);
  assert.equal(
    adapter.operationRecoveryRows[0].beforeCatalogCanonicalJson,
    canonicalStringify(originalReceipt.beforeCatalog),
  );
  const storedPayload = JSON.parse(
    adapter.operationRecoveryRows[0].payloadCanonicalJson,
  );
  assert.equal(Object.keys(storedPayload).length, 39);
  assert.equal(
    storedPayload.beforeCatalogStorageProfile,
    "EPOCH_COLUMN_CANONICAL_JSON_V1",
  );
  assert.equal(
    Object.hasOwn(storedPayload, "beforeCatalogCanonicalJsonHex"),
    false,
  );
  assert.equal(
    Object.hasOwn(storedPayload, "beforeCatalogCanonicalJson"),
    false,
  );
  const appendCall = adapter.queryCalls.find(
    (call) => call.sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_APPEND_SQL,
  );
  assert.equal(appendCall.parameters.length, 3);
  assert.equal(
    appendCall.parameters[2],
    canonicalStringify(originalReceipt.beforeCatalog),
  );

  const recovered = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config,
    mode: "apply",
    receipt: null,
  });
  assert.deepEqual(recovered, originalReceipt);
  assert.deepEqual(adapter.committedStatements, committedStatements);
  assert.equal(adapter.transactionCount, 1);
  assert.equal(adapter.catalogs.length, 0);
  const recoveryCalls = adapter.queryCalls.filter(
    (call) =>
      call.sql ===
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OPERATION_RECOVERY_READ_SQL,
  );
  assert.equal(recoveryCalls.length, 2);
  assert.deepEqual(recoveryCalls[1].parameters, [config.operationId]);
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OPERATION_RECOVERY_READ_SQL,
    /WHERE "operationId" = \$1::TEXT/u,
  );
});

test("CURRENT186 apply recovery fails closed on hostile stored evidence", async () => {
  const { before, target } = beforeAndTarget();
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture({
    operationId: "29000000-0000-4000-8000-000000000002",
  });
  const source = new FakeAdapter({
    catalogs: [before, before, target],
    lostCommitTransactions: [1],
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: source,
      config,
      mode: "apply",
      receipt: null,
    }),
    /response lost after commit/u,
  );
  const sourceRow = structuredClone(source.operationRecoveryRows[0]);
  const mutations = [
    (row) => {
      row.recordedTransactionId = "hostile";
    },
    (row) => {
      const payload = JSON.parse(row.payloadCanonicalJson);
      payload.directDutyAclDigest = "f".repeat(64);
      row.payloadCanonicalJson = canonicalStringify(payload);
      row.payloadDigest = sha256(
        `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1\n${row.payloadCanonicalJson}\n`,
      );
    },
    (row) => {
      const payload = JSON.parse(row.payloadCanonicalJson);
      payload.applicationArtifactSha256 = "e".repeat(64);
      row.payloadCanonicalJson = canonicalStringify(payload);
      row.payloadDigest = sha256(
        `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1\n${row.payloadCanonicalJson}\n`,
      );
    },
    (row) => {
      const payload = JSON.parse(row.payloadCanonicalJson);
      payload.beforeCatalogStorageProfile = "HOSTILE_INLINE_STORAGE";
      row.payloadCanonicalJson = canonicalStringify(payload);
      row.payloadDigest = sha256(
        `LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1\n${row.payloadCanonicalJson}\n`,
      );
    },
    (row) => {
      const beforeCatalog = JSON.parse(row.beforeCatalogCanonicalJson);
      beforeCatalog.systemPublicAclBaselineDigest = "f".repeat(64);
      row.beforeCatalogCanonicalJson = canonicalStringify(beforeCatalog);
    },
    (row) => {
      const beforeCatalog = JSON.parse(row.beforeCatalogCanonicalJson);
      beforeCatalog.userRoutineDefinitionDigest = "f".repeat(64);
      row.beforeCatalogCanonicalJson = canonicalStringify(beforeCatalog);
    },
    (row) => {
      const beforeCatalog = JSON.parse(row.beforeCatalogCanonicalJson);
      beforeCatalog.userRoutineDefinitionCount = -1;
      row.beforeCatalogCanonicalJson = canonicalStringify(beforeCatalog);
    },
    (row) => {
      row.beforeCatalogCanonicalJson = `${row.beforeCatalogCanonicalJson} `;
    },
    (row) => {
      row.planDigest = "0".repeat(64);
    },
  ];
  for (const mutate of mutations) {
    const row = structuredClone(sourceRow);
    mutate(row);
    const adapter = new FakeAdapter({ operationRecoveryRows: [row] });
    await assert.rejects(
      runIdentityMailDutyRoleDeploymentCurrent186({
        adapter,
        config,
        mode: "apply",
        receipt: null,
      }),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
    );
    assert.equal(adapter.transactionCount, 0);
    assert.equal(adapter.events.includes("catalog"), false);
  }
  const duplicate = new FakeAdapter({
    operationRecoveryRows: [sourceRow, structuredClone(sourceRow)],
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: duplicate,
      config,
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_APPLY_RECOVERY_INVALID",
  );
  assert.equal(duplicate.transactionCount, 0);
});

test("CURRENT186 apply rejects every receipt boundary drift and legacy alias", async () => {
  const mutations = [
    (receipt) => {
      receipt.authorityScope = "CLUSTER_WIDE";
    },
    (receipt) => {
      receipt.crossDatabaseAuthorityControlled = true;
    },
    (receipt) => {
      receipt.futureCreatorDefaultPrivilegesControlled = true;
    },
    (receipt) => {
      receipt.applicationRoleAllowlistBound = true;
    },
    (receipt) => {
      receipt.productionApplyAuthorized = true;
    },
    (receipt) => {
      receipt.crossDatabase = false;
    },
  ];
  for (const mutate of mutations) {
    const { before, target } = beforeAndTarget();
    const adapter = new FakeAdapter({ catalogs: [before, before, target] });
    const query = adapter.query.bind(adapter);
    adapter.query = async (sql, parameters = []) => {
      const rows = await query(sql, parameters);
      if (sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EPOCH_APPEND_SQL) {
        mutate(rows[0].receipt);
      }
      return rows;
    };
    await assert.rejects(
      runIdentityMailDutyRoleDeploymentCurrent186({
        adapter,
        config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
        mode: "apply",
        receipt: null,
      }),
      (error) =>
        error?.code ===
        "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EPOCH_APPEND_FAILED",
    );
    assert.equal(adapter.epoch, null);
    assert.deepEqual(adapter.committedStatements, []);
  }
});

test("CURRENT186 apply is atomic under injected DDL failure", async () => {
  const { before } = beforeAndTarget();
  const adapter = new FakeAdapter({
    catalogs: [before, before],
    failOn: /^ALTER SCHEMA/u,
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    /injected transaction failure/u,
  );
  assert.deepEqual(adapter.committedStatements, []);
  assert.equal(adapter.epoch, null);
  assert.equal(adapter.events.includes("epoch-append"), false);
});

test("CURRENT186 apply rejects routine inventory drift in the final catalog", async () => {
  const { before, target } = beforeAndTarget();
  const drift = structuredClone(target);
  drift.userRoutineDefinitionCount += 1;
  drift.userRoutineDefinitionDigest = "6".repeat(64);
  const adapter = new FakeAdapter({ catalogs: [before, before, drift] });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_POSTCONDITION_FAILED",
  );
  assert.equal(adapter.transactionCount, 1);
  assert.deepEqual(adapter.committedStatements, []);
  assert.equal(adapter.epoch, null);
  assert.equal(adapter.events.includes("epoch-append"), false);
});

test("CURRENT186 stale epoch fails before catalog read or durable mutation", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const active = epochRow({
    ...digests,
    epoch: 1,
    operationId: "30000000-0000-4000-8000-000000000001",
    reasonCode: "APPLY",
  });
  const adapter = new FakeAdapter({ catalogs: [target], epoch: active });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_STALE_EPOCH",
  );
  assert.equal(adapter.events.includes("catalog"), false);
  assert.deepEqual(adapter.committedStatements, []);
});

test("CURRENT186 rollback restores the exact before image and appends N+1", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  const adapter = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [applied.target, applied.target, applied.before],
    epoch: applyEpoch,
  });
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture({
    expectedEpoch: 1,
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config,
    mode: "rollback",
    receipt: applied.receipt,
  });
  assert.equal(result.epoch, 2);
  assert.equal(adapter.epoch.reasonCode, "ROLLBACK");
  assert.equal(
    adapter.operationRecoveryRows.at(-1).beforeCatalogCanonicalJson,
    null,
  );
  assert.equal(
    JSON.parse(adapter.operationRecoveryRows.at(-1).payloadCanonicalJson)
      .beforeCatalogStorageProfile,
    null,
  );
  assert.equal(adapter.epoch.exactGrantsDigest, applyEpoch.exactGrantsDigest);
  assert.equal(
    result.restoredCatalogDigest,
    applied.receipt.beforeCatalogDigest,
  );
  assert.ok(
    adapter.committedStatements.includes(
      'GRANT EXECUTE ON ROUTINE public."unrelated_helper"(text) TO PUBLIC',
    ),
  );
  for (const statement of expectedSupportGrantStatements()) {
    assert.equal(
      adapter.committedStatements.includes(statement),
      false,
      statement,
    );
  }
  for (const relationIdentity of SUPPORT_RELATION_IDENTITIES) {
    assert.ok(
      adapter.committedStatements.includes(
        `REVOKE ALL PRIVILEGES ON TABLE ${relationIdentity} FROM "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
      ),
      relationIdentity,
    );
    assert.ok(
      adapter.committedStatements.includes(
        `REVOKE ALL PRIVILEGES (${supportColumnList(relationIdentity)}) ON TABLE ${relationIdentity} FROM "${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
      ),
      relationIdentity,
    );
  }
  for (const grantee of [
    "PUBLIC",
    `"${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner}"`,
  ]) {
    assert.ok(
      adapter.committedStatements.includes(
        `REVOKE ALL PRIVILEGES ON ROUTINE ${SUPPORT_ROUTINE_IDENTITY} FROM ${grantee}`,
      ),
      grantee,
    );
  }
  assertNoBroadSupportGrant(adapter.committedStatements);
});

test("CURRENT186 rollback accepts the real PostgreSQL query result envelope", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  const adapter = new EnvelopeFakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [applied.target, applied.target, applied.before],
    epoch: applyEpoch,
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 1,
    }),
    mode: "rollback",
    receipt: applied.receipt,
  });
  assert.equal(result.epoch, 2);
  assert.equal(adapter.epoch.reasonCode, "ROLLBACK");
  assert.equal(
    adapter.events.filter((entry) => entry === "public-routine-binding-read")
      .length,
    2,
  );
});

test("CURRENT186 emergency records final contained state and never drops roles", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  const contained = containedCatalog(applied.target);
  const adapter = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [applied.before, contained],
    epoch: applyEpoch,
  });
  const emergencyConfig = identityMailDutyRoleDeploymentCurrent186ConfigFixture(
    {
      expectedEpoch: 1,
    },
  );
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: emergencyConfig,
    mode: "emergency",
    receipt: null,
  });
  const containedDigests =
    identityMailDutyRoleCatalogCurrent186ActualDigests(contained);
  assert.equal(adapter.epoch.reasonCode, "EMERGENCY_CONTAINMENT");
  assert.equal(
    adapter.operationRecoveryRows.at(-1).beforeCatalogCanonicalJson,
    null,
  );
  assert.equal(
    JSON.parse(adapter.operationRecoveryRows.at(-1).payloadCanonicalJson)
      .beforeCatalogStorageProfile,
    null,
  );
  assert.equal(adapter.epoch.catalogDigest, containedDigests.catalogDigest);
  assert.equal(
    adapter.epoch.ownerSurfaceDigest,
    containedDigests.ownerSurfaceDigest,
  );
  assert.equal(adapter.epoch.exactGrantsDigest, applyEpoch.exactGrantsDigest);
  assert.equal(result.finalCatalogDigest, containedDigests.catalogDigest);
  assert.match(
    adapter.committedStatements.join("\n"),
    /ALTER ROLE .* NOLOGIN/u,
  );
  assert.ok(
    adapter.committedStatements.some((statement) =>
      /^GRANT ALL PRIVILEGES ON ROUTINE public\."identity_mail_duty_role_acl_lock_v1"\(\) TO "[^"]+" WITH GRANT OPTION$/u.test(
        statement,
      ),
    ),
    "emergency containment must retain the NOLOGIN owner capability required by the append RPC chain",
  );
  assert.doesNotMatch(adapter.committedStatements.join("\n"), /DROP ROLE/iu);
  assert.ok(
    adapter.events.indexOf("catalog") < adapter.events.indexOf("epoch-append"),
  );
  assert.ok(
    adapter.events.lastIndexOf("catalog") <
      adapter.events.indexOf("epoch-append"),
  );
  assert.ok(
    adapter.events.indexOf("transaction-commit") <
      adapter.events.indexOf("terminate-runtime"),
  );
  assert.equal(
    adapter.epoch.planDigest,
    expectedEmergencyPlanDigest(emergencyConfig),
  );
});

test("CURRENT186 emergency drains after phase-one commit and retries remaining sessions", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const active = epochRow({
    ...digests,
    epoch: 1,
    operationId: "31000000-0000-4000-8000-000000000001",
    reasonCode: "APPLY",
  });
  const contained = containedCatalog(target);
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture({
    expectedEpoch: 1,
    operationId: "31000000-0000-4000-8000-000000000002",
  });
  const adapter = new FakeAdapter({
    authorizedEpoch: active,
    catalogs: [target, contained],
    epoch: active,
    remainingSessionCounts: [1, 0],
    terminationBatches: [[{ terminated: true }], [{ terminated: true }]],
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config,
    mode: "emergency",
    receipt: null,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_EMERGENCY_CONTAINED");
  assert.equal(
    adapter.events.filter((event) => event === "terminate-runtime").length,
    2,
  );
  assert.ok(
    adapter.events.indexOf("transaction-commit") <
      adapter.events.indexOf("terminate-runtime"),
  );
  assert.equal(adapter.epoch.planDigest, expectedEmergencyPlanDigest(config));
});

test("CURRENT186 emergency recovers a lost phase-one commit idempotently and appends one epoch", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const active = epochRow({
    ...digests,
    epoch: 1,
    operationId: "31100000-0000-4000-8000-000000000001",
    reasonCode: "APPLY",
  });
  const contained = containedCatalog(target);
  const config = identityMailDutyRoleDeploymentCurrent186ConfigFixture({
    expectedEpoch: 1,
    operationId: "31100000-0000-4000-8000-000000000002",
  });
  const adapter = new FakeAdapter({
    authorizedEpoch: active,
    catalogs: [target, contained],
    epoch: active,
    lostCommitTransactions: [1],
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config,
    mode: "emergency",
    receipt: null,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_EMERGENCY_CONTAINED");
  assert.equal(result.epoch, 2);
  assert.equal(adapter.epoch.epoch, "2");
  assert.equal(adapter.transactionCount, 3);
  assert.equal(
    adapter.events.filter((event) => event === "emergency-identity").length,
    2,
  );
  assert.equal(
    adapter.events.filter((event) => event === "epoch-append").length,
    1,
  );
  assert.equal(
    adapter.events
      .slice(0, adapter.events.indexOf("terminate-runtime"))
      .filter(
        (event) =>
          event === 'execute:ALTER ROLE "identity_mail_worker_v2" NOLOGIN',
      ).length,
    2,
  );
  assert.equal(
    adapter.events.filter((event) => event === "transaction-response-lost")
      .length,
    1,
  );
  for (let offset = 0; offset < 2; offset += 1) {
    const identityIndex = adapter.events.indexOf(
      "emergency-identity",
      offset === 0 ? 0 : adapter.events.indexOf("emergency-identity") + 1,
    );
    const lockIndex = adapter.events.lastIndexOf("lock", identityIndex);
    const epochReadIndex = adapter.events.lastIndexOf(
      "epoch-read",
      identityIndex,
    );
    assert.ok(lockIndex >= 0 && lockIndex < epochReadIndex);
    assert.ok(epochReadIndex < identityIndex);
  }
});

test("CURRENT186 emergency contains on a stale expectedEpoch but never records a false epoch", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const active = epochRow({
    ...digests,
    epoch: 2,
    operationId: "31200000-0000-4000-8000-000000000001",
    reasonCode: "APPLY",
  });
  const adapter = new FakeAdapter({
    authorizedEpoch: active,
    catalogs: [target, containedCatalog(target)],
    epoch: active,
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 1,
      operationId: "31200000-0000-4000-8000-000000000002",
    }),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED");
  assert.equal(result.phase1Committed, true);
  assert.equal(
    result.reasonCode,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_EMERGENCY_EPOCH_UNAVAILABLE",
  );
  assert.equal(adapter.epoch.epoch, "2");
  assert.equal(adapter.events.includes("terminate-runtime"), true);
  assert.equal(adapter.events.includes("epoch-append"), false);
  assert.match(adapter.committedStatements.join("\n"), /NOLOGIN/u);
});

test("CURRENT186 emergency returns UNCONFIRMED after three lost phase-one responses and stops", async () => {
  const adapter = new FakeAdapter({ lostCommitTransactions: [1, 2, 3] });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(
    result.decision,
    "CURRENT186_DUTY_ROLE_EMERGENCY_PHASE1_UNCONFIRMED",
  );
  assert.equal(result.phase1CommitState, "UNCONFIRMED");
  assert.equal(result.phase1Attempts, 3);
  assert.equal(Object.hasOwn(result, "phase1Committed"), false);
  assert.equal(adapter.transactionCount, 3);
  assert.equal(adapter.events.includes("terminate-runtime"), false);
  assert.equal(adapter.events.includes("epoch-append"), false);
  assert.equal(adapter.epoch, null);
  assert.equal(
    adapter.events.filter((event) => event === "transaction-response-lost")
      .length,
    3,
  );
});

test("CURRENT186 emergency treats any false termination result as unattested", async () => {
  const adapter = new FakeAdapter({
    remainingSessionCounts: [0],
    terminationBatches: [[{ terminated: false }]],
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED");
  assert.equal(result.phase1Committed, true);
  assert.equal(
    result.reasonCode,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TERMINATE_RESULT_FALSE",
  );
  assert.equal(adapter.transactionCount, 1);
  assert.equal(adapter.events.includes("epoch-append"), false);
  assert.equal(adapter.epoch, null);
});

test("CURRENT186 emergency times out with no epoch while sessions remain", async () => {
  const adapter = new FakeAdapter({
    remainingSessionCounts: [1],
    terminationBatches: [[{ terminated: true }]],
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED");
  assert.equal(result.phase1Committed, true);
  assert.equal(
    result.reasonCode,
    "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_RUNTIME_SESSION_DRAIN_TIMEOUT",
  );
  assert.equal(
    adapter.events.filter((event) => event === "terminate-runtime").length,
    20,
  );
  assert.equal(adapter.events.includes("epoch-append"), false);
  assert.equal(adapter.epoch, null);
});

test("CURRENT186 strict membership containment is atomic in phase one", async () => {
  const adapter = new FakeAdapter({
    failOn: /DO \$current186_membership_containment\$/u,
  });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(
    result.decision,
    "CURRENT186_DUTY_ROLE_EMERGENCY_PHASE1_UNCONFIRMED",
  );
  assert.equal(result.phase1Attempts, 3);
  assert.equal(result.phase1CommitState, "UNCONFIRMED");
  assert.equal(Object.hasOwn(result, "phase1Committed"), false);
  assert.equal(adapter.transactionCount, 3);
  assert.deepEqual(adapter.committedStatements, []);
  assert.equal(adapter.events.includes("terminate-runtime"), false);
  assert.equal(adapter.events.includes("epoch-append"), false);
});

test("CURRENT186 typed phase-one contract failure is never retried", async () => {
  const adapter = new FakeAdapter({
    failError: new IdentityMailDutyRoleDeploymentCurrent186Error(
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TEST_TYPED_FAILURE",
    ),
    failOn: /DO \$current186_membership_containment\$/u,
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "emergency",
      receipt: null,
    }),
    (error) =>
      error?.reasonCode ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TEST_TYPED_FAILURE",
  );
  assert.equal(adapter.transactionCount, 1);
  assert.deepEqual(adapter.committedStatements, []);
  assert.equal(adapter.events.includes("terminate-runtime"), false);
  assert.equal(adapter.events.includes("epoch-append"), false);
});

test("CURRENT186 emergency phase one rejects a torn lock/read epoch before identity or containment", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const adapter = new FakeAdapter({
    epoch: epochRow({
      ...digests,
      epoch: 1,
      operationId: "31300000-0000-4000-8000-000000000001",
      reasonCode: "APPLY",
    }),
  });
  const query = adapter.query.bind(adapter);
  adapter.query = async (sql, parameters = []) =>
    sql === IDENTITY_MAIL_DUTY_ROLE_CURRENT186_ACL_LOCK_SQL
      ? [{ epoch: "0" }]
      : query(sql, parameters);
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "emergency",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_TORN_EPOCH",
  );
  assert.equal(adapter.transactionCount, 1);
  assert.equal(adapter.events.includes("emergency-identity"), false);
  assert.deepEqual(adapter.committedStatements, []);
});

test("CURRENT186 repeated emergency appends only after healthy containment", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const active = epochRow({
    ...digests,
    epoch: 1,
    operationId: "32000000-0000-4000-8000-000000000001",
    reasonCode: "APPLY",
  });
  const contained = containedCatalog(target);
  const adapter = new FakeAdapter({
    authorizedEpoch: active,
    catalogs: [target, contained],
    epoch: active,
  });
  const first = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 1,
      operationId: "32000000-0000-4000-8000-000000000002",
    }),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(first.epoch, 2);

  adapter.catalogs = [contained, contained];
  const second = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 2,
      operationId: "32000000-0000-4000-8000-000000000003",
    }),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(second.decision, "CURRENT186_DUTY_ROLE_EMERGENCY_CONTAINED");
  assert.equal(second.epoch, 3);
  assert.equal(Number(adapter.epoch.epoch), 3);

  adapter.terminationBatches = [[{ terminated: false }]];
  const third = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 3,
      operationId: "32000000-0000-4000-8000-000000000004",
    }),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(third.decision, "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED");
  assert.equal(Number(adapter.epoch.epoch), 3);
});

test("CURRENT186 apply after emergency NOLOGIN state blocks before DDL", async () => {
  const { target } = beforeAndTarget();
  const adapter = new FakeAdapter({ catalogs: [containedCatalog(target)] });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_PREFLIGHT_BLOCKED",
  );
  assert.equal(adapter.transactionCount, 0);
  assert.deepEqual(adapter.committedStatements, []);
});

test("CURRENT186 attest is locked and supports active and inactive epochs", async () => {
  const { target } = beforeAndTarget();
  const digests = identityMailDutyRoleCatalogCurrent186TargetDigests(target);
  const active = epochRow({
    ...digests,
    epoch: 1,
    operationId: "30000000-0000-4000-8000-000000000001",
    reasonCode: "APPLY",
  });
  const activeAdapter = new FakeAdapter({
    authorizedEpoch: active,
    catalogs: [target],
    epoch: active,
  });
  const activeResult = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter: activeAdapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 1,
    }),
    mode: "attest",
    receipt: null,
  });
  assert.equal(
    activeResult.decision,
    "CURRENT186_DUTY_ROLE_DEPLOYMENT_ATTESTED",
  );
  assert.equal(
    activeAdapter.events.filter((event) => event === "epoch-read").length,
    2,
  );
  assert.ok(
    activeAdapter.events.indexOf("lock") <
      activeAdapter.events.indexOf("catalog"),
  );

  const contained = structuredClone(target);
  contained.roles.schemaOwner.canLogin = false;
  contained.roles.coordinator.canLogin = false;
  contained.roles.worker.canLogin = false;
  const dutyRoleOids = new Set(
    Object.values(contained.roles).map((role) => role.oid),
  );
  for (const object of contained.objects) {
    object.acls = object.acls.filter(
      (entry) => !dutyRoleOids.has(entry.granteeOid),
    );
  }
  contained.effectivePrivileges = contained.effectivePrivileges.filter(
    (entry) => entry.objectKind === "SCHEMA",
  );
  contained.directAuthorities = contained.directAuthorities.filter(
    (entry) => !dutyRoleOids.has(entry.granteeOid),
  );
  const containedDigests =
    identityMailDutyRoleCatalogCurrent186ActualDigests(contained);
  const emergency = epochRow({
    catalogDigest: containedDigests.catalogDigest,
    epoch: 2,
    exactGrantsDigest: active.exactGrantsDigest,
    operationId: "30000000-0000-4000-8000-000000000002",
    ownerSurfaceDigest: containedDigests.ownerSurfaceDigest,
    reasonCode: "EMERGENCY_CONTAINMENT",
  });
  const inactiveAdapter = new FakeAdapter({
    authorizedEpoch: active,
    catalogs: [contained],
    epoch: emergency,
  });
  const inactive = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter: inactiveAdapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
      expectedEpoch: 2,
    }),
    mode: "attest",
    receipt: null,
  });
  assert.equal(inactive.decision, "CURRENT186_DUTY_ROLE_CONTAINMENT_ATTESTED");
  assert.equal(inactive.lastAuthorizedEpoch.epoch, 1);
});

test("CURRENT186 rollback receipt is exact data-only before transaction entry", async () => {
  const applied = await applyFixture();
  const adapter = new FakeAdapter({ epoch: applied.adapter.epoch });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: new Proxy(applied.receipt, {}),
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
  );
  assert.equal(adapter.transactionCount, 0);

  const accessor = structuredClone(applied.receipt);
  Object.defineProperty(accessor, "operationId", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: accessor,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
  );
  assert.equal(adapter.transactionCount, 0);

  const symbol = structuredClone(applied.receipt);
  symbol[Symbol("unexpected")] = true;
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: symbol,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
  );
  assert.equal(adapter.transactionCount, 0);
});

test("CURRENT186 apply rejects a bystander before and after lock without DDL", async () => {
  const { before } = beforeAndTarget();
  const bystander = structuredClone(before);
  bystander.objects
    .find((entry) => entry.kind === "RELATION")
    .acls.push({
      granteeName: 'Outside "QA" Operator',
      granteeOid: 8_888,
      grantorName: bystander.database.ownerName,
      grantorOid: bystander.database.ownerOid,
      isGrantable: false,
      privilege: "SELECT",
    });

  const preflight = new FakeAdapter({ catalogs: [bystander] });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: preflight,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_PREFLIGHT_BLOCKED",
  );
  assert.equal(preflight.transactionCount, 0);
  assert.deepEqual(preflight.committedStatements, []);

  const locked = new FakeAdapter({ catalogs: [before, bystander] });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: locked,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
      mode: "apply",
      receipt: null,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_LOCKED_PREFLIGHT_BLOCKED",
  );
  assert.equal(locked.transactionCount, 1);
  assert.deepEqual(locked.committedStatements, []);
  assert.equal(locked.events.includes("epoch-append"), false);
});

test("CURRENT186 rollback recomputes the receipt core and plan before DB access", async () => {
  const applied = await applyFixture();
  const tampered = structuredClone(applied.receipt);
  tampered.beforeCatalog.roles.coordinator.canLogin = false;
  tampered.beforeCatalogDigest = identityMailDutyRoleCatalogCurrent186Digest(
    tampered.beforeCatalog,
  );
  const rebuiltPlan = buildIdentityMailDutyRoleDeploymentCurrent186Plan(
    tampered.beforeCatalog,
    tampered.applyConfig,
  );
  const rebuiltTarget = identityMailDutyRoleCatalogCurrent186TargetDigests(
    tampered.beforeCatalog,
  );
  tampered.planDigest = rebuiltPlan.planDigest;
  tampered.targetCatalogDigest = rebuiltTarget.catalogDigest;
  tampered.targetDefinitionManifestDigest =
    rebuiltTarget.definitionManifestDigest;
  tampered.targetExactGrantsDigest = rebuiltTarget.exactGrantsDigest;
  tampered.targetOwnerSurfaceDigest = rebuiltTarget.ownerSurfaceDigest;
  const adapter = new FakeAdapter({ epoch: applied.adapter.epoch });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: tampered,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_RECEIPT_INVALID",
  );
  assert.equal(adapter.transactionCount, 0);
  assert.deepEqual(adapter.events, []);
});

test("CURRENT186 rollback blocks rogue or recreated principals and definition drift before DDL", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  for (const [label, mutate] of [
    [
      "named table principal",
      (catalog) => {
        catalog.objects
          .find(
            (entry) =>
              entry.kind === "RELATION" &&
              entry.identity === 'public."IdentityEmailClaim"',
          )
          .acls.push({
            granteeName: QUOTED_BYSTANDER_NAME,
            granteeOid: QUOTED_BYSTANDER_OID,
            grantorName: catalog.database.ownerName,
            grantorOid: catalog.database.ownerOid,
            isGrantable: false,
            privilege: "SELECT",
          });
      },
    ],
    [
      "same-name recreated principal with a different OID",
      (catalog) => {
        catalog.objects
          .find(
            (entry) =>
              entry.kind === "RELATION" &&
              entry.identity === 'public."IdentityEmailClaim"',
          )
          .acls.push({
            granteeName: QUOTED_BYSTANDER_NAME,
            granteeOid: QUOTED_BYSTANDER_OID + 1,
            grantorName: catalog.database.ownerName,
            grantorOid: catalog.database.ownerOid,
            isGrantable: false,
            privilege: "SELECT",
          });
      },
    ],
    [
      "named exact-column principal",
      (catalog) => {
        catalog.directAuthorities.push({
          granteeName: QUOTED_BYSTANDER_NAME,
          granteeOid: QUOTED_BYSTANDER_OID,
          grantorName: catalog.database.ownerName,
          grantorOid: catalog.database.ownerOid,
          isGrantable: false,
          objectIdentity: 'public."Tenant"."id"',
          objectKind: "COLUMN",
          privilege: "SELECT",
          source: "ACL",
        });
      },
    ],
    [
      "exact duty role with a non-owner grantor",
      (catalog) => {
        const relation = catalog.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."IdentityMailDutyRoleAclEpochV1"',
        );
        relation.acls.push({
          granteeName: catalog.roles.worker.name,
          granteeOid: catalog.roles.worker.oid,
          grantorName: catalog.database.ownerName,
          grantorOid: catalog.database.ownerOid,
          isGrantable: false,
          privilege: "SELECT",
        });
      },
    ],
    [
      "exact duty role with grant option",
      (catalog) => {
        const relation = catalog.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."IdentityMailDutyRoleAclEpochV1"',
        );
        relation.acls.push({
          granteeName: catalog.roles.worker.name,
          granteeOid: catalog.roles.worker.oid,
          grantorName: relation.ownerName,
          grantorOid: relation.ownerOid,
          isGrantable: true,
          privilege: "SELECT",
        });
      },
    ],
    [
      "default-derived direct duty authority",
      (catalog) => {
        const relation = catalog.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."IdentityMailDutyRoleAclEpochV1"',
        );
        catalog.directAuthorities.push({
          granteeName: catalog.roles.worker.name,
          granteeOid: catalog.roles.worker.oid,
          grantorName: relation.ownerName,
          grantorOid: relation.ownerOid,
          isGrantable: false,
          objectIdentity: relation.identity,
          objectKind: "RELATION",
          privilege: "SELECT",
          source: "ACL_DEFAULT",
        });
      },
    ],
    [
      "exact duty grant on a non-support protected column",
      (catalog) => {
        const relation = catalog.objects.find(
          (entry) =>
            entry.kind === "RELATION" &&
            entry.identity === 'public."IdentityEmailClaim"',
        );
        catalog.directAuthorities.push({
          granteeName: catalog.roles.worker.name,
          granteeOid: catalog.roles.worker.oid,
          grantorName: relation.ownerName,
          grantorOid: relation.ownerOid,
          isGrantable: false,
          objectIdentity: 'public."IdentityEmailClaim"."createdAt"',
          objectKind: "COLUMN",
          privilege: "SELECT",
          source: "ACL",
        });
      },
    ],
    [
      "effective privilege without a repairable direct source",
      (catalog) => {
        catalog.effectivePrivileges.push({
          objectIdentity: 'public."IdentityMailDutyRoleAclEpochV1"',
          objectKind: "RELATION",
          privilege: "SELECT",
          roleName: catalog.roles.worker.name,
          roleOid: catalog.roles.worker.oid,
        });
      },
    ],
  ]) {
    const rogue = structuredClone(applied.target);
    mutate(rogue);
    const adapter = new FakeAdapter({
      authorizedEpoch: applyEpoch,
      catalogs: [rogue],
      epoch: applyEpoch,
    });
    await assert.rejects(
      runIdentityMailDutyRoleDeploymentCurrent186({
        adapter,
        config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
          expectedEpoch: 1,
        }),
        mode: "rollback",
        receipt: applied.receipt,
      }),
      (error) => error instanceof IdentityMailDutyRoleDeploymentCurrent186Error,
      label,
    );
    assert.equal(adapter.transactionCount, 0, label);
    assert.deepEqual(adapter.committedStatements, [], label);
    assert.deepEqual(adapter.epoch, applyEpoch, label);
  }

  const definitionDrift = structuredClone(applied.target);
  definitionDrift.definitionManifest[0].definitionSha256 = "f".repeat(64);
  definitionDrift.definitionManifestDigest =
    identityMailDutyRoleDefinitionManifestCurrent186Digest(
      definitionDrift.definitionManifest,
    );
  const blocked = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [definitionDrift],
    epoch: applyEpoch,
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: blocked,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: applied.receipt,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_IDENTITY_MISMATCH",
  );
  assert.equal(blocked.transactionCount, 0);
  assert.deepEqual(blocked.committedStatements, []);
});

test("CURRENT186 rollback blocks support-column attnum drift as non-ACL object identity drift", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  const drift = structuredClone(applied.target);
  drift.supportColumnBindings[0].attributeNumber += 100;
  const adapter = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [drift],
    epoch: applyEpoch,
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: applied.receipt,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
  );
  assert.equal(adapter.transactionCount, 0);
  assert.deepEqual(adapter.committedStatements, []);
  assert.deepEqual(adapter.epoch, applyEpoch);
});

test("CURRENT186 rollback blocks user-routine create, drop or definition drift before and under lock", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  const drift = structuredClone(applied.target);
  drift.userRoutineDefinitionCount += 1;
  drift.userRoutineDefinitionDigest = "7".repeat(64);

  const preflight = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [drift],
    epoch: applyEpoch,
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: preflight,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: applied.receipt,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
  );
  assert.equal(preflight.transactionCount, 0);
  assert.deepEqual(preflight.committedStatements, []);

  const locked = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [applied.target, drift],
    epoch: applyEpoch,
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: locked,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: applied.receipt,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
  );
  assert.equal(locked.transactionCount, 1);
  assert.deepEqual(locked.committedStatements, []);
  assert.deepEqual(locked.epoch, applyEpoch);
});

test("CURRENT186 rollback revalidates removed PUBLIC routine bindings before and under lock", async () => {
  const applied = await applyFixture();
  const applyEpoch = structuredClone(applied.adapter.epoch);
  const expectedBindings = publicRoutineBindingRows(applied.before);
  assert.equal(expectedBindings.length, 1);
  const recreatedBindings = structuredClone(expectedBindings);
  recreatedBindings[0].oid = String(Number(recreatedBindings[0].oid) + 1);

  const preflight = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [applied.target],
    epoch: applyEpoch,
    publicRoutineBindingBatches: [recreatedBindings],
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: preflight,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: applied.receipt,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
  );
  assert.equal(preflight.transactionCount, 0);
  assert.deepEqual(preflight.committedStatements, []);

  const locked = new FakeAdapter({
    authorizedEpoch: applyEpoch,
    catalogs: [applied.target, applied.target],
    epoch: applyEpoch,
    publicRoutineBindingBatches: [expectedBindings, recreatedBindings],
  });
  await assert.rejects(
    runIdentityMailDutyRoleDeploymentCurrent186({
      adapter: locked,
      config: identityMailDutyRoleDeploymentCurrent186ConfigFixture({
        expectedEpoch: 1,
      }),
      mode: "rollback",
      receipt: applied.receipt,
    }),
    (error) =>
      error?.code ===
      "IDENTITY_MAIL_DUTY_ROLE_DEPLOYMENT_CURRENT186_ROLLBACK_NON_ACL_DRIFT",
  );
  assert.equal(locked.transactionCount, 1);
  assert.deepEqual(locked.committedStatements, []);
  assert.deepEqual(locked.epoch, applyEpoch);
});

test("CURRENT186 emergency commits phase one before unhealthy evidence handling", async () => {
  const adapter = new FakeAdapter({ catalogs: [] });
  const result = await runIdentityMailDutyRoleDeploymentCurrent186({
    adapter,
    config: identityMailDutyRoleDeploymentCurrent186ConfigFixture(),
    mode: "emergency",
    receipt: null,
  });
  assert.equal(result.decision, "CURRENT186_DUTY_ROLE_CONTAINED_UNATTESTED");
  assert.equal(result.phase1Committed, true);
  assert.equal(adapter.transactionCount, 2);
  assert.match(adapter.committedStatements.join("\n"), /NOLOGIN/u);
  assert.match(adapter.committedStatements.join("\n"), /REVOKE CONNECT/u);
  assert.equal(adapter.events.includes("terminate-runtime"), true);
  assert.equal(adapter.events.includes("epoch-append"), false);
  assert.equal(result.authorityScope, "CURRENT_DATABASE_ONLY");
  assert.equal(result.crossDatabaseAuthorityControlled, false);
  assert.equal(result.futureCreatorDefaultPrivilegesControlled, false);
  assert.equal(result.applicationRoleAllowlistBound, false);
  assert.equal(result.productionApplyAuthorized, false);
});

test("CURRENT186 source has no role creation, role drop, network or unsafe logging", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-duty-role-deployment-current186.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /CREATE ROLE|DROP ROLE|password|credential/iu);
  assert.doesNotMatch(source, /ALTER ROLE[^\n;]*\sLOGIN(?:\s|;|$)/iu);
  assert.doesNotMatch(source, /console\.|fetch\(|https?:\/\//iu);
  assert.match(source, /identity_mail_duty_role_acl_lock_v1/u);
  assert.match(source, /SET LOCAL ROLE NONE/u);
  assert.doesNotMatch(source, /RESET ROLE/u);
  assert.match(source, /SET LOCAL lock_timeout = '60s'/u);
  assert.match(source, /SET LOCAL statement_timeout = '90s'/u);
  assert.doesNotMatch(source, /SET LOCAL statement_timeout = '30s'/u);
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EMERGENCY_IDENTITY_SQL,
    /AS current_role_entry[\s\S]+current_role_entry\.rolname = CURRENT_USER/u,
  );
  assert.doesNotMatch(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EMERGENCY_IDENTITY_SQL,
    /AS current_role(?:\s|$)|current_role\./u,
  );
  assert.doesNotMatch(source, /beforeCatalogCanonicalJsonHex/u);
  assert.doesNotMatch(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /pg_namespace AS namespace_entry/u,
  );
  assert.doesNotMatch(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /ON ALL (?:TABLES|SEQUENCES|ROUTINES) IN SCHEMA/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /pg_catalog\.aclexplode\(relation_catalog\.relacl\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /pg_catalog\.aclexplode\(routine_catalog\.proacl\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /JOIN pg_catalog\.pg_class AS relation_catalog\s+ON relation_catalog\.oid = attribute_entry\.attrelid/u,
  );
  assert.doesNotMatch(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /JOIN pg_catalog\.pg_class AS relation_entry\s+ON relation_entry\.oid = attribute_entry\.attrelid/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_EXHAUSTIVE_CONTAINMENT_SQL,
    /FROM \(\s+SELECT 'LANGUAGE'[\s\S]+\) AS authority_catalog\s+ORDER BY authority_catalog\.object_kind COLLATE "C"/u,
  );
});

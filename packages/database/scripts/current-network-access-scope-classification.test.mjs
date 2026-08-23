import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import {
  ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
  ACCESS_SCOPE_TARGET_CONTRACT,
  AccessScopeClassificationError,
  accessScopeClassificationInternals,
  assertAccessScopeRestoredCopyDatabaseUrl,
  buildAccessScopeClassificationPlan,
  canonicalJson,
  checkAccessScopeClassification,
  createAccessScopeDetachedApproval,
  createAccessScopeInventory,
  executeAccessScopeClassification,
  parseAccessScopeHmacKey,
  readAccessScopeJsonFile,
  writeAccessScopeReceiptExclusive,
} from "./current-network-access-scope-classification.mjs";
import { parseAccessScopeCliArguments } from "./current-network-access-scope-classification.cli.mjs";

const HMAC_KEY = Buffer.from(
  "00112233445566778899aabbccddeeffffeeddccbbaa99887766554433221100",
  "hex",
);
const TENANT_ID = "tenant-sensitive-raw-id";
const STORE_IDS = [
  "00000000-0000-4000-8000-000000000101",
  "00000000-0000-4000-8000-000000000102",
  "00000000-0000-4000-8000-000000000103",
  "00000000-0000-4000-8000-000000000104",
];
const USER_IDS = [
  "sensitive-owner-user-id",
  "sensitive-admin-user-id",
  "sensitive-manager-user-id",
  "sensitive-standards-user-id",
  "sensitive-platform-user-id",
];
const ACCESS_ROW_ID = "00000000-0000-4000-8000-000000000201";
const PLANNED_ACCESS_ID = "00000000-0000-4000-8000-000000000202";
const TARGET = Object.freeze({
  contractVersion: ACCESS_SCOPE_TARGET_CONTRACT,
  databaseName: "leetplus_scope_fixture",
  expectedSystemIdentifier: "7483920183746509217",
  host: "127.0.0.1",
  mode: "RESTORED_COPY",
  port: 55449,
  roleName: "leetplus_scope_writer",
});
const CAPTURED_AT = new Date("2026-08-21T08:00:00.000Z");
const PLANNED_AT = new Date("2026-08-21T08:05:00.000Z");
const APPROVED_AT = new Date("2026-08-21T08:10:00.000Z");
const PG_E2E_CONFIRMATION =
  "RUN_CURRENT_NETWORK_ACCESS_SCOPE_CLASSIFICATION_PG_E2E";
const PG_E2E_DATABASE = "leetplus_scope_lock_e2e";
const PG_E2E_WRITER = "leetplus_scope_writer";
const PG_E2E_LOCK_OWNER = "leetplus_scope_lock_owner";
const PG_E2E_ACL_HELPER = "leetplus_scope_acl_helper";
const PG_E2E_ACL_THIRD = "leetplus_scope_acl_third";
const PG_E2E_WRITER_PASSWORD =
  "current-network-scope-writer-e2e-password-2026";

function pgE2eEnabled() {
  return (
    process.env.ACCESS_SCOPE_CLASSIFICATION_PG_E2E_CONFIRM ===
    PG_E2E_CONFIRMATION
  );
}

function pgE2eAdminUrl() {
  const raw = process.env.ACCESS_SCOPE_CLASSIFICATION_PG_E2E_ADMIN_DATABASE_URL;
  assert.equal(typeof raw, "string");
  const parsed = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(Number(parsed.port), 5432);
  assert.equal(decodeURIComponent(parsed.pathname), "/postgres");
  assert.equal(decodeURIComponent(parsed.username), "postgres");
  assert.ok(decodeURIComponent(parsed.password).length >= 8);
  assert.equal(parsed.search, "");
  assert.equal(parsed.hash, "");
  return parsed;
}

function databaseUrl(base, { database, password, role }) {
  const result = new URL(base);
  result.pathname = `/${database}`;
  result.username = role;
  result.password = password;
  return result.toString();
}

async function connectPg(connectionString, applicationName) {
  const client = new pg.Client({
    application_name: applicationName,
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });
  await client.connect();
  return client;
}

async function installPgLockFixture(client) {
  await client.query(`
    CREATE TYPE public."UserRole" AS ENUM (
      'OWNER', 'CLUB_ADMINISTRATOR', 'MANAGER', 'STANDARDS_MANAGER'
    );
    CREATE TYPE public."UserAccessScope" AS ENUM ('NETWORK', 'STORES');
    CREATE TABLE public."Tenant" (
      "id" TEXT PRIMARY KEY
    );
    CREATE TABLE public."Store" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL
    );
    CREATE TABLE public."User" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "fullName" TEXT,
      "role" public."UserRole" NOT NULL,
      "accessScope" public."UserAccessScope",
      "customRoleId" TEXT,
      "isActive" BOOLEAN NOT NULL,
      "isPlatformAdmin" BOOLEAN NOT NULL,
      "emailVerifiedAt" TIMESTAMPTZ,
      "identityClaimRevision" INTEGER,
      "createdAt" TIMESTAMPTZ NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE public."UserStoreAccess" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE public."PlatformAdminAuditEvent" (
      "id" TEXT PRIMARY KEY,
      "tenantId" TEXT NOT NULL,
      "actorUserId" TEXT,
      "requestId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "reason" TEXT NOT NULL,
      "before" JSONB NOT NULL,
      "after" JSONB NOT NULL,
      "metadata" JSONB NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL
    );
    CREATE SCHEMA extra_schema AUTHORIZATION postgres;
    CREATE TABLE extra_schema.secret (id TEXT PRIMARY KEY, marker TEXT);
  `);
  await client.query(`
    DO $fixture_acl$
    DECLARE
      candidate RECORD;
    BEGIN
      FOR candidate IN
        SELECT namespace.nspname AS schema_name
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND namespace.nspname NOT LIKE 'pg_temp_%'
        ORDER BY namespace.nspname
      LOOP
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON SCHEMA %I FROM PUBLIC', candidate.schema_name
        );
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC',
          candidate.schema_name
        );
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC',
          candidate.schema_name
        );
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC',
          candidate.schema_name
        );
      END LOOP;
      FOR candidate IN
        SELECT namespace.nspname AS schema_name, type_row.typname AS type_name
        FROM pg_catalog.pg_type AS type_row
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = type_row.typnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND namespace.nspname NOT LIKE 'pg_toast%'
          AND namespace.nspname NOT LIKE 'pg_temp_%'
          AND type_row.typisdefined
          AND type_row.typtype IN ('b', 'c', 'd', 'e', 'm', 'r')
          AND NOT (type_row.typcategory = 'A' AND type_row.typelem <> 0)
        ORDER BY namespace.nspname, type_row.typname
      LOOP
        EXECUTE pg_catalog.format(
          'REVOKE ALL ON TYPE %I.%I FROM PUBLIC',
          candidate.schema_name, candidate.type_name
        );
      END LOOP;
    END
    $fixture_acl$;
  `);
  await client.query(`
    GRANT USAGE ON SCHEMA public TO ${PG_E2E_WRITER};
    GRANT USAGE ON TYPE public."UserAccessScope", public."UserRole"
      TO ${PG_E2E_WRITER};
    GRANT SELECT ("id") ON public."Tenant" TO ${PG_E2E_WRITER};
    GRANT SELECT ("id", "isActive") ON public."Store" TO ${PG_E2E_WRITER};
    GRANT SELECT (
      "id", "tenantId", "role", "accessScope", "isActive",
      "isPlatformAdmin", "updatedAt"
    ) ON public."User" TO ${PG_E2E_WRITER};
    GRANT SELECT ("id", "userId", "storeId", "createdAt")
      ON public."UserStoreAccess" TO ${PG_E2E_WRITER};
    GRANT SELECT (
      "action", "requestId", "targetType", "targetId", "reason",
      "before", "after", "metadata"
    ) ON public."PlatformAdminAuditEvent" TO ${PG_E2E_WRITER};
    GRANT UPDATE ("accessScope", "updatedAt") ON public."User"
      TO ${PG_E2E_WRITER};
    GRANT INSERT, DELETE ON public."UserStoreAccess" TO ${PG_E2E_WRITER};
    GRANT INSERT ON public."PlatformAdminAuditEvent" TO ${PG_E2E_WRITER};
    GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system()
      TO ${PG_E2E_WRITER};

    GRANT USAGE ON SCHEMA public TO ${PG_E2E_LOCK_OWNER};
    GRANT SELECT ("id"), UPDATE ("id") ON public."Tenant"
      TO ${PG_E2E_LOCK_OWNER};
    GRANT SELECT ("id", "tenantId"), UPDATE ("id") ON public."Store"
      TO ${PG_E2E_LOCK_OWNER};
    GRANT SELECT ("id", "tenantId"), UPDATE ("id") ON public."User"
      TO ${PG_E2E_LOCK_OWNER};
    GRANT SELECT ("id", "userId", "storeId"), UPDATE ("id")
      ON public."UserStoreAccess" TO ${PG_E2E_LOCK_OWNER};
  `);
  await client.query(`
    CREATE FUNCTION public.leetplus_current_network_access_scope_lock_v1(
      target_tenant_id TEXT
    ) RETURNS void
    LANGUAGE plpgsql
    VOLATILE
    PARALLEL UNSAFE
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS $trusted_lock$
${accessScopeClassificationInternals.trustedLockFunctionSource}
    $trusted_lock$;
    ALTER FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
      OWNER TO ${PG_E2E_LOCK_OWNER};
    REVOKE ALL
      ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
      FROM PUBLIC;
    GRANT EXECUTE
      ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
      TO ${PG_E2E_WRITER};
  `);
  await client.query(
    `INSERT INTO public."Tenant" ("id") VALUES ($1)`,
    [TENANT_ID],
  );
  for (const storeId of STORE_IDS) {
    await client.query(
      `INSERT INTO public."Store" ("id", "tenantId", "isActive")
       VALUES ($1, $2, TRUE)`,
      [storeId, TENANT_ID],
    );
  }
  await client.query(
    `INSERT INTO public."User" (
     "id", "tenantId", "email", "passwordHash", "role", "accessScope",
       "isActive", "isPlatformAdmin", "createdAt", "updatedAt"
     ) VALUES ($1, $2, 'opaque-fixture-address', 'opaque-fixture-secret', 'OWNER',
       NULL, TRUE, FALSE, clock_timestamp(), clock_timestamp())`,
    [USER_IDS[0], TENANT_ID],
  );
  await client.query(
    `INSERT INTO public."UserStoreAccess" ("id", "userId", "storeId", "createdAt")
     VALUES ($1, $2, $3, clock_timestamp())`,
    [ACCESS_ROW_ID, USER_IDS[0], STORE_IDS[0]],
  );
}

function targetIdentity() {
  return {
    canBypassRls: false,
    canCreateDb: false,
    canCreateRole: false,
    canInherit: false,
    canReplicate: false,
    controlSystemCanExecute: true,
    currentDatabase: TARGET.databaseName,
    currentUser: TARGET.roleName,
    databaseCanConnect: true,
    databaseCanCreate: false,
    databaseCanTemporary: false,
    isSuperuser: false,
    lockFunctionAclMissingCount: 0,
    lockFunctionAclUnexpectedCount: 0,
    lockFunctionCanExecute: true,
    lockFunctionConfigExact: true,
    lockFunctionExists: true,
    lockFunctionLanguage: "plpgsql",
    lockFunctionLeakproof: false,
    lockFunctionOwner:
      accessScopeClassificationInternals.trustedLockFunctionOwner,
    lockFunctionParallel: "u",
    lockFunctionReturnsVoid: true,
    lockFunctionSecurityDefiner: true,
    lockFunctionSource:
      accessScopeClassificationInternals.trustedLockFunctionSource,
    lockFunctionVolatile: "v",
    lockOwnerCanBypassRls: false,
    lockOwnerCanCreateDb: false,
    lockOwnerCanCreateRole: false,
    lockOwnerCanInherit: false,
    lockOwnerCanLogin: false,
    lockOwnerCanReplicate: false,
    lockOwnerIsSuperuser: false,
    lockOwnerMembershipCount: 0,
    lockOwnerMissingColumnGrantCount: 0,
    lockOwnerMissingEffectiveColumnGrantCount: 0,
    lockOwnerMissingSchemaGrantCount: 0,
    lockOwnerRoleConfigEmpty: true,
    lockOwnerRoleGrantedToMemberCount: 0,
    lockOwnerUnexpectedColumnGrantCount: 0,
    lockOwnerUnexpectedEffectiveColumnGrantCount: 0,
    lockOwnerUnexpectedOwnershipCount: 0,
    lockOwnerUnexpectedRoutineGrantCount: 0,
    lockOwnerUnexpectedSchemaGrantCount: 0,
    lockOwnerUnexpectedSequenceGrantCount: 0,
    lockOwnerUnexpectedTableGrantCount: 0,
    lockOwnerUnexpectedTypeGrantCount: 0,
    membershipCount: 0,
    missingEffectiveColumnPrivilegeCount: 0,
    missingEffectiveRelationPrivilegeCount: 0,
    missingEffectiveTypePrivilegeCount: 0,
    missingTableGrantCount: 0,
    missingUpdateColumnGrantCount: 0,
    otherSessionCount: 0,
    ownedExtraSchemaCount: 0,
    ownedExtraSchemaRelationCount: 0,
    ownedExtraSchemaRoutineCount: 0,
    ownedExtraSchemaTypeCount: 0,
    ownedPublicRelationCount: 0,
    ownedPublicRoutineCount: 0,
    ownedPublicTypeCount: 0,
    ownsDatabase: false,
    ownsPublicSchema: false,
    roleConfigEmpty: true,
    roleGrantedToMemberCount: 0,
    schemaCanCreate: false,
    schemaCanUse: true,
    serverAddress: TARGET.host,
    serverPort: TARGET.port,
    sessionUser: TARGET.roleName,
    systemIdentifier: TARGET.expectedSystemIdentifier,
    typeCanUse: true,
    unexpectedEffectiveColumnPrivilegeCount: 0,
    unexpectedEffectivePublicRoutineExecuteCount: 0,
    unexpectedEffectiveRelationPrivilegeCount: 0,
    unexpectedEffectiveSequencePrivilegeCount: 0,
    unexpectedEffectiveTypePrivilegeCount: 0,
    unexpectedExtraSchemaColumnPrivilegeCount: 0,
    unexpectedExtraSchemaPrivilegeCount: 0,
    unexpectedExtraSchemaRelationPrivilegeCount: 0,
    unexpectedExtraSchemaRoutinePrivilegeCount: 0,
    unexpectedExtraSchemaSequencePrivilegeCount: 0,
    unexpectedRoutineGrantCount: 0,
    unexpectedSequenceGrantCount: 0,
    unexpectedTableGrantCount: 0,
    unexpectedUpdateColumnGrantCount: 0,
    userSensitiveWriteGrantCount: 0,
  };
}

function sourceSnapshot() {
  const roles = [
    "OWNER",
    "CLUB_ADMINISTRATOR",
    "MANAGER",
    "STANDARDS_MANAGER",
    "OWNER",
  ];
  return {
    accessRows: [
      {
        createdAt: "2026-08-20T00:00:00.000Z",
        id: ACCESS_ROW_ID,
        storeId: STORE_IDS[0],
        userId: USER_IDS[2],
      },
    ],
    identity: targetIdentity(),
    stores: STORE_IDS.map((id) => ({ id, isActive: true })),
    tenantExists: true,
    users: USER_IDS.map((id, index) => ({
      accessScope: null,
      id,
      isActive: true,
      isPlatformAdmin: index === 4,
      role: roles[index],
      updatedAt: `2026-08-20T0${index}:00:00.000Z`,
    })),
  };
}

function clone(value) {
  return structuredClone(value);
}

class FakeAdapter {
  constructor(snapshot = sourceSnapshot()) {
    this.snapshot = clone(snapshot);
    this.audits = new Map();
    this.commitThenThrowOnce = false;
    this.concurrentStoreUpdateAttempts = 0;
    this.concurrentStoreUpdateBlocked = 0;
    this.mutationCount = 0;
    this.onLockedSnapshot = null;
    this.storeLockHeld = false;
  }

  auditKey({ action, requestId, tenantId }) {
    return `${tenantId}\0${action}\0${requestId}`;
  }

  async readSnapshot() {
    return clone(this.snapshot);
  }

  async readAudit(input) {
    return clone(this.audits.get(this.auditKey(input)) ?? null);
  }

  attemptConcurrentStoreUpdate(storeId, isActive) {
    this.concurrentStoreUpdateAttempts += 1;
    if (this.storeLockHeld) {
      this.concurrentStoreUpdateBlocked += 1;
      return "BLOCKED_BY_STORE_FOR_UPDATE";
    }
    const store = this.snapshot.stores.find(({ id }) => id === storeId);
    assert.ok(store);
    store.isActive = isActive;
    return "COMMITTED";
  }

  async withSerializableTransaction({ tenantId }, operation) {
    const beforeSnapshot = clone(this.snapshot);
    const beforeAudits = new Map(this.audits);
    const transaction = {
      applyMutations: async ({ mutations }) => {
        this.mutationCount += 1;
        for (const mutation of mutations) {
          const user = this.snapshot.users.find(({ id }) => id === mutation.userId);
          assert.ok(user);
          user.accessScope = mutation.accessScope;
          user.updatedAt = mutation.updatedAt;
          this.snapshot.accessRows = this.snapshot.accessRows.filter(
            ({ userId }) => userId !== mutation.userId,
          );
          for (const row of mutation.accessRows) {
            this.snapshot.accessRows.push({ ...row, userId: mutation.userId });
          }
        }
      },
      insertAudit: async ({ audit, tenantId: exactTenantId }) => {
        this.audits.set(
          this.auditKey({
            action: audit.action,
            requestId: audit.requestId,
            tenantId: exactTenantId,
          }),
          clone(audit),
        );
      },
      readAudit: (input) => this.readAudit(input),
      readLockedSnapshot: async () => {
        this.storeLockHeld = true;
        if (this.onLockedSnapshot !== null) await this.onLockedSnapshot(this);
        return this.readSnapshot();
      },
    };
    try {
      const result = await operation(transaction);
      if (this.commitThenThrowOnce) {
        this.commitThenThrowOnce = false;
        throw Object.assign(new Error("simulated-lost-commit-response"), {
          committed: true,
        });
      }
      return result;
    } catch (error) {
      if (error?.committed !== true) {
        this.snapshot = beforeSnapshot;
        this.audits = beforeAudits;
      }
      throw error;
    } finally {
      this.storeLockHeld = false;
    }
  }
}

async function fixture() {
  const adapter = new FakeAdapter();
  const inventory = await createAccessScopeInventory({
    adapter,
    hmacKey: HMAC_KEY,
    now: () => CAPTURED_AT,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  const platform = inventory.subjects.find(({ isPlatformAdmin }) =>
    isPlatformAdmin,
  );
  const manager = inventory.subjects.find(({ role }) => role === "MANAGER");
  const classifications = inventory.subjects.map((subject) => ({
    accessScope:
      subject.subjectDigest === manager.subjectDigest ? "STORES" : "NETWORK",
    storeIds:
      subject.subjectDigest === manager.subjectDigest ? [STORE_IDS[1]] : [],
    subjectDigest: subject.subjectDigest,
  }));
  const plan = buildAccessScopeClassificationPlan({
    classificationManifest: {
      classifications,
      contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
      inventoryDigest: inventory.inventoryDigest,
      networkStoreIds: STORE_IDS,
      platformAdminSubjectDigests: [platform.subjectDigest],
      tenantDigest: inventory.tenantDigest,
    },
    inventory,
    now: () => PLANNED_AT,
    randomId: () => PLANNED_ACCESS_ID,
  });
  const applyApproval = createAccessScopeDetachedApproval({
    confirmationPhrase: "I_ACCEPT_EXACT_ACCESS_SCOPE_APPLY",
    confirmedPlanDigest: plan.planDigest,
    confirmedPlatformDigest: plan.platformConfirmationDigest,
    direction: "APPLY",
    now: () => APPROVED_AT,
    plan,
  });
  const rollbackApproval = createAccessScopeDetachedApproval({
    confirmationPhrase: "I_ACCEPT_EXACT_ACCESS_SCOPE_ROLLBACK",
    confirmedPlanDigest: plan.planDigest,
    confirmedPlatformDigest: plan.platformConfirmationDigest,
    direction: "ROLLBACK",
    now: () => APPROVED_AT,
    plan,
  });
  return { adapter, applyApproval, inventory, plan, rollbackApproval };
}

test("HMAC key parser requires an explicit strong encoding", () => {
  assert.equal(parseAccessScopeHmacKey(`hex:${HMAC_KEY.toString("hex")}`).length, 32);
  assert.equal(
    parseAccessScopeHmacKey(`base64:${HMAC_KEY.toString("base64")}`).length,
    32,
  );
  for (const value of ["secret", `hex:${"00".repeat(32)}`, "base64:bad"] ) {
    assert.throws(
      () => parseAccessScopeHmacKey(value),
      AccessScopeClassificationError,
    );
  }
});

test("database URL is pinned to an isolated restored-copy identity", () => {
  assert.deepEqual(
    assertAccessScopeRestoredCopyDatabaseUrl(
      "postgresql://leetplus_scope_writer:a-very-long-test-password@127.0.0.1:55449/leetplus_scope_fixture",
      TARGET,
    ),
    {
      databaseName: TARGET.databaseName,
      host: TARGET.host,
      port: TARGET.port,
      roleName: TARGET.roleName,
    },
  );
  for (const url of [
    "postgresql://leetplus_scope_writer:a-very-long-test-password@10.0.0.8:55449/leetplus_scope_fixture",
    "postgresql://leetplus_scope_writer:a-very-long-test-password@127.0.0.1:5432/leetplus_scope_fixture",
    "postgresql://leetplus_scope_writer:a-very-long-test-password@127.0.0.1:55449/leetplus_scope_fixture?sslmode=disable",
  ]) {
    assert.throws(
      () => assertAccessScopeRestoredCopyDatabaseUrl(url, TARGET),
      AccessScopeClassificationError,
    );
  }
});

test("locked snapshots use an attested definer function without writer UPDATE grants", () => {
  assert.equal(
    accessScopeClassificationInternals.trustedLockFunctionCallSql,
    "SELECT public.leetplus_current_network_access_scope_lock_v1($1::text)",
  );
  const source = accessScopeClassificationInternals.trustedLockFunctionSource;
  for (const relation of ["Tenant", "User", "Store", "UserStoreAccess"]) {
    assert.match(source, new RegExp(`public\\."${relation}"`, "u"));
  }
  assert.match(source, /FOR UPDATE OF access/u);
  assert.doesNotMatch(
    accessScopeClassificationInternals.identitySql,
    /GRANT UPDATE/u,
  );
});

test("runbook lock function source stays byte-bound to the attested source", async () => {
  const runbook = await readFile(
    new URL(
      "../../../docs/open-beta/current-network-access-scope-classification-runbook.md",
      import.meta.url,
    ),
    "utf8",
  );
  const match = runbook.match(
    /AS \$trusted_lock\$\r?\n([\s\S]*?)\r?\n\$trusted_lock\$;/u,
  );
  assert.notEqual(match, null);
  assert.equal(
    match[1].replace(/\r\n?/gu, "\n").trim(),
    accessScopeClassificationInternals.trustedLockFunctionSource,
  );
  assert.match(runbook, /ALL ROUTINES IN SCHEMA/u);
});

test("inventory is HMAC-pseudonymous and records the complete current network", async () => {
  const { inventory } = await fixture();
  assert.equal(inventory.subjects.length, 5);
  assert.equal(inventory.stores.length, 4);
  assert.equal(inventory.aggregates.unresolvedScopeCount, 5);
  assert.equal(inventory.aggregates.unresolvedPlatformAdminCount, 1);
  const serialized = canonicalJson(inventory);
  assert.equal(serialized.includes(TENANT_ID), false);
  for (const id of USER_IDS) assert.equal(serialized.includes(id), false);
  assert.equal(serialized.includes("@"), false);
});

test("inventory refuses inheritance, ownership, effective PUBLIC grants, and concurrent sessions", async () => {
  for (const identityPatch of [
    { isSuperuser: true },
    { canCreateDb: true },
    { canInherit: true },
    { membershipCount: 1 },
    { roleConfigEmpty: false },
    { lockFunctionExists: false },
    { lockFunctionSource: "BEGIN NULL; END" },
    { lockFunctionAclUnexpectedCount: 1 },
    { lockOwnerCanLogin: true },
    { lockOwnerMembershipCount: 1 },
    { lockOwnerMissingColumnGrantCount: 1 },
    { lockOwnerUnexpectedEffectiveColumnGrantCount: 1 },
    { lockOwnerUnexpectedOwnershipCount: 1 },
    { lockOwnerUnexpectedTableGrantCount: 1 },
    { unexpectedTableGrantCount: 1 },
    { missingUpdateColumnGrantCount: 1 },
    { ownsDatabase: true },
    { ownedPublicRelationCount: 1 },
    { unexpectedEffectiveRelationPrivilegeCount: 1 },
    { unexpectedEffectiveColumnPrivilegeCount: 1 },
    { unexpectedEffectivePublicRoutineExecuteCount: 1 },
    { unexpectedExtraSchemaPrivilegeCount: 1 },
    { unexpectedExtraSchemaRelationPrivilegeCount: 1 },
    { unexpectedExtraSchemaColumnPrivilegeCount: 1 },
    { unexpectedExtraSchemaRoutinePrivilegeCount: 1 },
    { unexpectedEffectiveTypePrivilegeCount: 1 },
    { ownedExtraSchemaCount: 1 },
    { ownedExtraSchemaRelationCount: 1 },
    { databaseCanTemporary: true },
    { otherSessionCount: 1 },
  ]) {
    const snapshot = sourceSnapshot();
    Object.assign(snapshot.identity, identityPatch);
    await assert.rejects(
      createAccessScopeInventory({
        adapter: new FakeAdapter(snapshot),
        hmacKey: HMAC_KEY,
        now: () => CAPTURED_AT,
        target: TARGET,
        tenantId: TENANT_ID,
      }),
      AccessScopeClassificationError,
    );
  }
});

test("inventory rejects authority over adversarial extra_schema.secret objects", async () => {
  for (const identityPatch of [
    { unexpectedExtraSchemaPrivilegeCount: 1 },
    { unexpectedExtraSchemaRelationPrivilegeCount: 1 },
    { unexpectedExtraSchemaColumnPrivilegeCount: 1 },
    { unexpectedExtraSchemaSequencePrivilegeCount: 1 },
    { unexpectedExtraSchemaRoutinePrivilegeCount: 1 },
    { unexpectedEffectiveTypePrivilegeCount: 1 },
    { ownedExtraSchemaCount: 1 },
    { ownedExtraSchemaRelationCount: 1 },
    { ownedExtraSchemaRoutineCount: 1 },
    { ownedExtraSchemaTypeCount: 1 },
  ]) {
    const snapshot = sourceSnapshot();
    Object.assign(snapshot.identity, identityPatch);
    await assert.rejects(
      createAccessScopeInventory({
        adapter: new FakeAdapter(snapshot),
        hmacKey: HMAC_KEY,
        now: () => CAPTURED_AT,
        target: TARGET,
        tenantId: TENANT_ID,
      }),
      AccessScopeClassificationError,
    );
  }
});

test("SQL role attestation covers ownership and effective PUBLIC privileges", () => {
  const sql = accessScopeClassificationInternals.identitySql;
  for (const pattern of [
    /rolinherit/u,
    /rolconfig/u,
    /pg_auth_members/u,
    /has_table_privilege/u,
    /has_column_privilege/u,
    /has_sequence_privilege/u,
    /has_function_privilege/u,
    /datdba = role\.oid/u,
    /nspowner = role\.oid/u,
    /relowner = role\.oid/u,
    /proowner = role\.oid/u,
    /typowner = role\.oid/u,
    /namespace\.nspname NOT IN \('pg_catalog', 'information_schema'\)/u,
    /type_row\.typtype IN \('b', 'c', 'd', 'e', 'm', 'r'\)/u,
    /leetplus_current_network_access_scope_lock_v1/u,
    /aclexplode/u,
    /prosecdef/u,
    /proconfig/u,
    /rolcanlogin/u,
  ]) {
    assert.match(sql, pattern);
  }
  assert.match(sql, /aclexplode\(attribute\.attacl\)/u);
  assert.doesNotMatch(sql, /COALESCE\(attribute\.attacl/u);
  assert.doesNotMatch(sql, /namespace\.oid >= 16384/u);
  assert.doesNotMatch(sql, /WHERE acl\.grantor = routine\.proowner/u);
  assert.equal(accessScopeClassificationInternals.posixPermissionMask, 0o7777);
});

test(
  "PostgreSQL exact-grant fixture proves trusted locking and concurrent Store fencing",
  {
    skip: pgE2eEnabled()
      ? false
      : "set the explicit disposable PostgreSQL E2E contract",
    timeout: 30000,
  },
  async () => {
    const baseUrl = pgE2eAdminUrl();
    const maintenanceUrl = baseUrl.toString();
    const targetAdminUrl = databaseUrl(baseUrl, {
      database: PG_E2E_DATABASE,
      password: decodeURIComponent(baseUrl.password),
      role: "postgres",
    });
    const writerUrl = databaseUrl(baseUrl, {
      database: PG_E2E_DATABASE,
      password: PG_E2E_WRITER_PASSWORD,
      role: PG_E2E_WRITER,
    });
    let databaseCreated = false;
    let aclHelperCreated = false;
    let aclThirdCreated = false;
    let lockOwnerCreated = false;
    let writerCreated = false;
    let maintenance;
    let targetAdmin;
    let updater;
    let writer;
    try {
      maintenance = await connectPg(
        maintenanceUrl,
        "leetplus_scope_e2e_maintenance",
      );
      const preflight = await maintenance.query(
        `SELECT
           (SELECT count(*)::INTEGER FROM pg_catalog.pg_database
             WHERE datname = $1) AS "databaseCount",
           (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
             WHERE rolname = ANY($2::TEXT[])) AS "roleCount"`,
        [
          PG_E2E_DATABASE,
          [
            PG_E2E_WRITER,
            PG_E2E_LOCK_OWNER,
            PG_E2E_ACL_HELPER,
            PG_E2E_ACL_THIRD,
          ],
        ],
      );
      assert.deepEqual(preflight.rows[0], {
        databaseCount: 0,
        roleCount: 0,
      });
      await maintenance.query(
        `CREATE ROLE ${PG_E2E_LOCK_OWNER} NOLOGIN NOINHERIT NOSUPERUSER
          NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      lockOwnerCreated = true;
      await maintenance.query(
        `CREATE ROLE ${PG_E2E_WRITER} LOGIN NOINHERIT NOSUPERUSER
          NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
          PASSWORD '${PG_E2E_WRITER_PASSWORD}'`,
      );
      writerCreated = true;
      await maintenance.query(
        `CREATE ROLE ${PG_E2E_ACL_HELPER} NOLOGIN NOINHERIT NOSUPERUSER
          NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      aclHelperCreated = true;
      await maintenance.query(
        `CREATE ROLE ${PG_E2E_ACL_THIRD} NOLOGIN NOINHERIT NOSUPERUSER
          NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      aclThirdCreated = true;
      await maintenance.query(`CREATE DATABASE "${PG_E2E_DATABASE}"`);
      databaseCreated = true;
      await maintenance.query(
        `REVOKE CONNECT, TEMPORARY ON DATABASE "${PG_E2E_DATABASE}"
          FROM PUBLIC`,
      );
      await maintenance.query(
        `GRANT CONNECT ON DATABASE "${PG_E2E_DATABASE}" TO ${PG_E2E_WRITER}`,
      );

      targetAdmin = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_setup",
      );
      await installPgLockFixture(targetAdmin);
      await targetAdmin.end();
      targetAdmin = undefined;

      writer = await connectPg(writerUrl, "leetplus_scope_e2e_writer");
      const identity = (
        await writer.query(accessScopeClassificationInternals.identitySql)
      ).rows[0];
      const target = {
        databaseName: PG_E2E_DATABASE,
        expectedSystemIdentifier: identity.systemIdentifier,
        host: identity.serverAddress,
        port: Number(identity.serverPort),
        roleName: PG_E2E_WRITER,
      };
      assert.doesNotThrow(() =>
        accessScopeClassificationInternals.normalizeIdentity(identity, target),
      );

      await assert.rejects(
        writer.query(
          `UPDATE public."Store" SET "isActive" = FALSE WHERE "id" = $1`,
          [STORE_IDS[0]],
        ),
        (error) => error?.code === "42501",
      );
      await assert.rejects(
        writer.query(
          `SELECT "id" FROM public."Store" WHERE "id" = $1 FOR UPDATE`,
          [STORE_IDS[0]],
        ),
        (error) => error?.code === "42501",
      );

      targetAdmin = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_public_adversary",
      );
      await targetAdmin.query(
        `GRANT SELECT ON extra_schema.secret TO PUBLIC`,
      );
      await targetAdmin.end();
      targetAdmin = undefined;
      const publicGrantIdentity = (
        await writer.query(accessScopeClassificationInternals.identitySql)
      ).rows[0];
      assert.throws(
        () =>
          accessScopeClassificationInternals.normalizeIdentity(
            publicGrantIdentity,
            target,
          ),
        AccessScopeClassificationError,
      );
      targetAdmin = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_public_cleanup",
      );
      await targetAdmin.query(
        `REVOKE SELECT ON extra_schema.secret FROM PUBLIC`,
      );
      await targetAdmin.query(
        `ALTER TABLE extra_schema.secret OWNER TO ${PG_E2E_WRITER}`,
      );
      await targetAdmin.end();
      targetAdmin = undefined;
      const ownerIdentity = (
        await writer.query(accessScopeClassificationInternals.identitySql)
      ).rows[0];
      assert.throws(
        () =>
          accessScopeClassificationInternals.normalizeIdentity(
            ownerIdentity,
            target,
          ),
        AccessScopeClassificationError,
      );
      targetAdmin = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_owner_cleanup",
      );
      await targetAdmin.query(`ALTER TABLE extra_schema.secret OWNER TO postgres`);
      await targetAdmin.end();
      targetAdmin = undefined;

      targetAdmin = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_acl_chain_adversary",
      );
      await targetAdmin.query(
        `GRANT USAGE ON SCHEMA public TO ${PG_E2E_ACL_HELPER}`,
      );
      await targetAdmin.query(
        `GRANT EXECUTE
           ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
           TO ${PG_E2E_ACL_HELPER} WITH GRANT OPTION`,
      );
      await targetAdmin.query(`SET ROLE ${PG_E2E_ACL_HELPER}`);
      await targetAdmin.query(
        `GRANT EXECUTE
           ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
           TO ${PG_E2E_ACL_THIRD}`,
      );
      await targetAdmin.query("RESET ROLE");
      await targetAdmin.end();
      targetAdmin = undefined;
      const aclChainIdentity = (
        await writer.query(accessScopeClassificationInternals.identitySql)
      ).rows[0];
      assert.equal(aclChainIdentity.lockFunctionAclUnexpectedCount, 2);
      assert.throws(
        () =>
          accessScopeClassificationInternals.normalizeIdentity(
            aclChainIdentity,
            target,
          ),
        AccessScopeClassificationError,
      );
      targetAdmin = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_acl_chain_cleanup",
      );
      await targetAdmin.query(
        `REVOKE EXECUTE
           ON FUNCTION public.leetplus_current_network_access_scope_lock_v1(TEXT)
           FROM ${PG_E2E_ACL_HELPER} CASCADE`,
      );
      await targetAdmin.query(
        `REVOKE USAGE ON SCHEMA public FROM ${PG_E2E_ACL_HELPER}`,
      );
      await targetAdmin.end();
      targetAdmin = undefined;
      const aclRestoredIdentity = (
        await writer.query(accessScopeClassificationInternals.identitySql)
      ).rows[0];
      assert.doesNotThrow(() =>
        accessScopeClassificationInternals.normalizeIdentity(
          aclRestoredIdentity,
          target,
        ),
      );

      await writer.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE");
      await writer.query("SET LOCAL statement_timeout = '5s'");
      await writer.query("SET LOCAL lock_timeout = '2s'");
      await writer.query(
        accessScopeClassificationInternals.trustedLockFunctionCallSql,
        [TENANT_ID],
      );
      updater = await connectPg(
        targetAdminUrl,
        "leetplus_scope_e2e_concurrent_store_update",
      );
      await updater.query("SET lock_timeout = '250ms'");
      await assert.rejects(
        updater.query(
          `UPDATE public."Store" SET "isActive" = FALSE WHERE "id" = $1`,
          [STORE_IDS[0]],
        ),
        (error) => error?.code === "55P03",
      );
      await writer.query("ROLLBACK");
      const afterRelease = await updater.query(
        `UPDATE public."Store" SET "isActive" = FALSE WHERE "id" = $1`,
        [STORE_IDS[0]],
      );
      assert.equal(afterRelease.rowCount, 1);
      await updater.query(
        `UPDATE public."Store" SET "isActive" = TRUE WHERE "id" = $1`,
        [STORE_IDS[0]],
      );
      await updater.end();
      updater = undefined;
      const restoredIdentity = (
        await writer.query(accessScopeClassificationInternals.identitySql)
      ).rows[0];
      assert.doesNotThrow(() =>
        accessScopeClassificationInternals.normalizeIdentity(
          restoredIdentity,
          target,
        ),
      );
    } finally {
      await updater?.end().catch(() => undefined);
      await targetAdmin?.end().catch(() => undefined);
      await writer?.end().catch(() => undefined);
      if (databaseCreated) {
        await maintenance.query(`DROP DATABASE "${PG_E2E_DATABASE}"`);
        databaseCreated = false;
      }
      if (writerCreated) {
        await maintenance.query(`DROP ROLE ${PG_E2E_WRITER}`);
        writerCreated = false;
      }
      if (aclThirdCreated) {
        await maintenance.query(`DROP ROLE ${PG_E2E_ACL_THIRD}`);
        aclThirdCreated = false;
      }
      if (aclHelperCreated) {
        await maintenance.query(`DROP ROLE ${PG_E2E_ACL_HELPER}`);
        aclHelperCreated = false;
      }
      if (lockOwnerCreated) {
        await maintenance.query(`DROP ROLE ${PG_E2E_LOCK_OWNER}`);
        lockOwnerCreated = false;
      }
      if (maintenance !== undefined) {
        const absence = await maintenance.query(
          `SELECT
             (SELECT count(*)::INTEGER FROM pg_catalog.pg_database
               WHERE datname = $1) AS "databaseCount",
             (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
               WHERE rolname = ANY($2::TEXT[])) AS "roleCount"`,
          [
            PG_E2E_DATABASE,
            [
              PG_E2E_WRITER,
              PG_E2E_LOCK_OWNER,
              PG_E2E_ACL_HELPER,
              PG_E2E_ACL_THIRD,
            ],
          ],
        );
        assert.deepEqual(absence.rows[0], { databaseCount: 0, roleCount: 0 });
        await maintenance.end();
      }
    }
  },
);

test("plan requires an exact classification and separate platform confirmation", async () => {
  const { inventory } = await fixture();
  const all = inventory.subjects.map(({ subjectDigest }) => ({
    accessScope: "NETWORK",
    storeIds: [],
    subjectDigest,
  }));
  assert.throws(
    () =>
      buildAccessScopeClassificationPlan({
        classificationManifest: {
          classifications: all,
          contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
          inventoryDigest: inventory.inventoryDigest,
          networkStoreIds: STORE_IDS,
          platformAdminSubjectDigests: [],
          tenantDigest: inventory.tenantDigest,
        },
        inventory,
      }),
    (error) => error.reasonCode === "ACCESS_SCOPE_PLATFORM_CONFIRMATION_NOT_EXACT",
  );
  assert.throws(
    () =>
      buildAccessScopeClassificationPlan({
        classificationManifest: {
          classifications: all.slice(1),
          contractVersion: ACCESS_SCOPE_CLASSIFICATION_CONTRACT,
          inventoryDigest: inventory.inventoryDigest,
          networkStoreIds: STORE_IDS,
          platformAdminSubjectDigests: [
            inventory.subjects.find(({ isPlatformAdmin }) => isPlatformAdmin)
              .subjectDigest,
          ],
          tenantDigest: inventory.tenantDigest,
        },
        inventory,
      }),
    (error) =>
      error.reasonCode === "ACCESS_SCOPE_CLASSIFICATION_NOT_EXACT_UNRESOLVED_SET",
  );
});

test("detached approval pins both plan and platform digests", async () => {
  const { plan } = await fixture();
  assert.throws(
    () =>
      createAccessScopeDetachedApproval({
        confirmationPhrase: "I_ACCEPT_EXACT_ACCESS_SCOPE_APPLY",
        confirmedPlanDigest: "0".repeat(64),
        confirmedPlatformDigest: plan.platformConfirmationDigest,
        direction: "APPLY",
        plan,
      }),
    (error) =>
      error.reasonCode === "ACCESS_SCOPE_APPROVAL_DIGEST_CONFIRMATION_MISMATCH",
  );
});

test("apply, zero-diff reconciliation, check, and exact rollback are idempotent", async () => {
  const { adapter, applyApproval, plan, rollbackApproval } = await fixture();
  const first = await executeAccessScopeClassification({
    adapter,
    approval: applyApproval,
    direction: "APPLY",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(first.disposition, "COMMITTED");
  assert.equal(first.zeroDiff, false);
  assert.equal(adapter.mutationCount, 1);
  const second = await executeAccessScopeClassification({
    adapter,
    approval: applyApproval,
    direction: "APPLY",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(second.disposition, "RECONCILED");
  assert.equal(second.zeroDiff, true);
  assert.equal(adapter.mutationCount, 1);
  const checked = await checkAccessScopeClassification({
    adapter,
    direction: "APPLY",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(checked.decision, "CLASSIFICATION_STATE_VERIFIED");
  const rolledBack = await executeAccessScopeClassification({
    adapter,
    approval: rollbackApproval,
    direction: "ROLLBACK",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(rolledBack.disposition, "COMMITTED");
  assert.deepEqual(adapter.snapshot, sourceSnapshot());
  await checkAccessScopeClassification({
    adapter,
    direction: "ROLLBACK",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  const rollbackZeroDiff = await executeAccessScopeClassification({
    adapter,
    approval: rollbackApproval,
    direction: "ROLLBACK",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(rollbackZeroDiff.disposition, "RECONCILED");
  assert.equal(adapter.mutationCount, 2);
  await assert.rejects(
    executeAccessScopeClassification({
      adapter,
      approval: applyApproval,
      direction: "APPLY",
      hmacKey: HMAC_KEY,
      plan,
      target: TARGET,
      tenantId: TENANT_ID,
    }),
    (error) => error.reasonCode === "ACCESS_SCOPE_REAPPLY_AFTER_ROLLBACK_FORBIDDEN",
  );
  await assert.rejects(
    checkAccessScopeClassification({
      adapter,
      direction: "APPLY",
      hmacKey: HMAC_KEY,
      plan,
      target: TARGET,
      tenantId: TENANT_ID,
    }),
    (error) => error.reasonCode === "ACCESS_SCOPE_DURABLE_AUDIT_SEQUENCE_INVALID",
  );
});

test("committed transaction with a lost response is reconciled from durable audit", async () => {
  const { adapter, applyApproval, plan } = await fixture();
  adapter.commitThenThrowOnce = true;
  const receipt = await executeAccessScopeClassification({
    adapter,
    approval: applyApproval,
    direction: "APPLY",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(receipt.disposition, "RECONCILED");
  assert.equal(receipt.zeroDiff, true);
  assert.equal(adapter.mutationCount, 1);
});

test("fresh state is re-read under lock and stale plans fail without mutation", async () => {
  const { adapter, applyApproval, plan } = await fixture();
  adapter.snapshot.users[0].role = "NETWORK_ADMIN";
  await assert.rejects(
    executeAccessScopeClassification({
      adapter,
      approval: applyApproval,
      direction: "APPLY",
      hmacKey: HMAC_KEY,
      plan,
      target: TARGET,
      tenantId: TENANT_ID,
    }),
    (error) => error.reasonCode === "ACCESS_SCOPE_PLAN_STALE_UNDER_LOCK",
  );
  assert.equal(adapter.mutationCount, 0);
  assert.equal(adapter.audits.size, 0);
});

test("an adversarial concurrent Store.isActive update is fenced for the transaction", async () => {
  const { adapter, applyApproval, plan } = await fixture();
  let attempted = false;
  adapter.onLockedSnapshot = (activeAdapter) => {
    if (attempted) return;
    attempted = true;
    assert.equal(
      activeAdapter.attemptConcurrentStoreUpdate(STORE_IDS[0], false),
      "BLOCKED_BY_STORE_FOR_UPDATE",
    );
  };
  await executeAccessScopeClassification({
    adapter,
    approval: applyApproval,
    direction: "APPLY",
    hmacKey: HMAC_KEY,
    plan,
    target: TARGET,
    tenantId: TENANT_ID,
  });
  assert.equal(adapter.concurrentStoreUpdateAttempts, 1);
  assert.equal(adapter.concurrentStoreUpdateBlocked, 1);
  assert.equal(
    adapter.snapshot.stores.find(({ id }) => id === STORE_IDS[0]).isActive,
    true,
  );
  assert.equal(adapter.storeLockHeld, false);
});

test("receipt writer is durable O_EXCL and never overwrites", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "access-scope-receipt-")),
  );
  try {
    const destination = path.join(root, "receipt.json");
    const evidenceOptions = {
      evidencePathAttestor: async () => ({
        decision: "PROTECTED_EVIDENCE_PATH",
        protection: "TEST_EXACT_ACL_VERIFIED",
      }),
      evidenceRoot: root,
    };
    const first = await writeAccessScopeReceiptExclusive(
      destination,
      { decision: "TEST" },
      evidenceOptions,
    );
    assert.match(first.receiptSha256, /^[0-9a-f]{64}$/u);
    assert.match(first.evidenceRootIdentityDigest, /^[0-9a-f]{64}$/u);
    assert.match(
      first.directorySync,
      /^DIRECTORY_FSYNC_(?:VERIFIED|UNAVAILABLE_WIN32)$/u,
    );
    assert.equal(await readFile(destination, "utf8"), '{"decision":"TEST"}\n');
    assert.deepEqual(
      await readAccessScopeJsonFile(destination, evidenceOptions),
      { decision: "TEST" },
    );
    await assert.rejects(
      writeAccessScopeReceiptExclusive(
        destination,
        { decision: "OVERWRITE" },
        evidenceOptions,
      ),
      (error) => error.reasonCode === "ACCESS_SCOPE_RECEIPT_ALREADY_EXISTS",
    );
    assert.equal(await readFile(destination, "utf8"), '{"decision":"TEST"}\n');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("evidence I/O refuses missing roots and paths outside the protected root", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "access-scope-boundary-")),
  );
  const sibling = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "access-scope-sibling-")),
  );
  const attestor = async () => ({
    decision: "PROTECTED_EVIDENCE_PATH",
    protection: "TEST_EXACT_ACL_VERIFIED",
  });
  try {
    await assert.rejects(
      writeAccessScopeReceiptExclusive(path.join(root, "missing.json"), {}),
      AccessScopeClassificationError,
    );
    await assert.rejects(
      writeAccessScopeReceiptExclusive(
        path.join(sibling, "outside.json"),
        {},
        { evidencePathAttestor: attestor, evidenceRoot: root },
      ),
      (error) => error.reasonCode === "ACCESS_SCOPE_FILE_OUTSIDE_PROTECTED_ROOT",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(sibling, { force: true, recursive: true });
  }
});

test("CLI parser rejects literal secrets, unknown flags, and duplicate flags", () => {
  assert.equal(
    parseAccessScopeCliArguments([
      "inventory",
      "--target",
      "C:\\evidence\\target.json",
      "--output",
      "C:\\evidence\\inventory.json",
    ]).command,
    "inventory",
  );
  for (const argv of [
    [
      "inventory",
      "--target",
      "target.json",
      "--output",
      "out.json",
      "--database-url",
      "postgres://secret",
    ],
    [
      "plan",
      "--inventory",
      "one",
      "--inventory",
      "two",
      "--classifications",
      "three",
      "--output",
      "four",
    ],
  ]) {
    assert.throws(
      () => parseAccessScopeCliArguments(argv),
      AccessScopeClassificationError,
    );
  }
});

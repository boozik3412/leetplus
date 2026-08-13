import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES,
  PINNED_LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROOTS,
  assertLangameInitialSyncRuntimeReceiptCurrent193,
  attestLangameInitialSyncRuntimeCurrent193,
  planLangameInitialSyncRuntimeCurrent193,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";

const releaseSha = "a".repeat(40);

function planInput(overrides = {}) {
  return {
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    environment: "ci",
    executorRoleName: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    executorRoleOid: 20_001,
    releaseSha,
    schemaOwnerRoleName: "leetplus_migration_owner",
    schemaOwnerRoleOid: 20_002,
    ...overrides,
  };
}

function routineRows() {
  return LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES.map((routine) => ({
    executorCanExecute: routine.callable,
    identity: routine.identity,
    ownerRoleName: "leetplus_migration_owner",
    ownerRoleOid: 20_002,
    publicCanExecute: false,
    searchPath: routine.searchPath,
    securityDefiner: routine.securityDefiner,
  }));
}

function catalogSnapshot(overrides = {}) {
  return {
    databaseAcl: { connect: true, create: false, temporary: false },
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    currentUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    defaultPrivilegeCount: 0,
    directSequencePrivilegeCount: 0,
    directTablePrivilegeCount: 0,
    executorRole: {
      bypassRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      inherit: false,
      name: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
      oid: 20_001,
      replication: false,
      superuser: false,
    },
    functionOwnerRoleName: "leetplus_migration_owner",
    functionOwnerRoleOid: 20_002,
    membershipCount: 0,
    ownedObjectCount: 0,
    routines: routineRows(),
    schemaAcl: { create: false, usage: true },
    sessionUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    unexpectedExecutableRoutineCount: 0,
    ...overrides,
  };
}

test("CURRENT193 creates a deterministic nonauthorizing execute-only plan", () => {
  const first = planLangameInitialSyncRuntimeCurrent193(planInput());
  const second = planLangameInitialSyncRuntimeCurrent193(planInput());

  assert.equal(first.contract, LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT);
  assert.equal(first.planDigest, second.planDigest);
  assert.equal(first.authorization, false);
  assert.equal(first.productionApplyAllowed, false);
  assert.equal(first.applicationRouteAllowed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(PINNED_LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROOTS, {});
});

test("CURRENT193 accepts only the fixed separated executor role in CI", () => {
  for (const input of [
    planInput({ environment: "production" }),
    planInput({ executorRoleName: "postgres" }),
    planInput({ executorRoleOid: 20_002 }),
    { ...planInput(), extra: true },
  ]) {
    assert.throws(
      () => planLangameInitialSyncRuntimeCurrent193(input),
      /CURRENT193 Langame runtime boundary rejected/u,
    );
  }
  assert.throws(() =>
    planLangameInitialSyncRuntimeCurrent193(new Proxy(planInput(), {})),
  );
  const accessorInput = planInput();
  Object.defineProperty(accessorInput, "databaseName", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(() => planLangameInitialSyncRuntimeCurrent193(accessorInput));
});

test("CURRENT193 attests the exact role, ACL and five-routine catalog", () => {
  const plan = planLangameInitialSyncRuntimeCurrent193(planInput());
  const receipt = attestLangameInitialSyncRuntimeCurrent193(
    plan,
    catalogSnapshot(),
  );

  assert.equal(receipt.catalogMatched, true);
  assert.equal(receipt.productionExecutionAllowed, false);
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/u);
  assert.equal(
    assertLangameInitialSyncRuntimeReceiptCurrent193(receipt),
    receipt,
  );
});

test("CURRENT193 rejects privilege attributes, membership and ownership", () => {
  const plan = planLangameInitialSyncRuntimeCurrent193(planInput());
  const privilegedRole = catalogSnapshot();
  privilegedRole.executorRole = {
    ...privilegedRole.executorRole,
    bypassRls: true,
  };

  assert.throws(() => attestLangameInitialSyncRuntimeCurrent193(plan, privilegedRole));
  assert.throws(() =>
    attestLangameInitialSyncRuntimeCurrent193(
      plan,
      catalogSnapshot({ membershipCount: 1 }),
    ),
  );
  assert.throws(() =>
    attestLangameInitialSyncRuntimeCurrent193(
      plan,
      catalogSnapshot({ ownedObjectCount: 1 }),
    ),
  );
  assert.throws(() =>
    attestLangameInitialSyncRuntimeCurrent193(
      plan,
      catalogSnapshot({ currentUser: "postgres" }),
    ),
  );
});

test("CURRENT193 rejects direct, default and database/schema privilege widening", () => {
  const plan = planLangameInitialSyncRuntimeCurrent193(planInput());
  for (const snapshot of [
    catalogSnapshot({ directTablePrivilegeCount: 1 }),
    catalogSnapshot({ directSequencePrivilegeCount: 1 }),
    catalogSnapshot({ defaultPrivilegeCount: 1 }),
    catalogSnapshot({ databaseAcl: { connect: true, create: true, temporary: false } }),
    catalogSnapshot({ schemaAcl: { create: true, usage: true } }),
  ]) {
    assert.throws(() => attestLangameInitialSyncRuntimeCurrent193(plan, snapshot));
  }
});

test("CURRENT193 rejects routine owner, ACL, search-path and unexpected execute drift", () => {
  const plan = planLangameInitialSyncRuntimeCurrent193(planInput());
  for (const mutate of [
    (rows) => (rows[0].ownerRoleOid = 99),
    (rows) => (rows[1].publicCanExecute = true),
    (rows) => (rows[2].searchPath = "public"),
    (rows) => (rows[3].executorCanExecute = true),
  ]) {
    const rows = routineRows();
    mutate(rows);
    assert.throws(() =>
      attestLangameInitialSyncRuntimeCurrent193(
        plan,
        catalogSnapshot({ routines: rows }),
      ),
    );
  }
  assert.throws(() =>
    attestLangameInitialSyncRuntimeCurrent193(
      plan,
      catalogSnapshot({ unexpectedExecutableRoutineCount: 1 }),
    ),
  );
  assert.throws(() =>
    attestLangameInitialSyncRuntimeCurrent193(
      plan,
      catalogSnapshot({ routines: new Proxy(routineRows(), {}) }),
    ),
  );
});

test("CURRENT193 rejects cloned plan and receipt provenance", () => {
  const plan = planLangameInitialSyncRuntimeCurrent193(planInput());
  const receipt = attestLangameInitialSyncRuntimeCurrent193(
    plan,
    catalogSnapshot(),
  );

  assert.throws(() =>
    attestLangameInitialSyncRuntimeCurrent193(
      structuredClone(plan),
      catalogSnapshot(),
    ),
  );
  assert.throws(() =>
    assertLangameInitialSyncRuntimeReceiptCurrent193(structuredClone(receipt)),
  );
});

test("CURRENT193 pure boundary has no filesystem, process, database or network effect", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL("./langame-initial-sync-runtime-boundary-current193.mjs", import.meta.url),
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /child_process|execFile|spawn|process\.env|Prisma|pg\b|fetch\s*\(|readFile|writeFile|CREATE ROLE|GRANT\s/iu,
  );
});

test("CURRENT193 disposable SQL grants only three RPCs and rolls role/ACL changes back", () => {
  const smoke = readFileSync(
    fileURLToPath(
      new URL("./langame-initial-sync-runtime-current193-smoke.sql", import.meta.url),
    ),
    "utf8",
  );
  assert.equal((smoke.match(/GRANT EXECUTE ON FUNCTION/gu) ?? []).length, 3);
  assert.match(smoke, /LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE/u);
  assert.match(smoke, /NOREPLICATION NOBYPASSRLS/u);
  assert.match(smoke, /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC/u);
  assert.match(smoke, /direct table read unexpectedly passed/u);
  assert.match(smoke, /schema DDL unexpectedly passed/u);
  assert.match(smoke, /TEMP unexpectedly passed/u);
  assert.match(smoke, /role escalation unexpectedly passed/u);
  assert.match(smoke, /SET SESSION AUTHORIZATION leetplus_langame_initial_sync_current192/u);
  assert.match(smoke, /CURRENT_USER <> 'leetplus_langame_initial_sync_current192'/u);
  assert.match(smoke, /SESSION_USER <> 'leetplus_langame_initial_sync_current192'/u);
  assert.match(smoke, /RESET SESSION AUTHORIZATION;\s*ROLLBACK;/u);
  assert.doesNotMatch(smoke, /COMMIT;/u);
});

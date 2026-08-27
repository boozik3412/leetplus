import assert from "node:assert/strict";
import test from "node:test";
import {
  TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION,
  TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION_COUNT,
  TELEGRAM_UPDATE_LEDGER_ACL_MIGRATIONS_SQL,
  TELEGRAM_UPDATE_LEDGER_ACL_STATE_SQL,
  TelegramUpdateLedgerAclReconciliationError,
  createTelegramUpdateLedgerAclAdapterForTestOnly,
  exactTelegramUpdateLedgerAclApplyConfirmation,
  runTelegramUpdateLedgerAclReconciliation,
  telegramUpdateLedgerAclReconciliationInternals,
} from "./telegram-update-ledger-runtime-acl-reconciliation.mjs";

function migrationRows() {
  const fixtures = Array.from(
    { length: TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION_COUNT - 1 },
    (_, index) => ({
      applied: true,
      migrationName: `20200101${String(index).padStart(6, "0")}_fixture`,
      rolledBack: false,
    }),
  );
  return [
    ...fixtures,
    {
      applied: true,
      migrationName: TELEGRAM_UPDATE_LEDGER_ACL_EXPECTED_MIGRATION,
      rolledBack: false,
    },
  ];
}

function driftState() {
  return {
    actorCanAlter: true,
    currentDatabase: "leetplus",
    currentUser: "postgres",
    effectiveDelete: true,
    effectiveInsert: false,
    effectiveReferences: false,
    effectiveSelect: true,
    effectiveTrigger: false,
    effectiveTruncate: false,
    effectiveUpdate: true,
    membershipCount: 0,
    ownedRelationCount: 0,
    publicAcl: [],
    roleAcl: [
      { isGrantable: false, privilege: "DELETE" },
      { isGrantable: false, privilege: "SELECT" },
      { isGrantable: false, privilege: "UPDATE" },
    ],
    roleBypassRls: false,
    roleCanLogin: true,
    roleCount: 1,
    roleCreateDatabase: false,
    roleCreateRole: false,
    roleInherit: false,
    roleOid: "4242",
    roleReplication: false,
    roleSuperuser: false,
    tableCount: 1,
    tableOid: "5252",
  };
}

function fakeDatabase(overrides = {}) {
  const state = { ...driftState(), ...(overrides.state ?? {}) };
  const migrations = overrides.migrations ?? migrationRows();
  const statements = [];

  const query = async (sql) => {
    if (sql === TELEGRAM_UPDATE_LEDGER_ACL_STATE_SQL) {
      return { rows: [{ ...state, publicAcl: [...state.publicAcl], roleAcl: [...state.roleAcl] }] };
    }
    if (sql === TELEGRAM_UPDATE_LEDGER_ACL_MIGRATIONS_SQL) {
      return { rows: migrations.map((row) => ({ ...row })) };
    }
    statements.push(sql);
    if (sql.includes('FROM PUBLIC')) {
      state.publicAcl = [];
    } else if (sql.startsWith("REVOKE ALL PRIVILEGES") && sql.includes("leetplus_runtime")) {
      state.roleAcl = [];
      state.effectiveDelete = false;
      state.effectiveInsert = false;
      state.effectiveReferences = false;
      state.effectiveSelect = false;
      state.effectiveTrigger = false;
      state.effectiveTruncate = false;
      state.effectiveUpdate = false;
    } else if (sql.startsWith("GRANT SELECT, INSERT, UPDATE")) {
      state.roleAcl = ["INSERT", "SELECT", "UPDATE"].map((privilege) => ({
        isGrantable: false,
        privilege,
      }));
      state.effectiveInsert = true;
      state.effectiveSelect = true;
      state.effectiveUpdate = true;
    }
    return { rows: [] };
  };
  const database = {
    query,
    transaction: async (callback) => callback({ query }),
  };
  return {
    adapter: createTelegramUpdateLedgerAclAdapterForTestOnly(database),
    state,
    statements,
  };
}

test("plan is exact, secret-free and repairs only the fixed table", async () => {
  const database = fakeDatabase();
  const result = await runTelegramUpdateLedgerAclReconciliation({
    adapter: database.adapter,
    mode: "plan",
  });

  assert.equal(result.decision, "PLAN_READY");
  assert.equal(result.actionCount, 3);
  assert.match(result.planDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.sourceGraphDigest, /^[0-9a-f]{64}$/u);
  assert.equal(result.runtimeRole, "leetplus_runtime");
  assert.equal(result.table, "public.GuestPortalTelegramUpdateLedger");
  assert.equal(database.statements.length, 0);
  assert.equal(
    exactTelegramUpdateLedgerAclApplyConfirmation(result),
    `I_ACCEPT_EXACT_TELEGRAM_UPDATE_LEDGER_ACL_APPLY planDigest=${result.planDigest} actionCount=3`,
  );
});

test("apply rejects any confirmation drift before a transaction", async () => {
  const database = fakeDatabase();
  await assert.rejects(
    runTelegramUpdateLedgerAclReconciliation({
      adapter: database.adapter,
      confirmation: "I_ACCEPT_WRONG_PLAN",
      mode: "apply",
    }),
    new TelegramUpdateLedgerAclReconciliationError(
      "TELEGRAM_UPDATE_LEDGER_ACL_CONFIRMATION_MISMATCH",
    ),
  );
  assert.equal(database.statements.length, 0);
});

test("apply uses a short locked transaction and converges to exact least privilege", async () => {
  const database = fakeDatabase();
  const plan = await runTelegramUpdateLedgerAclReconciliation({
    adapter: database.adapter,
    mode: "plan",
  });
  const applied = await runTelegramUpdateLedgerAclReconciliation({
    adapter: database.adapter,
    confirmation: exactTelegramUpdateLedgerAclApplyConfirmation(plan),
    mode: "apply",
  });

  assert.equal(applied.decision, "APPLIED");
  assert.deepEqual(database.state.roleAcl, [
    { isGrantable: false, privilege: "INSERT" },
    { isGrantable: false, privilege: "SELECT" },
    { isGrantable: false, privilege: "UPDATE" },
  ]);
  assert.equal(database.state.effectiveDelete, false);
  assert.equal(database.statements[0], "SET LOCAL lock_timeout = '5s'");
  assert.equal(database.statements[1], "SET LOCAL statement_timeout = '15s'");
  assert.ok(database.statements.some((sql) => sql.includes("pg_advisory_xact_lock")));

  const replay = await runTelegramUpdateLedgerAclReconciliation({
    adapter: database.adapter,
    mode: "check",
  });
  assert.equal(replay.decision, "COMPLIANT");
  assert.equal(replay.actionCount, 0);
});

test("unsafe runtime role and migration drift fail closed", async () => {
  await assert.rejects(
    runTelegramUpdateLedgerAclReconciliation({
      adapter: fakeDatabase({ state: { roleSuperuser: true } }).adapter,
      mode: "plan",
    }),
    new TelegramUpdateLedgerAclReconciliationError(
      "TELEGRAM_UPDATE_LEDGER_ACL_RUNTIME_ROLE_UNSAFE",
    ),
  );
  await assert.rejects(
    runTelegramUpdateLedgerAclReconciliation({
      adapter: fakeDatabase({ migrations: migrationRows().slice(0, -1) }).adapter,
      mode: "plan",
    }),
    new TelegramUpdateLedgerAclReconciliationError(
      "TELEGRAM_UPDATE_LEDGER_ACL_MIGRATION_MISMATCH",
    ),
  );
});

test("static statements cannot grant destructive table privileges", () => {
  const joined = telegramUpdateLedgerAclReconciliationInternals.APPLY_STATEMENTS.join("\n");
  assert.match(joined, /GRANT SELECT, INSERT, UPDATE/u);
  assert.doesNotMatch(joined, /GRANT[^\n]*(DELETE|TRUNCATE|REFERENCES|TRIGGER)/u);
  assert.doesNotMatch(joined, /ALL TABLES|SCHEMA public TO leetplus_runtime/u);
});

test("database URL is exact loopback and cannot override connection parameters", () => {
  assert.doesNotThrow(() =>
    telegramUpdateLedgerAclReconciliationInternals.assertLoopbackDatabaseUrl(
      "postgresql://owner:secret@127.0.0.1:5432/leetplus",
      "leetplus",
    ),
  );
  for (const databaseUrl of [
    "postgresql://owner:secret@db.example.test:5432/leetplus",
    "postgresql://owner:secret@127.0.0.1:5432/leetplus?host=db.example.test",
    "postgresql://owner:secret@127.0.0.1:5432/leetplus?sslmode=disable",
  ]) {
    assert.throws(
      () =>
        telegramUpdateLedgerAclReconciliationInternals.assertLoopbackDatabaseUrl(
          databaseUrl,
          "leetplus",
        ),
      new TelegramUpdateLedgerAclReconciliationError(
        "TELEGRAM_UPDATE_LEDGER_ACL_DATABASE_URL_INVALID",
      ),
    );
  }
});

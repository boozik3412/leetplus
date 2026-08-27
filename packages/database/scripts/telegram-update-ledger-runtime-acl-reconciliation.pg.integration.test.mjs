import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  createTelegramUpdateLedgerAclPgAdapter,
  exactTelegramUpdateLedgerAclApplyConfirmation,
  runTelegramUpdateLedgerAclReconciliation,
} from "./telegram-update-ledger-runtime-acl-reconciliation.mjs";

const CONFIRMATION =
  "run-telegram-update-ledger-runtime-acl-on-disposable-postgresql";
const enabled =
  process.env.TELEGRAM_UPDATE_LEDGER_ACL_PG_INTEGRATION === CONFIRMATION;

test(
  "exact Telegram ledger ACL converges on disposable PostgreSQL",
  { skip: !enabled },
  async () => {
    const source = new URL(process.env.DATABASE_URL ?? "");
    assert.ok(["127.0.0.1", "[::1]"].includes(source.hostname));
    const database = decodeURIComponent(source.pathname.replace(/^\/+/, ""));
    assert.match(database, /^[a-z][a-z0-9_]{0,62}$/u);
    source.search = "";
    source.hash = "";

    const admin = new pg.Client({
      application_name: "leetplus-telegram-ledger-acl-pg-fixture",
      connectionString: source.toString(),
      connectionTimeoutMillis: 5_000,
    });
    await admin.connect();
    let adapter = null;
    try {
      const existingRole = await admin.query(
        "SELECT pg_catalog.count(*)::INTEGER AS count FROM pg_catalog.pg_roles WHERE rolname = 'leetplus_runtime'",
      );
      assert.equal(existingRole.rows[0].count, 0);
      await admin.query(
        "CREATE ROLE leetplus_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      );
      await admin.query(
        'GRANT SELECT, UPDATE, DELETE ON TABLE public."GuestPortalTelegramUpdateLedger" TO leetplus_runtime',
      );

      adapter = await createTelegramUpdateLedgerAclPgAdapter(
        source.toString(),
        database,
      );
      const plan = await runTelegramUpdateLedgerAclReconciliation({
        adapter,
        mode: "plan",
      });
      assert.equal(plan.decision, "PLAN_READY");
      assert.equal(plan.actionCount, 3);

      const applied = await runTelegramUpdateLedgerAclReconciliation({
        adapter,
        confirmation: exactTelegramUpdateLedgerAclApplyConfirmation(plan),
        mode: "apply",
      });
      assert.equal(applied.decision, "APPLIED");
      const checked = await runTelegramUpdateLedgerAclReconciliation({
        adapter,
        mode: "check",
      });
      assert.equal(checked.decision, "COMPLIANT");
      assert.equal(checked.actionCount, 0);

      const privileges = await admin.query(`
        SELECT privilege_type, is_grantable
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = 'GuestPortalTelegramUpdateLedger'
          AND grantee = 'leetplus_runtime'
        ORDER BY privilege_type COLLATE "C"
      `);
      assert.deepEqual(privileges.rows, [
        { is_grantable: "NO", privilege_type: "INSERT" },
        { is_grantable: "NO", privilege_type: "SELECT" },
        { is_grantable: "NO", privilege_type: "UPDATE" },
      ]);
    } finally {
      await adapter?.close().catch(() => undefined);
      await admin.query("DROP OWNED BY leetplus_runtime").catch(() => undefined);
      await admin.query("DROP ROLE IF EXISTS leetplus_runtime").catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  },
);

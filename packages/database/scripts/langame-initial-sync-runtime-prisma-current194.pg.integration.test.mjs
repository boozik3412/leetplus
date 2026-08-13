import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
  createSyntheticLangameInitialSyncRuntimePrismaCurrent194,
} from "./langame-initial-sync-runtime-prisma-current194.mjs";

const { Client } = pg;
const SOURCE_DATABASE = "leetplus_ci";
const TARGET_DATABASE = "leetplus_current194_prisma_ci";
const OWNER_ROLE = "leetplus_current194_owner_ci";
const RUNTIME_ROLE = "leetplus_langame_initial_sync_current192";
const OWNER_PASSWORD = "owner-current194-password-ci";
const RUNTIME_PASSWORD = "runtime-current194-password-ci";
const DATABASE_MARKER = "LEETPLUS_CURRENT194_PRISMA_CI_V1";
const OWNER_MARKER = "LEETPLUS_CURRENT194_OWNER_CI_V1";
const RUNTIME_MARKER = "LEETPLUS_CURRENT194_RUNTIME_CI_V1";
const CONFIRMATION =
  "run-langame-current194-actual-prisma-on-disposable-github-ci";

function admittedEnvironment() {
  assert.equal(process.env.CI, "true");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.LANGAME_CURRENT194_PRISMA_INTEGRATION, CONFIRMATION);
  const raw = process.env.DATABASE_URL;
  assert.equal(typeof raw, "string");
  const parsed = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(
    decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    SOURCE_DATABASE,
  );
  assert.equal(decodeURIComponent(parsed.username), "postgres");
  assert.equal(decodeURIComponent(parsed.password), "postgres");
  return parsed;
}

function connectionUrl(base, database, role, password) {
  const endpoint = base.port ? `${base.hostname}:${base.port}` : base.hostname;
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@${endpoint}/${database}?schema=public&connect_timeout=5&socket_timeout=30`;
}

function pgUrl(base, database) {
  const value = new URL(base.toString());
  value.pathname = `/${database}`;
  value.search = "";
  value.hash = "";
  return value.toString();
}

async function scalar(client, text, values = []) {
  const result = await client.query(text, values);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

test(
  "CURRENT194 actual separated Prisma clients register and consume on a disposable clone",
  { timeout: 120_000 },
  async () => {
    const base = admittedEnvironment();
    const maintenance = new Client({
      connectionString: pgUrl(base, "postgres"),
    });
    let databaseCreated = false;
    let ownerCreated = false;
    let runtimeCreated = false;
    let targetDatabaseOid = null;
    let ownerOid = null;
    let runtimeOid = null;
    let drivers = null;
    await maintenance.connect();
    try {
      const preflight = await scalar(
        maintenance,
        `SELECT
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_database
           WHERE datname = $1) AS "databaseCount",
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
           WHERE rolname = $2) AS "ownerCount",
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
           WHERE rolname = $3) AS "runtimeCount"`,
        [TARGET_DATABASE, OWNER_ROLE, RUNTIME_ROLE],
      );
      assert.deepEqual(preflight, {
        databaseCount: 0,
        ownerCount: 0,
        runtimeCount: 0,
      });

      await maintenance.query(
        `CREATE ROLE ${OWNER_ROLE}
         LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOREPLICATION NOBYPASSRLS PASSWORD '${OWNER_PASSWORD}'`,
      );
      ownerCreated = true;
      await maintenance.query(
        `COMMENT ON ROLE ${OWNER_ROLE} IS '${OWNER_MARKER}'`,
      );
      ownerOid = Number(
        (
          await scalar(
            maintenance,
            "SELECT oid::BIGINT AS oid FROM pg_catalog.pg_roles WHERE rolname = $1",
            [OWNER_ROLE],
          )
        ).oid,
      );

      await maintenance.query(
        `CREATE ROLE ${RUNTIME_ROLE}
         LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOREPLICATION NOBYPASSRLS PASSWORD '${RUNTIME_PASSWORD}'`,
      );
      runtimeCreated = true;
      await maintenance.query(
        `COMMENT ON ROLE ${RUNTIME_ROLE} IS '${RUNTIME_MARKER}'`,
      );
      runtimeOid = Number(
        (
          await scalar(
            maintenance,
            "SELECT oid::BIGINT AS oid FROM pg_catalog.pg_roles WHERE rolname = $1",
            [RUNTIME_ROLE],
          )
        ).oid,
      );

      await maintenance.query(
        `CREATE DATABASE ${TARGET_DATABASE} TEMPLATE ${SOURCE_DATABASE}`,
      );
      databaseCreated = true;
      await maintenance.query(
        `COMMENT ON DATABASE ${TARGET_DATABASE} IS '${DATABASE_MARKER}'`,
      );
      targetDatabaseOid = Number(
        (
          await scalar(
            maintenance,
            "SELECT oid::BIGINT AS oid FROM pg_catalog.pg_database WHERE datname = $1",
            [TARGET_DATABASE],
          )
        ).oid,
      );

      const targetAdmin = new Client({
        connectionString: pgUrl(base, TARGET_DATABASE),
      });
      await targetAdmin.connect();
      try {
        await targetAdmin.query(`
          REVOKE CREATE, TEMPORARY ON DATABASE ${TARGET_DATABASE} FROM PUBLIC;
          REVOKE ALL ON DATABASE ${TARGET_DATABASE} FROM ${RUNTIME_ROLE};
          GRANT CONNECT ON DATABASE ${TARGET_DATABASE} TO ${OWNER_ROLE};
          GRANT CONNECT ON DATABASE ${TARGET_DATABASE} TO ${RUNTIME_ROLE};
          ALTER SCHEMA public OWNER TO ${OWNER_ROLE};
          REVOKE ALL ON SCHEMA public FROM PUBLIC;
          GRANT ALL ON SCHEMA public TO ${OWNER_ROLE};
          GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE};
          GRANT ALL ON ALL TABLES IN SCHEMA public TO ${OWNER_ROLE};
          GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${OWNER_ROLE};
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RUNTIME_ROLE};
          REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${RUNTIME_ROLE};
          REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
          REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${RUNTIME_ROLE};

          ALTER FUNCTION public.langame_initial_sync_claim_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_initial_sync_execute_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_initial_sync_reconcile_current192_v1(
            TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_attestation_register_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT,
            TEXT, BIGINT, TEXT, BIGINT, TEXT, TEXT,
            TIMESTAMP(3) WITH TIME ZONE, TIMESTAMP(3) WITH TIME ZONE
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_attestation_consume_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};

          GRANT EXECUTE ON FUNCTION public.langame_initial_sync_claim_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
          GRANT EXECUTE ON FUNCTION public.langame_initial_sync_execute_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
          GRANT EXECUTE ON FUNCTION public.langame_initial_sync_reconcile_current192_v1(
            TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
          GRANT EXECUTE ON FUNCTION public.langame_runtime_attestation_consume_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
        `);
      } finally {
        await targetAdmin.end();
      }

      drivers = createSyntheticLangameInitialSyncRuntimePrismaCurrent194(
        {
          expectedDatabase: TARGET_DATABASE,
          ownerDatabaseUrl: connectionUrl(
            base,
            TARGET_DATABASE,
            OWNER_ROLE,
            OWNER_PASSWORD,
          ),
          ownerRoleName: OWNER_ROLE,
          runtimeDatabaseUrl: connectionUrl(
            base,
            TARGET_DATABASE,
            RUNTIME_ROLE,
            RUNTIME_PASSWORD,
          ),
        },
        LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
      );
      const now = Date.now();
      const registration = {
        attestationId: "attestation-current194-prisma-ci",
        catalogReceiptDigest: "2".repeat(64),
        contract: "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1",
        current192MigrationSha256:
          "cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3",
        databaseName: TARGET_DATABASE,
        databaseOid: targetDatabaseOid,
        executorRoleName: RUNTIME_ROLE,
        executorRoleOid: runtimeOid,
        issuedAt: new Date(now - 30_000).toISOString(),
        payloadDigest: "1".repeat(64),
        planDigest: "3".repeat(64),
        publicKeyFingerprint: "4".repeat(64),
        registerRequestDigest: "5".repeat(64),
        registerRequestId: "register-request-current194-prisma-ci",
        releaseSha: "a".repeat(40),
        schemaOwnerRoleName: OWNER_ROLE,
        schemaOwnerRoleOid: ownerOid,
        signingKeyId: "langame-current194-prisma-ci",
        validUntil: new Date(now + 180_000).toISOString(),
      };
      const registered =
        await drivers.ownerDriver.registerCurrent194(registration);
      assert.equal(registered[0].status, "ACTIVE");
      const consumed = await drivers.runtimeDriver.consumeCurrent194({
        attestationId: registration.attestationId,
        consumeRequestDigest: "6".repeat(64),
        consumeRequestId: "consume-request-current194-prisma-ci",
        contract: registration.contract,
        expectedCatalogReceiptDigest: registration.catalogReceiptDigest,
        expectedPayloadDigest: registration.payloadDigest,
        expectedReleaseSha: registration.releaseSha,
      });
      assert.equal(consumed[0].status, "CONSUMED");

      await assert.rejects(
        drivers.runtimeDriver.reconcileCurrent192({
          claimToken: "claim-token-current194-abcdefghijklmnopqrstuvwxyz",
          executionId: "missing-execution-current194",
          planDigest: registration.planDigest,
          tenantId: "missing-tenant-current194",
        }),
      );

      await drivers.runtimeDriver.close();
      drivers = null;
      const verify = new Client({
        connectionString: pgUrl(base, TARGET_DATABASE),
      });
      await verify.connect();
      try {
        const ledger = await scalar(
          verify,
          `
          SELECT
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeAttestationV1"
             WHERE "status" = 'CONSUMED') AS "consumedCount",
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeAttestationEventV1"
             WHERE "eventType" IN ('REGISTERED', 'CONSUMED')) AS "eventCount"
        `,
        );
        assert.deepEqual(ledger, { consumedCount: 1, eventCount: 2 });
      } finally {
        await verify.end();
      }
    } finally {
      if (drivers) {
        await drivers.runtimeDriver.close().catch(() => undefined);
      }
      if (databaseCreated) {
        const identity = await scalar(
          maintenance,
          `SELECT database_object.oid::BIGINT AS oid,
             pg_catalog.shobj_description(database_object.oid, 'pg_database') AS marker
           FROM pg_catalog.pg_database AS database_object
           WHERE database_object.datname = $1`,
          [TARGET_DATABASE],
        );
        assert.equal(Number(identity.oid), targetDatabaseOid);
        assert.equal(identity.marker, DATABASE_MARKER);
        await maintenance.query(
          "SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = $1 AND pid <> pg_catalog.pg_backend_pid()",
          [TARGET_DATABASE],
        );
        await maintenance.query(`DROP DATABASE ${TARGET_DATABASE}`);
      }
      for (const role of [
        runtimeCreated
          ? { marker: RUNTIME_MARKER, name: RUNTIME_ROLE, oid: runtimeOid }
          : null,
        ownerCreated
          ? { marker: OWNER_MARKER, name: OWNER_ROLE, oid: ownerOid }
          : null,
      ]) {
        if (!role) continue;
        const identity = await scalar(
          maintenance,
          `SELECT role_object.oid::BIGINT AS oid,
             pg_catalog.shobj_description(role_object.oid, 'pg_authid') AS marker
           FROM pg_catalog.pg_roles AS role_object WHERE role_object.rolname = $1`,
          [role.name],
        );
        assert.equal(Number(identity.oid), role.oid);
        assert.equal(identity.marker, role.marker);
        await maintenance.query(`DROP ROLE ${role.name}`);
      }
      await maintenance.end();
    }
  },
);

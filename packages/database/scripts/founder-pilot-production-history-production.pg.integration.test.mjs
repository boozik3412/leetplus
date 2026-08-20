import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";

import {
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
  FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
  createFounderPilotProductionHistoryProductionPgAdapter,
  founderPilotProductionHistoryProductionStaleRunSetDigest,
} from "./founder-pilot-production-history-production.mjs";
import { FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS } from "./founder-pilot-production-history-rehearsal.mjs";

const REQUIRED_CONFIRMATION =
  "run-founder-pilot-production-history-production-postgres-e2e";
const enabled =
  process.env.FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_PG_E2E_CONFIRM ===
  REQUIRED_CONFIRMATION;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{2,62}$/u;
const RELEASE_SHA = /^[0-9a-f]{40}$/u;
const SOURCE_HISTORY_SHA = "7de04ff4ccc814494810730be3fa6bf661097b07";
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const CAPTURED_AT = "2026-08-20T18:00:00.000Z";
const RECONCILIATION_MARKER = "FOUNDER_PRODUCTION_STALE_DIGEST_RECONCILED_V1";
const EXPECTED_STALE_RUN_SET_DIGEST =
  "4c29e4733ad455c65090b5a50f4797739cacd658d36c0abf0574f2d8fe788ec6";
const execFileAsync = promisify(execFile);
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
const ROLLED_BACK_MIGRATIONS = Object.freeze([
  Object.freeze({
    checksum:
      "81f5fae590d361bc83721c62d6a8664abde60f9e00317ab51b732189c996194f",
    migrationName: "20260619190000_guest_game_visual_editor",
  }),
  Object.freeze({
    checksum:
      "e090972dad648e997d97506f05b0e539c2351da46cdad5c6ebe5e400a113b267",
    migrationName: "20260710133000_repair_langame_credentials",
  }),
  Object.freeze({
    checksum:
      "66c3592be463c18b029ed70846829cab33c4723f4c27a8547c1e770ceea5ce00",
    migrationName: "20260718150000_guest_game_origin_fallback",
  }),
  Object.freeze({
    checksum:
      "6a87c9b399e34b3bc90262f32c329b768a5afc9d9afa9087569f3958bd48f922",
    migrationName: "20260725213500_guest_game_reward_wallet",
  }),
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationManifestDigest(rows) {
  return sha256(
    rows
      .map(({ checksum, migrationName }) => `${migrationName}\0${checksum}`)
      .sort()
      .join("\n"),
  );
}

function preterminalSqlManifestDigest(rows) {
  return sha256(
    `${rows
      .map(({ checksum, migrationName }) => `${migrationName} ${checksum}`)
      .sort()
      .join("\n")}\n`,
  );
}

async function sourceMigrationRows() {
  const migrationRoot = "packages/database/prisma/migrations";
  const tree = await execFileAsync(
    "git",
    [
      "ls-tree",
      "--full-tree",
      "-d",
      "--name-only",
      `${SOURCE_HISTORY_SHA}:${migrationRoot}`,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
      windowsHide: true,
    },
  );
  const migrationNames = tree.stdout
    .split(/\r?\n/u)
    .filter((value) => value.length > 0)
    .sort();
  assert.equal(
    migrationNames.length,
    FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount,
  );
  assert.equal(
    migrationNames.at(-1),
    FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead,
  );
  assert.equal(
    migrationNames.every((name) => /^\d{14}_[a-z0-9_]{3,100}$/u.test(name)),
    true,
  );

  const rows = [];
  for (let offset = 0; offset < migrationNames.length; offset += 12) {
    const chunk = await Promise.all(
      migrationNames.slice(offset, offset + 12).map(async (migrationName) => {
        const blob = await execFileAsync(
          "git",
          [
            "show",
            `${SOURCE_HISTORY_SHA}:${migrationRoot}/${migrationName}/migration.sql`,
          ],
          {
            cwd: REPOSITORY_ROOT,
            encoding: null,
            maxBuffer: 4 * 1024 * 1024,
            timeout: 5_000,
            windowsHide: true,
          },
        );
        return {
          checksum:
            LEGACY_APPLIED_CHECKSUMS.get(migrationName) ?? sha256(blob.stdout),
          migrationName,
        };
      }),
    );
    rows.push(...chunk);
  }
  assert.equal(
    migrationManifestDigest(rows),
    FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest,
  );
  assert.equal(
    migrationManifestDigest(ROLLED_BACK_MIGRATIONS),
    FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
  );
  return rows;
}

function staleRows() {
  return Array.from({ length: 4 }, (_, index) => ({
    completedAt: null,
    createdAt: new Date(`2026-06-0${index + 1}T00:00:00.000Z`),
    errorMessage: null,
    executionRevision: null,
    id: `11111111-1111-4111-8111-11111111111${index}`,
    scheduledForDate: `2026-06-0${index + 1}`,
    sentCount: 0,
    startedAt: new Date(`2026-06-0${index + 1}T00:00:00.000Z`),
    status: "RUNNING",
    tenantId: `22222222-2222-4222-8222-22222222222${index}`,
    type: "WEEKLY",
    updatedAt: new Date(`2026-06-0${index + 1}T00:00:01.000Z`),
  }));
}

function requiredDisposableAdminUrl() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_NODE_ENV_REQUIRED");
  }
  const raw = process.env.DATABASE_URL;
  if (
    typeof raw !== "string" ||
    raw.length > 8192 ||
    /[\u0000-\u0020\u007f]/u.test(raw)
  ) {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_DATABASE_URL_REQUIRED");
  }
  let source;
  try {
    source = new URL(raw);
  } catch {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_DATABASE_URL_INVALID");
  }
  let databaseName;
  let roleName;
  let password;
  try {
    databaseName = decodeURIComponent(source.pathname.slice(1));
    roleName = decodeURIComponent(source.username);
    password = decodeURIComponent(source.password);
  } catch {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_DATABASE_URL_INVALID");
  }
  const searchEntries = [...source.searchParams.entries()];
  if (
    source.protocol !== "postgresql:" ||
    source.hostname !== "127.0.0.1" ||
    source.port !== "5432" ||
    databaseName !== "leetplus_ci" ||
    roleName !== "postgres" ||
    password.length === 0 ||
    source.hash !== "" ||
    searchEntries.length !== 1 ||
    searchEntries[0][0] !== "schema" ||
    searchEntries[0][1] !== "public"
  ) {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_DATABASE_URL_FORBIDDEN");
  }
  const adminUrl = new URL(source);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  adminUrl.searchParams.set(
    "application_name",
    "founder_production_history_pg16_fixture_admin",
  );
  return adminUrl;
}

function quotedIdentifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function quotedPassword(value) {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_PASSWORD_INVALID");
  }
  return `'${value}'`;
}

function credentialUrl(baseUrl, databaseName, roleName, password) {
  const value = new URL(baseUrl);
  value.pathname = `/${databaseName}`;
  value.username = roleName;
  value.password = password;
  value.search = "";
  return value;
}

function canonicalMigrationUrl(
  databaseName,
  migrationRoleName,
  migrationPassword,
  objectOwnerRoleName,
) {
  return (
    `postgresql://${migrationRoleName}:${migrationPassword}` +
    `@127.0.0.1:5432/${databaseName}` +
    `?options=-c%20role%3D${objectOwnerRoleName}`
  );
}

function productionManifest({
  databaseName,
  expectedStaleRunSetDigest,
  migrationRoleName,
  migrationRoleOid,
  objectOwnerRoleName,
  objectOwnerRoleOid,
  systemIdentifier,
}) {
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey
    .export({ format: "pem", type: "spki" })
    .toString("utf8");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const releaseSha = process.env.CI_RELEASE_SHA;
  if (!RELEASE_SHA.test(releaseSha ?? "")) {
    throw new Error("FOUNDER_PRODUCTION_HISTORY_PG_E2E_RELEASE_SHA_REQUIRED");
  }
  return {
    approval: {
      keyId: "founder-history-pg16-ci",
      maxPlanAgeSeconds: 300,
      publicKeyPem,
      publicKeySpkiSha256: sha256(publicKeyDer),
    },
    contractVersion: FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONTRACT,
    environment: "PRODUCTION",
    operation: {
      deployTimeoutSeconds: 60,
      expectedStaleRunSetDigest,
    },
    release: {
      artifactPath: path.resolve("founder-history-pg16-ci-artifact.tar.gz"),
      artifactSha256: sha256("pg16-ci-artifact"),
      materializedTreeDigest: sha256("pg16-ci-materialized-tree"),
      releaseSha,
    },
    target: {
      applicationRuntimeRoles: [
        { name: objectOwnerRoleName, oid: objectOwnerRoleOid },
      ],
      databaseName,
      expectedServerMajor: 16,
      expectedSystemIdentifier: systemIdentifier,
      host: "127.0.0.1",
      migrationRoleName,
      migrationRoleOid,
      objectOwnerRoleName,
      objectOwnerRoleOid,
      port: 5432,
    },
  };
}

async function closeClient(client, errors) {
  if (client === null) return;
  try {
    await client.end();
  } catch (error) {
    errors.push(error);
  }
}

async function captureCleanupError(operation, errors) {
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
}

function boundedFailureSummary(error) {
  const name =
    typeof error?.name === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name)
      ? error.name
      : "Error";
  const code =
    typeof error?.code === "string" && /^[A-Z0-9_]{1,64}$/u.test(error.code)
      ? error.code
      : "NO_CODE";
  const message = String(error?.message ?? "UNKNOWN")
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/giu, "postgresql://[redacted]@")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .slice(0, 512);
  return `${name}:${code}:${message}`;
}

test(
  "production-history adapter executes its exact SQL and role topology on PostgreSQL 16",
  { skip: !enabled, timeout: 60_000 },
  async () => {
    assert.equal(process.env.TZ, "America/New_York");
    const adminUrl = requiredDisposableAdminUrl();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const databaseName = `lp_history_${suffix}_ci`;
    const objectOwnerRoleName = `lp_history_owner_${suffix}`;
    const migrationRoleName = `lp_history_migrate_${suffix}`;
    const objectOwnerPassword = randomBytes(32).toString("hex");
    const migrationPassword = randomBytes(32).toString("hex");
    const quotedDatabase = quotedIdentifier(databaseName);
    const quotedObjectOwner = quotedIdentifier(objectOwnerRoleName);
    const quotedMigrationRole = quotedIdentifier(migrationRoleName);
    const appliedMigrations = await sourceMigrationRows();
    const expectedStaleRows = staleRows();
    const staleRunSetDigest =
      founderPilotProductionHistoryProductionStaleRunSetDigest(
        expectedStaleRows,
        CAPTURED_AT,
      );
    assert.equal(staleRunSetDigest, EXPECTED_STALE_RUN_SET_DIGEST);

    let admin = null;
    let runtime = null;
    let adapter = null;
    let ownerCreateAttempted = false;
    let migrationCreateAttempted = false;
    let databaseCreateAttempted = false;
    let operationError = null;

    try {
      admin = new pg.Client({
        application_name: "founder_production_history_pg16_fixture_admin",
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      await admin.connect();
      const cluster = await admin.query(`
        SELECT
          pg_catalog.current_database() AS "databaseName",
          SESSION_USER AS "sessionRoleName",
          pg_catalog.host(pg_catalog.inet_server_addr()) AS "serverAddress",
          pg_catalog.inet_server_port()::INTEGER AS "serverPort",
          (pg_catalog.current_setting('server_version_num')::INTEGER / 10000)
            AS "serverMajor",
          (pg_catalog.pg_control_system()).system_identifier::TEXT
            AS "systemIdentifier",
          pg_catalog.pg_is_in_recovery() AS "inRecovery"
      `);
      assert.deepEqual(cluster.rows[0], {
        databaseName: "postgres",
        inRecovery: false,
        serverAddress: "127.0.0.1",
        serverMajor: 16,
        serverPort: 5432,
        sessionRoleName: "postgres",
        systemIdentifier: cluster.rows[0].systemIdentifier,
      });
      assert.match(cluster.rows[0].systemIdentifier, /^\d{10,24}$/u);

      const collision = await admin.query(
        `
          SELECT
            pg_catalog.to_regrole($1) IS NOT NULL AS "ownerRoleExists",
            pg_catalog.to_regrole($2) IS NOT NULL AS "migrationRoleExists",
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_database AS database_row
              WHERE database_row.datname = $3
            ) AS "databaseExists"
        `,
        [objectOwnerRoleName, migrationRoleName, databaseName],
      );
      assert.deepEqual(collision.rows[0], {
        databaseExists: false,
        migrationRoleExists: false,
        ownerRoleExists: false,
      });

      ownerCreateAttempted = true;
      await admin.query(
        `CREATE ROLE ${quotedObjectOwner} LOGIN PASSWORD ${quotedPassword(
          objectOwnerPassword,
        )} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      migrationCreateAttempted = true;
      await admin.query(
        `CREATE ROLE ${quotedMigrationRole} LOGIN PASSWORD ${quotedPassword(
          migrationPassword,
        )} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(
        `GRANT ${quotedObjectOwner} TO ${quotedMigrationRole} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      await admin.query(
        `ALTER ROLE ${quotedMigrationRole} SET timezone = 'Asia/Yekaterinburg'`,
      );
      databaseCreateAttempted = true;
      await admin.query(
        `CREATE DATABASE ${quotedDatabase} WITH OWNER ${quotedObjectOwner} TEMPLATE template0`,
      );

      const roleRows = await admin.query(
        `
          SELECT role.rolname AS "name", role.oid::INTEGER AS "oid"
          FROM pg_catalog.pg_roles AS role
          WHERE role.rolname = ANY($1::TEXT[])
          ORDER BY role.rolname COLLATE "C"
        `,
        [[migrationRoleName, objectOwnerRoleName]],
      );
      assert.equal(roleRows.rows.length, 2);
      const migrationRole = roleRows.rows.find(
        (role) => role.name === migrationRoleName,
      );
      const objectOwnerRole = roleRows.rows.find(
        (role) => role.name === objectOwnerRoleName,
      );
      assert.ok(migrationRole);
      assert.ok(objectOwnerRole);
      await admin.end();
      admin = null;

      const runtimeUrl = credentialUrl(
        adminUrl,
        databaseName,
        objectOwnerRoleName,
        objectOwnerPassword,
      );
      runtimeUrl.searchParams.set(
        "application_name",
        "founder_production_history_pg16_fixture_runtime",
      );
      runtime = new pg.Client({
        connectionString: runtimeUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      await runtime.connect();
      await runtime.query("SET statement_timeout = '10s'");
      await runtime.query("SET TIME ZONE 'Asia/Yekaterinburg'");
      await runtime.query(`
        CREATE TABLE public."_prisma_migrations" (
          "migration_name" TEXT NOT NULL,
          "checksum" TEXT NOT NULL,
          "finished_at" TIMESTAMPTZ,
          "rolled_back_at" TIMESTAMPTZ,
          "started_at" TIMESTAMPTZ NOT NULL
        )
      `);
      await runtime.query(
        `
          INSERT INTO public."_prisma_migrations" (
            "migration_name", "checksum", "finished_at", "rolled_back_at",
            "started_at"
          )
          SELECT
            migration_row."migrationName",
            migration_row."checksum",
            TIMESTAMPTZ '2026-08-01 00:00:01+00',
            NULL,
            TIMESTAMPTZ '2026-08-01 00:00:00+00'
          FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS migration_row(
            "migrationName" TEXT,
            "checksum" TEXT
          )
        `,
        [JSON.stringify(appliedMigrations)],
      );
      await runtime.query(
        `
          INSERT INTO public."_prisma_migrations" (
            "migration_name", "checksum", "finished_at", "rolled_back_at",
            "started_at"
          )
          SELECT
            migration_row."migrationName",
            migration_row."checksum",
            NULL,
            TIMESTAMPTZ '2026-08-01 00:00:03+00',
            TIMESTAMPTZ '2026-08-01 00:00:02+00'
          FROM pg_catalog.jsonb_to_recordset($1::jsonb) AS migration_row(
            "migrationName" TEXT,
            "checksum" TEXT
          )
        `,
        [JSON.stringify(ROLLED_BACK_MIGRATIONS)],
      );
      await runtime.query(`
        CREATE TABLE public."ReportDigestScheduleRun" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "tenantId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "scheduledForDate" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "sentCount" INTEGER NOT NULL,
          "startedAt" TIMESTAMP(3),
          "completedAt" TIMESTAMP(3),
          "errorMessage" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL,
          "updatedAt" TIMESTAMP(3) NOT NULL
        )
      `);
      for (const row of expectedStaleRows) {
        await runtime.query(
          `
            INSERT INTO public."ReportDigestScheduleRun" (
              "id", "tenantId", "type", "scheduledForDate", "status",
              "sentCount", "startedAt", "completedAt", "errorMessage",
              "createdAt", "updatedAt"
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              ($7::timestamptz AT TIME ZONE 'UTC'),
              NULL,
              NULL,
              ($8::timestamptz AT TIME ZONE 'UTC'),
              ($9::timestamptz AT TIME ZONE 'UTC')
            )
          `,
          [
            row.id,
            row.tenantId,
            row.type,
            row.scheduledForDate,
            row.status,
            row.sentCount,
            row.startedAt.toISOString(),
            row.createdAt.toISOString(),
            row.updatedAt.toISOString(),
          ],
        );
      }
      await runtime.query(`
        CREATE FUNCTION public."identity_mail_delivery_worker_assert_v1"(TEXT)
        RETURNS BOOLEAN
        LANGUAGE SQL
        IMMUTABLE
        AS 'SELECT TRUE'
      `);

      const manifest = productionManifest({
        databaseName,
        expectedStaleRunSetDigest: staleRunSetDigest,
        migrationRoleName,
        migrationRoleOid: migrationRole.oid,
        objectOwnerRoleName,
        objectOwnerRoleOid: objectOwnerRole.oid,
        systemIdentifier: cluster.rows[0].systemIdentifier,
      });
      adapter = await createFounderPilotProductionHistoryProductionPgAdapter(
        canonicalMigrationUrl(
          databaseName,
          migrationRoleName,
          migrationPassword,
          objectOwnerRoleName,
        ),
        manifest,
        {
          productionConfirmation:
            FOUNDER_PILOT_PRODUCTION_HISTORY_PRODUCTION_CONFIRMATION,
        },
      );

      const evidence = await adapter.inspectTarget();
      const identity = evidence.identity;
      assert.equal(identity.currentDatabase, databaseName);
      assert.equal(identity.databaseOwnerRoleName, objectOwnerRoleName);
      assert.equal(identity.databaseOwnerRoleOid, objectOwnerRole.oid);
      assert.equal(identity.sessionRoleName, migrationRoleName);
      assert.equal(identity.sessionRoleOid, migrationRole.oid);
      assert.equal(identity.sessionRoleCanLogin, true);
      assert.equal(identity.sessionRoleCreateDb, false);
      assert.equal(identity.sessionRoleCreateRole, false);
      assert.equal(identity.sessionRoleInherit, false);
      assert.equal(identity.sessionRoleReplication, false);
      assert.equal(identity.sessionRoleSuperuser, false);
      assert.equal(identity.sessionRoleBypassRls, false);
      assert.equal(identity.sessionDirectMembershipCount, 1);
      assert.equal(identity.sessionOwnerMembershipCount, 1);
      assert.equal(identity.sessionOwnerMembershipAdminOption, false);
      assert.equal(identity.sessionOwnerMembershipInheritOption, false);
      assert.equal(identity.sessionOwnerMembershipSetOption, true);
      assert.equal(identity.currentRoleName, objectOwnerRoleName);
      assert.equal(identity.currentRoleOid, objectOwnerRole.oid);
      assert.equal(identity.currentRoleCanLogin, true);
      assert.equal(identity.currentRoleCreateDb, false);
      assert.equal(identity.currentRoleCreateRole, false);
      assert.equal(identity.currentRoleReplication, false);
      assert.equal(identity.currentRoleSuperuser, false);
      assert.equal(identity.currentRoleBypassRls, false);
      assert.equal(identity.currentRoleDirectMembershipCount, 0);
      assert.equal(identity.publicClassOwnerMismatchCount, 0);
      assert.equal(identity.publicProcOwnerMismatchCount, 0);
      assert.equal(identity.publicTypeOwnerMismatchCount, 0);
      assert.equal(identity.serverAddress, "127.0.0.1");
      assert.equal(identity.serverPort, 5432);
      assert.equal(identity.serverMajor, 16);
      assert.equal(identity.systemIdentifier, cluster.rows[0].systemIdentifier);
      assert.equal(identity.inRecovery, false);
      assert.deepEqual(identity.activeRuntimeRoleNames, [objectOwnerRoleName]);
      assert.deepEqual(identity.runtimeRoles, [
        {
          bypassRls: false,
          canLogin: true,
          createDb: false,
          createRole: false,
          name: objectOwnerRoleName,
          oid: objectOwnerRole.oid,
          replication: false,
          superuser: false,
        },
      ]);
      assert.equal(
        evidence.migrationCount,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount,
      );
      assert.equal(
        evidence.migrationHead,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationHead,
      );
      assert.equal(
        evidence.migrationManifestDigest,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationManifestDigest,
      );
      assert.equal(
        evidence.rolledBackMigrationCount,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
      );
      assert.equal(
        evidence.rolledBackMigrationManifestDigest,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationManifestDigest,
      );
      assert.equal(evidence.unfinishedMigrationCount, 0);
      assert.equal(evidence.runningDigestRows.length, expectedStaleRows.length);
      for (const [index, row] of evidence.runningDigestRows.entries()) {
        const expected = expectedStaleRows[index];
        assert.equal(row.id, expected.id);
        assert.equal(row.tenantId, expected.tenantId);
        assert.equal(row.scheduledForDate, expected.scheduledForDate);
        assert.equal(row.executionRevision, null);
        assert.equal(
          row.startedAt.toISOString(),
          expected.startedAt.toISOString(),
        );
        assert.equal(row.completedAt, null);
        assert.equal(
          row.createdAt.toISOString(),
          expected.createdAt.toISOString(),
        );
        assert.equal(
          row.updatedAt.toISOString(),
          expected.updatedAt.toISOString(),
        );
      }
      const legacyColumn = await runtime.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid =
            'public."ReportDigestScheduleRun"'::pg_catalog.regclass
            AND attribute.attname = 'executionRevision'
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
        ) AS "exists"
      `);
      assert.equal(legacyColumn.rows[0].exists, false);
      assert.equal(
        await adapter.inspectReconciliation({ staleRunSetDigest }),
        "NOT_APPLIED",
      );

      await adapter.acquireLock();
      await adapter.assertLock();
      await adapter.recoverLock();
      await adapter.assertLock();
      const reconnectedEvidence = await adapter.inspectTarget();
      assert.equal(
        reconnectedEvidence.identity.sessionRoleName,
        migrationRoleName,
      );
      assert.equal(
        reconnectedEvidence.identity.currentRoleName,
        objectOwnerRoleName,
      );
      assert.equal(
        await adapter.reconcile({ staleRunSetDigest }, CAPTURED_AT),
        expectedStaleRows.length,
      );
      assert.equal(
        await adapter.inspectReconciliation({ staleRunSetDigest }),
        "APPLIED",
      );
      const reconciledRows = await runtime.query(`
        SELECT
          run."id",
          run."status",
          run."errorMessage",
          pg_catalog.to_char(
            run."completedAt",
            'YYYY-MM-DD"T"HH24:MI:SS.MS'
          ) AS "completedWallClock",
          pg_catalog.to_char(
            run."updatedAt",
            'YYYY-MM-DD"T"HH24:MI:SS.MS'
          ) AS "updatedWallClock"
        FROM public."ReportDigestScheduleRun" AS run
        ORDER BY run."id" COLLATE "C"
      `);
      assert.equal(reconciledRows.rows.length, expectedStaleRows.length);
      for (const [index, row] of reconciledRows.rows.entries()) {
        assert.equal(row.id, expectedStaleRows[index].id);
        assert.equal(row.status, "FAILED");
        assert.equal(
          row.errorMessage,
          `${RECONCILIATION_MARKER}:${staleRunSetDigest}`,
        );
        assert.equal(row.completedWallClock, "2026-08-20T18:00:00.000");
        assert.equal(row.updatedWallClock, "2026-08-20T18:00:00.000");
      }
      const reconciledEvidence = await adapter.inspectTarget();
      assert.equal(
        reconciledEvidence.migrationCount,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceMigrationCount,
      );
      assert.equal(
        reconciledEvidence.rolledBackMigrationCount,
        FOUNDER_PILOT_PRODUCTION_HISTORY_CONSTANTS.sourceRolledBackMigrationCount,
      );
      assert.equal(reconciledEvidence.unfinishedMigrationCount, 0);
      assert.deepEqual(reconciledEvidence.runningDigestRows, []);
      const final = await adapter.inspectFinal();
      assert.equal(
        final.preterminalManifestDigest,
        preterminalSqlManifestDigest(appliedMigrations),
      );
      assert.equal(final.workerFunctionDigest, sha256("SELECT TRUE"));
      await adapter.releaseLock();
      await adapter.close();
      adapter = null;
      await runtime.end();
      runtime = null;
    } catch (error) {
      operationError = error;
    }

    const cleanupErrors = [];
    if (adapter !== null) {
      try {
        await adapter.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
      adapter = null;
    }
    await closeClient(runtime, cleanupErrors);
    runtime = null;
    await closeClient(admin, cleanupErrors);
    admin = null;

    if (
      databaseCreateAttempted ||
      migrationCreateAttempted ||
      ownerCreateAttempted
    ) {
      const cleanup = new pg.Client({
        application_name: "founder_production_history_pg16_fixture_cleanup",
        connectionString: adminUrl.toString(),
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
      });
      let cleanupConnected = false;
      await captureCleanupError(async () => {
        await cleanup.connect();
        cleanupConnected = true;
      }, cleanupErrors);
      if (cleanupConnected && databaseCreateAttempted) {
        await captureCleanupError(
          async () =>
            cleanup.query(
              `
                SELECT pg_catalog.pg_terminate_backend(activity.pid)
                FROM pg_catalog.pg_stat_activity AS activity
                WHERE activity.datname = $1
                  AND activity.pid <> pg_catalog.pg_backend_pid()
              `,
              [databaseName],
            ),
          cleanupErrors,
        );
        await captureCleanupError(async () => {
          const databaseExists = await cleanup.query(
            `
              SELECT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_database AS database_row
                WHERE database_row.datname = $1
              ) AS "exists"
            `,
            [databaseName],
          );
          if (databaseExists.rows[0].exists === true) {
            await cleanup.query(`DROP DATABASE ${quotedDatabase}`);
          }
        }, cleanupErrors);
      }
      if (cleanupConnected && migrationCreateAttempted) {
        await captureCleanupError(async () => {
          const roleExists = await cleanup.query(
            'SELECT pg_catalog.to_regrole($1) IS NOT NULL AS "exists"',
            [migrationRoleName],
          );
          if (roleExists.rows[0].exists === true) {
            await cleanup.query(`DROP ROLE ${quotedMigrationRole}`);
          }
        }, cleanupErrors);
      }
      if (cleanupConnected && ownerCreateAttempted) {
        await captureCleanupError(async () => {
          const roleExists = await cleanup.query(
            'SELECT pg_catalog.to_regrole($1) IS NOT NULL AS "exists"',
            [objectOwnerRoleName],
          );
          if (roleExists.rows[0].exists === true) {
            await cleanup.query(`DROP ROLE ${quotedObjectOwner}`);
          }
        }, cleanupErrors);
      }
      await closeClient(cleanup, cleanupErrors);
    }

    if (operationError !== null || cleanupErrors.length > 0) {
      const failures = [operationError, ...cleanupErrors].filter(
        (error) => error !== null,
      );
      throw new AggregateError(
        failures,
        `FOUNDER_PRODUCTION_HISTORY_PG_E2E_FAILED:${boundedFailureSummary(
          failures[0],
        )}`,
        { cause: failures[0] },
      );
    }
  },
);

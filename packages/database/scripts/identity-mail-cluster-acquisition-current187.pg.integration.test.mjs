import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import prismaPackage from "@prisma/client";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_CLUSTER_ACQUISITION_CONFIRMATION,
  CURRENT187_CLUSTER_ACQUISITION_KIND,
  CURRENT187_CLUSTER_ACQUISITION_PROFILE,
  CURRENT187_CLUSTER_ACQUISITION_SLICE,
  CURRENT187_EXTERNAL_DDL_FENCE_RECEIPT_KIND,
  acquireCurrent187ClusterInventory,
} from "./identity-mail-cluster-acquisition-current187.mjs";
import { CURRENT187_DATABASE_SNAPSHOT_SQL } from "./identity-mail-cluster-acquisition-current187-sql.mjs";

const { PrismaClient } = prismaPackage;

const PG_CONFIRMATION =
  "run-current187-read-only-cluster-acquisition-postgres-e2e";
const enabled =
  process.env.IDENTITY_MAIL_CLUSTER_ACQUISITION_CURRENT187_PG_E2E_CONFIRM ===
  PG_CONFIRMATION;

function requireDisposableAdminUrl() {
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    throw new Error("CURRENT187 PG acceptance requires DATABASE_URL.");
  }
  const url = new URL(raw);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !/_(?:ci|test)$/u.test(databaseName) ||
    /(?:^|_)(?:live|prod|production)(?:_|$)/u.test(databaseName) ||
    ["postgres", "template0", "template1"].includes(databaseName)
  ) {
    throw new Error(
      "CURRENT187 PG acceptance is restricted to a loopback *_ci/*_test database.",
    );
  }
  return url;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function prismaFor(url) {
  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
}

function databaseUrl(baseUrl, databaseName, username, password) {
  const url = new URL(baseUrl.toString());
  url.pathname = `/${databaseName}`;
  url.username = username;
  url.password = password;
  url.searchParams.delete("schema");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "5");
  url.searchParams.set("socket_timeout", "20");
  return url;
}

function expectedDatabase(row) {
  return {
    collate: row.collate,
    connectionLimit: row.connectionLimit,
    ctype: row.ctype,
    datallowconn: row.datallowconn,
    encoding: row.encoding,
    isTemplate: row.isTemplate,
    localeProvider: row.localeProvider,
    name: row.name,
    oid: Number(row.oid),
    ownerName: row.ownerName,
    ownerOid: Number(row.ownerOid),
  };
}

async function terminateDatabaseSessions(admin, databaseNames, roleName) {
  const databaseList = databaseNames
    .map((databaseName) => `'${databaseName.replaceAll("'", "''")}'`)
    .join(", ");
  const roleLiteral = roleName.replaceAll("'", "''");
  await admin.$queryRawUnsafe(
    `SELECT pg_catalog.pg_terminate_backend(activity.pid)
       FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.pid <> pg_catalog.pg_backend_pid()
        AND (activity.datname IN (${databaseList}) OR activity.usename = '${roleLiteral}')`,
  );
}

test(
  "CURRENT187-C scans an exhaustive disposable multi-database PostgreSQL 16 cluster read-only",
  { skip: !enabled, timeout: 180_000 },
  async () => {
    const adminUrl = requireDisposableAdminUrl();
    const admin = prismaFor(adminUrl);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const scannerRole = `lp_c187_scan_${suffix}`;
    const controlDatabase = `lp_c187_control_${suffix}_ci`;
    const secondDatabase = `lp_c187_second_${suffix}_ci`;
    const scannerPassword = randomBytes(32).toString("hex");
    const fixtureDatabases = [controlDatabase, secondDatabase];
    const clients = new Set();
    const grantedDatabaseNames = [];
    let adminConnected = false;
    let scannerRoleCreated = false;

    try {
      await admin.$connect();
      adminConnected = true;
      await admin.$executeRawUnsafe(
        `CREATE ROLE ${quoteIdentifier(scannerRole)}
           LOGIN PASSWORD '${scannerPassword}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      scannerRoleCreated = true;
      await admin.$executeRawUnsafe(
        `GRANT pg_monitor TO ${quoteIdentifier(scannerRole)}`,
      );
      for (const databaseName of fixtureDatabases) {
        await admin.$executeRawUnsafe(
          `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
        );
      }

      const snapshotRows = await admin.$queryRawUnsafe(
        CURRENT187_DATABASE_SNAPSHOT_SQL,
      );
      const expectedRows = snapshotRows.map(expectedDatabase);
      const nonTemplateDatabases = expectedRows.filter(
        (database) => !database.isTemplate,
      );
      const templateDatabases = expectedRows.filter(
        (database) => database.isTemplate,
      );
      assert.ok(nonTemplateDatabases.length >= 4);
      assert.ok(templateDatabases.length >= 2);
      assert.ok(
        nonTemplateDatabases.every((database) => database.datallowconn),
      );
      for (const database of nonTemplateDatabases) {
        await admin.$executeRawUnsafe(
          `GRANT CONNECT ON DATABASE ${quoteIdentifier(database.name)} TO ${quoteIdentifier(scannerRole)}`,
        );
        grantedDatabaseNames.push(database.name);
      }

      const now = Date.now();
      const request = {
        contract: CURRENT187_ADMISSION_CONTRACT,
        expectedCatalog: {
          catalogRowsComplete: true,
          nonTemplateDatabases,
          templateDatabases,
        },
        externalDdlFenceReceipt: {
          attestationStatus: "DECLARED_UNVERIFIED",
          fence: {
            active: true,
            clusterDdlBlocked: true,
            creatorPrincipalsDisabled: true,
            databaseDdlBlocked: true,
            evidenceDigest: createHash("sha256")
              .update(`current187-fence-${suffix}`)
              .digest("hex"),
            fenceEpoch: "1",
            migrationPrincipalsDisabled: true,
            validFrom: new Date(now - 60_000).toISOString(),
            validUntil: new Date(now + 20 * 60_000).toISOString(),
          },
          kind: CURRENT187_EXTERNAL_DDL_FENCE_RECEIPT_KIND,
        },
        kind: CURRENT187_CLUSTER_ACQUISITION_KIND,
        profile: CURRENT187_CLUSTER_ACQUISITION_PROFILE,
        schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
        slice: CURRENT187_CLUSTER_ACQUISITION_SLICE,
        syntheticContext: {
          connectionTimeoutMs: 5_000,
          databaseName: controlDatabase,
          endpointHost:
            adminUrl.hostname === "localhost" ? "127.0.0.1" : adminUrl.hostname,
          environment: "ci",
          explicitConfirmation: CURRENT187_CLUSTER_ACQUISITION_CONFIRMATION,
          nodeEnv: "test",
          scannerRoleName: scannerRole,
          statementTimeoutMs: 10_000,
        },
        topologyDigest: createHash("sha256")
          .update(`current187-topology-${suffix}`)
          .digest("hex"),
      };

      const receipt = await acquireCurrent187ClusterInventory(request, {
        connect: async (databaseName) => {
          const client = prismaFor(
            databaseUrl(adminUrl, databaseName, scannerRole, scannerPassword),
          );
          clients.add(client);
          await client.$connect();
          return {
            close: async () => {
              await client.$disconnect();
              clients.delete(client);
            },
            query: async (sql) => {
              const normalized = sql
                .replace(/\/\*[\s\S]*?\*\//gu, "")
                .trimStart();
              if (/^(?:SELECT|WITH)\b/iu.test(normalized)) {
                return client.$queryRawUnsafe(sql);
              }
              await client.$executeRawUnsafe(sql);
              return [];
            },
          };
        },
        now: () => new Date().toISOString(),
      });

      assert.equal(
        receipt.acquisitionStatus,
        "ACQUIRED",
        JSON.stringify(receipt.reasonCodes),
      );
      assert.equal(receipt.plannerReceipt.inventoryStatus, "MATCHED");
      assert.equal(receipt.authorization, false);
      assert.equal(receipt.canMutate, false);
      assert.equal(receipt.canSend, false);
      assert.equal(receipt.testAccessAuthorized, false);
      assert.equal(receipt.sharedBetaAccess, false);
      assert.equal(receipt.productionRootEnrolled, false);
      assert.equal(receipt.externalDdlFenceAttested, false);
    } finally {
      for (const client of clients) {
        await client.$disconnect().catch(() => undefined);
      }
      if (adminConnected) {
        await terminateDatabaseSessions(
          admin,
          fixtureDatabases,
          scannerRole,
        ).catch(() => undefined);
        if (scannerRoleCreated) {
          for (const databaseName of grantedDatabaseNames) {
            await admin
              .$executeRawUnsafe(
                `REVOKE CONNECT ON DATABASE ${quoteIdentifier(databaseName)} FROM ${quoteIdentifier(scannerRole)}`,
              )
              .catch(() => undefined);
          }
        }
        for (const databaseName of [...fixtureDatabases].reverse()) {
          await admin.$executeRawUnsafe(
            `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
          );
        }
        await admin.$executeRawUnsafe(
          `DROP ROLE IF EXISTS ${quoteIdentifier(scannerRole)}`,
        );
        const residue = await admin.$queryRawUnsafe(
          `SELECT
             (SELECT count(*)::integer FROM pg_catalog.pg_database WHERE datname = ANY($1::text[])) AS "databaseCount",
             (SELECT count(*)::integer FROM pg_catalog.pg_roles WHERE rolname = $2) AS "roleCount"`,
          fixtureDatabases,
          scannerRole,
        );
        assert.deepEqual(residue, [{ databaseCount: 0, roleCount: 0 }]);
        await admin.$disconnect();
      }
    }
  },
);

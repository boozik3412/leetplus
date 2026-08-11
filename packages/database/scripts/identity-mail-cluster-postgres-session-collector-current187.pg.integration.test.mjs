import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  CURRENT187_POSTGRES_SESSION_STATUS,
  CURRENT187_POSTGRES_SESSION_SYNTHETIC_CONFIRMATION,
  collectSyntheticCurrent187PostgresSessionEvidenceWithPrismaForTestOnly,
  isVerifiedCurrent187PostgresSessionReceipt,
} from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const PG_CONFIRMATION =
  "run-current187-postgres-backend-session-collector-postgres-e2e";
const APPLICATION_NAME = "leetplus.current187.j1.postgres.ci";
const enabled =
  process.env
    .IDENTITY_MAIL_POSTGRES_SESSION_COLLECTOR_CURRENT187_PG_E2E_CONFIRM ===
  PG_CONFIRMATION;

function digest(label) {
  return createHash("sha256").update(label, "utf8").digest("hex");
}

function requireDisposableUrl() {
  const raw = process.env.DATABASE_URL;
  if (typeof raw !== "string") {
    throw new Error(
      "CURRENT187-J1 PostgreSQL acceptance requires DATABASE_URL.",
    );
  }
  const url = new URL(raw);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//u, ""));
  const roleName = decodeURIComponent(url.username);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    !/_(?:ci|test)$/u.test(databaseName) ||
    /(?:^|_)(?:live|prod|production)(?:_|$)/u.test(databaseName) ||
    ["postgres", "template0", "template1"].includes(databaseName) ||
    roleName.length === 0 ||
    decodeURIComponent(url.password).length === 0 ||
    url.port.length === 0
  ) {
    throw new Error(
      "CURRENT187-J1 PostgreSQL acceptance is restricted to an explicit loopback *_ci/*_test database.",
    );
  }
  url.search = "";
  url.searchParams.set("application_name", APPLICATION_NAME);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("sslmode", "disable");
  return { databaseName, roleName, url };
}

test(
  "CURRENT187-J1 observes the actual Prisma PostgreSQL backend session without authorizing access",
  { skip: !enabled, timeout: 30_000 },
  async () => {
    const fixture = requireDisposableUrl();
    const identityClient = new PrismaClient({
      datasourceUrl: fixture.url.toString(),
      log: [],
    });
    let identity;
    try {
      identity = await identityClient.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const rows = await transaction.$queryRawUnsafe(`
          SELECT
            pg_catalog.current_database()::TEXT AS "databaseName",
            database_row.oid::TEXT AS "databaseOid",
            session_user::TEXT AS "roleName",
            role_row.oid::TEXT AS "roleOid"
          FROM pg_catalog.pg_database AS database_row
          INNER JOIN pg_catalog.pg_roles AS role_row
            ON role_row.rolname = session_user
          WHERE database_row.datname = pg_catalog.current_database()
        `);
        assert.equal(rows.length, 1);
        return rows[0];
      });
    } finally {
      await identityClient.$disconnect();
    }

    assert.equal(identity.databaseName, fixture.databaseName);
    assert.equal(identity.roleName, fixture.roleName);
    const releaseSha = process.env.CI_RELEASE_SHA;
    const receipt =
      await collectSyntheticCurrent187PostgresSessionEvidenceWithPrismaForTestOnly(
        {
          applicationName: APPLICATION_NAME,
          clusterIdentityDigest: digest("current187-j1-ci-cluster"),
          databaseUniverseDigest: digest("current187-j1-ci-universe"),
          databaseUrl: fixture.url.toString(),
          environment: "ci",
          expectedDatabaseName: identity.databaseName,
          expectedDatabaseOid: identity.databaseOid,
          expectedRoleName: identity.roleName,
          expectedRoleOid: identity.roleOid,
          explicitConfirmation:
            CURRENT187_POSTGRES_SESSION_SYNTHETIC_CONFIRMATION,
          purpose: "APPLICATION",
          releaseSha:
            typeof releaseSha === "string" && /^[a-f0-9]{40}$/u.test(releaseSha)
              ? releaseSha
              : "a".repeat(40),
          secretReferenceDigest: digest("current187-j1-ci-secret-reference"),
          statementTimeoutMs: 5_000,
          transactionTimeoutMs: 15_000,
          verificationChallengeDigest: digest(
            "current187-j1-ci-verification-challenge",
          ),
        },
      );

    assert.equal(isVerifiedCurrent187PostgresSessionReceipt(receipt), true);
    assert.equal(receipt.status, CURRENT187_POSTGRES_SESSION_STATUS);
    assert.equal(receipt.sourceDatabaseIoPerformed, true);
    assert.equal(receipt.sessionIdentityMatched, true);
    assert.equal(receipt.databaseIdentityMatched, true);
    assert.equal(receipt.transactionReadOnlyObserved, true);
    assert.equal(receipt.transportTlsObserved, false);
    assert.equal(receipt.syntheticOnly, true);
    assert.equal(receipt.endpointIdentityAttested, false);
    assert.equal(receipt.hbaRuleMatched, false);
    assert.equal(receipt.poolerIdentityObserved, false);
    assert.equal(receipt.negativeProbePerformed, false);
    assert.equal(receipt.productionRuntimeAttested, false);
    assert.equal(receipt.authorization, false);
    assert.equal(receipt.canMutate, false);
    assert.equal(receipt.canSend, false);
    assert.equal(receipt.testAccessAuthorized, false);
    assert.equal(receipt.sharedBetaAccess, false);

    const serializedReceipt = JSON.stringify(receipt);
    assert.equal(
      serializedReceipt.includes(fixture.url.password),
      false,
      "receipt must not contain the database credential",
    );
    assert.equal(
      serializedReceipt.includes(identity.databaseName),
      false,
      "receipt must not contain the raw database name",
    );
    assert.equal(
      serializedReceipt.includes(identity.roleName),
      false,
      "receipt must not contain the raw role name",
    );
  },
);

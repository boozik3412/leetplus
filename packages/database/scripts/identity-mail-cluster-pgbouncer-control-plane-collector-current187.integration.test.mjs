import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import pg from "pg";

import {
  CURRENT187_PGBOUNCER_STATUS,
  CURRENT187_PGBOUNCER_SYNTHETIC_CONFIRMATION,
  collectSyntheticCurrent187PgBouncerControlPlaneEvidenceForTestOnly,
  computeSyntheticCurrent187PgBouncerConfigurationDigestForTestOnly,
  isVerifiedCurrent187PgBouncerReceipt,
} from "./identity-mail-cluster-pgbouncer-control-plane-collector-current187.mjs";

const REQUIRED_CONFIRMATION =
  "run-current187-pgbouncer-control-plane-protocol-integration-e2e";
const HOST = "127.0.0.1";
const PORT = 16_432;
const DATABASE = "leetplus_ci";
const APPLICATION_USER = "lp_application";
const APPLICATION_PASSWORD = "current187-ci-application-only";
const STATS_USER = "lp_pool_stats";
const STATS_PASSWORD = "current187-ci-stats-only";
const SHOW_STATEMENTS = Object.freeze([
  ["version", "SHOW VERSION"],
  ["state", "SHOW STATE"],
  ["config", "SHOW CONFIG"],
  ["databases", "SHOW DATABASES"],
  ["users", "SHOW USERS"],
  ["pools", "SHOW POOLS"],
  ["servers", "SHOW SERVERS"],
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function releaseSha() {
  const value = process.env.CI_RELEASE_SHA;
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value)
    ? value
    : "c".repeat(40);
}

function adminClient() {
  return new pg.Client({
    application_name: "leetplus-current187-pgbouncer-fixture-observer",
    connectionTimeoutMillis: 5_000,
    database: "pgbouncer",
    host: HOST,
    password: STATS_PASSWORD,
    port: PORT,
    query_timeout: 5_000,
    user: STATS_USER,
  });
}

function applicationClient(database = DATABASE) {
  return new pg.Client({
    application_name: "leetplus-current187-pgbouncer-fixture-application",
    connectionTimeoutMillis: 5_000,
    database,
    host: HOST,
    password: APPLICATION_PASSWORD,
    port: PORT,
    query_timeout: 5_000,
    user: APPLICATION_USER,
  });
}

async function showResults() {
  const client = adminClient();
  await client.connect();
  try {
    const rows = [];
    for (const [key, statement] of SHOW_STATEMENTS) {
      const result = await client.query({
        queryMode: "simple",
        text: statement,
      });
      rows.push([key, result.rows]);
    }
    return Object.fromEntries(rows);
  } finally {
    await client.end();
  }
}

function collectorInput(expectedPoolerConfigurationDigest) {
  return {
    adminUrl: `postgresql://${STATS_USER}:${STATS_PASSWORD}@${HOST}:${PORT}/pgbouncer`,
    applicationDatabaseName: DATABASE,
    applicationUserName: APPLICATION_USER,
    caCertificatePem: null,
    caCertificateSha256: sha256("synthetic-no-ca"),
    clientCertificatePem: null,
    clientCertificateSha256: null,
    clientPrivateKeyPem: null,
    clientPrivateKeySha256: null,
    clusterIdentityDigest: "1".repeat(64),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: "2".repeat(64),
    endpointTlsPeerReceiptDigest: "3".repeat(64),
    environment: "ci",
    expectedBackendAddress: HOST,
    expectedBackendDatabaseName: DATABASE,
    expectedBackendHost: HOST,
    expectedBackendPort: 5432,
    expectedPoolerConfigurationDigest,
    explicitConfirmation: CURRENT187_PGBOUNCER_SYNTHETIC_CONFIRMATION,
    hbaReloadReceiptDigest: "5".repeat(64),
    queryTimeoutMs: 5_000,
    releaseSha: releaseSha(),
    serverName: HOST,
    verificationChallengeDigest: "6".repeat(64),
  };
}

test(
  "actual PgBouncer stats-only console proves transaction pool mapping through simple protocol",
  { timeout: 30_000 },
  async (context) => {
    if (
      process.env.IDENTITY_MAIL_PGBOUNCER_CURRENT187_E2E_CONFIRM !==
      REQUIRED_CONFIRMATION
    ) {
      context.skip("explicit CURRENT187 PgBouncer fixture confirmation absent");
      return;
    }

    const application = applicationClient();
    await application.connect();
    try {
      assert.deepEqual((await application.query("SELECT 1 AS ready")).rows, [
        { ready: 1 },
      ]);

      const observed = await showResults();
      const provisionalInput = collectorInput("4".repeat(64));
      const expectedPoolerConfigurationDigest =
        computeSyntheticCurrent187PgBouncerConfigurationDigestForTestOnly(
          provisionalInput,
          observed,
        );
      const receipt =
        await collectSyntheticCurrent187PgBouncerControlPlaneEvidenceForTestOnly(
          collectorInput(expectedPoolerConfigurationDigest),
        );

      assert.equal(receipt.status, CURRENT187_PGBOUNCER_STATUS);
      assert.equal(receipt.poolerIdentityObserved, true);
      assert.equal(receipt.transactionPoolModeObserved, true);
      assert.equal(receipt.userCollapseAbsentObserved, true);
      assert.equal(receipt.poolerIdentityAttested, false);
      assert.equal(receipt.userCollapseAbsentAttested, false);
      assert.equal(receipt.negativeProbePerformed, false);
      assert.equal(receipt.authorization, false);
      assert.equal(receipt.canMutate, false);
      assert.equal(receipt.canSend, false);
      assert.equal(receipt.testAccessAuthorized, false);
      assert.equal(receipt.sharedBetaAccess, false);
      assert.equal(isVerifiedCurrent187PgBouncerReceipt(receipt), true);
      assert.doesNotMatch(
        JSON.stringify(receipt),
        /current187-ci|lp_application|lp_pool_stats|leetplus_ci/iu,
      );
    } finally {
      await application.end();
    }
  },
);

test(
  "application login cannot enter the PgBouncer admin console",
  { timeout: 15_000 },
  async (context) => {
    if (
      process.env.IDENTITY_MAIL_PGBOUNCER_CURRENT187_E2E_CONFIRM !==
      REQUIRED_CONFIRMATION
    ) {
      context.skip("explicit CURRENT187 PgBouncer fixture confirmation absent");
      return;
    }

    const unauthorized = applicationClient("pgbouncer");
    await assert.rejects(async () => {
      try {
        await unauthorized.connect();
      } finally {
        await unauthorized.end().catch(() => undefined);
      }
    }, /not allowed|no privileges|admin console/iu);
  },
);

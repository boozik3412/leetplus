import assert from "node:assert/strict";
import { X509Certificate, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import pg from "pg";

import { CURRENT187_CONNECTION_NEGATIVE_SCENARIOS } from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_RUNNER_STATUS,
  isVerifiedCurrent187ConnectionProbeRunnerReceipt,
  runCurrent187ConnectionProbeMatrix,
} from "./identity-mail-cluster-connection-probe-runner-current187.mjs";
import {
  CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION,
  collectCurrent187EndpointTlsPeerEvidence,
  isVerifiedCurrent187ProductionEndpointTlsPeerReceipt,
} from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";
import {
  CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION,
  collectCurrent187HbaReloadEvidence,
  computeSyntheticCurrent187HbaCatalogDigestForTestOnly,
  isVerifiedCurrent187ProductionHbaReloadReceipt,
} from "./identity-mail-cluster-hba-reload-collector-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import {
  CURRENT187_PGBOUNCER_STATUS,
  CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION,
  collectCurrent187PgBouncerControlPlaneEvidence,
  computeCurrent187PgBouncerConfigurationDigestForTestOnly,
  isVerifiedCurrent187ProductionPgBouncerReceipt,
  isVerifiedCurrent187PgBouncerReceipt,
} from "./identity-mail-cluster-pgbouncer-control-plane-collector-current187.mjs";
import {
  CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION,
  collectCurrent187PostgresSessionEvidence,
  isVerifiedCurrent187ProductionPostgresSessionReceipt,
} from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const REQUIRED_CONFIRMATION =
  "run-current187-pgbouncer-control-plane-protocol-integration-e2e";
const HOST = process.env.CURRENT187_PGBOUNCER_HOSTNAME ?? "127.0.0.1";
const DATABASE_HOST =
  process.env.CURRENT187_PGBOUNCER_DATABASE_HOSTNAME ?? "127.0.0.1";
const BACKEND_HOST = "127.0.0.1";
const PORT = 16_432;
const DATABASE = "leetplus_ci";
const APPLICATION_USER = "lp_application";
const APPLICATION_PASSWORD = "current187-ci-application-only";
const STATS_USER = "lp_pool_stats";
const STATS_PASSWORD = "current187-ci-stats-only";
const SERVICE_IDENTITIES = Object.freeze([
  Object.freeze({
    endpointClass: "POOLER",
    host: HOST,
    password: APPLICATION_PASSWORD,
    poolMode: "TRANSACTION",
    port: PORT,
    purpose: "APPLICATION",
    role: APPLICATION_USER,
  }),
  Object.freeze({
    endpointClass: "DIRECT_DATABASE",
    host: DATABASE_HOST,
    password: "current187-ci-coordinator-only",
    poolMode: "SESSION",
    port: 5_432,
    purpose: "COORDINATOR",
    role: "lp_coordinator",
  }),
  Object.freeze({
    endpointClass: "DIRECT_DATABASE",
    host: DATABASE_HOST,
    password: "current187-ci-migration-only",
    poolMode: "SESSION",
    port: 5_432,
    purpose: "MIGRATION",
    role: "lp_migration",
  }),
  Object.freeze({
    endpointClass: "DIRECT_DATABASE",
    host: DATABASE_HOST,
    password: "current187-ci-worker-only",
    poolMode: "SESSION",
    port: 5_432,
    purpose: "WORKER",
    role: "lp_worker",
  }),
]);
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

async function fixtureTlsMaterial() {
  const paths = [
    process.env.CURRENT187_PGBOUNCER_CA_CERTIFICATE_PATH,
    process.env.CURRENT187_PGBOUNCER_CLIENT_CERTIFICATE_PATH,
    process.env.CURRENT187_PGBOUNCER_CLIENT_PRIVATE_KEY_PATH,
    process.env.CURRENT187_PGBOUNCER_SERVER_CERTIFICATE_PATH,
    process.env.CURRENT187_PGBOUNCER_WRONG_CA_CERTIFICATE_PATH,
  ];
  assert.equal(
    paths.every((value) => typeof value === "string"),
    true,
  );
  const [
    caCertificatePem,
    clientCertificatePem,
    clientPrivateKeyPem,
    serverCertificatePem,
    wrongCaCertificatePem,
  ] = await Promise.all(paths.map((value) => readFile(value, "utf8")));
  assert.equal(
    typeof process.env.CURRENT187_PGBOUNCER_CLIENT_IDENTITY_PATH,
    "string",
  );
  return Object.freeze({
    caCertificatePem,
    caCertificatePath: paths[0],
    clientCertificatePem,
    clientIdentityPath: process.env.CURRENT187_PGBOUNCER_CLIENT_IDENTITY_PATH,
    clientPrivateKeyPem,
    serverCertificatePem,
    wrongCaCertificatePem,
  });
}

function sslOptions(tls, includeClientCredential = true) {
  return {
    ca: tls.caCertificatePem,
    ...(includeClientCredential
      ? {
          cert: tls.clientCertificatePem,
          key: tls.clientPrivateKeyPem,
        }
      : {}),
    rejectUnauthorized: true,
    servername: HOST,
  };
}

function adminClient(tls, includeClientCredential = true) {
  return new pg.Client({
    application_name: "leetplus-current187-pgbouncer-fixture-observer",
    connectionTimeoutMillis: 5_000,
    database: "pgbouncer",
    host: HOST,
    password: STATS_PASSWORD,
    port: PORT,
    query_timeout: 5_000,
    ssl: sslOptions(tls, includeClientCredential),
    user: STATS_USER,
  });
}

function applicationClient(tls, database = DATABASE) {
  return new pg.Client({
    application_name: "leetplus-current187-pgbouncer-fixture-application",
    connectionTimeoutMillis: 5_000,
    database,
    host: HOST,
    password: APPLICATION_PASSWORD,
    port: PORT,
    query_timeout: 5_000,
    ssl: sslOptions(tls),
    user: APPLICATION_USER,
  });
}

async function showResults(tls) {
  const client = adminClient(tls);
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

function collectorInput(
  expectedPoolerConfigurationDigest,
  tls,
  overrides = {},
) {
  return {
    adminUrl: `postgresql://${STATS_USER}:${STATS_PASSWORD}@${HOST}:${PORT}/pgbouncer`,
    applicationDatabaseName: DATABASE,
    applicationUserName: APPLICATION_USER,
    caCertificatePem: tls.caCertificatePem,
    caCertificateSha256: sha256(tls.caCertificatePem),
    clientCertificatePem: tls.clientCertificatePem,
    clientCertificateSha256: sha256(tls.clientCertificatePem),
    clientPrivateKeyPem: tls.clientPrivateKeyPem,
    clientPrivateKeySha256: sha256(tls.clientPrivateKeyPem),
    clusterIdentityDigest: "1".repeat(64),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: "2".repeat(64),
    endpointTlsPeerReceiptDigest: "3".repeat(64),
    environment: "production",
    expectedBackendAddress: BACKEND_HOST,
    expectedBackendDatabaseName: DATABASE,
    expectedBackendHost: BACKEND_HOST,
    expectedBackendPort: 5432,
    expectedPoolerConfigurationDigest,
    explicitConfirmation: CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION,
    hbaReloadReceiptDigest: "5".repeat(64),
    queryTimeoutMs: 5_000,
    releaseSha: releaseSha(),
    serverName: HOST,
    verificationChallengeDigest: "6".repeat(64),
    ...overrides,
  };
}

function strictDatabaseUrl(identity, tls, applicationName) {
  const url = new URL(
    `postgresql://${identity.role}:${identity.password}@${identity.host}:${identity.port}/${DATABASE}`,
  );
  url.searchParams.set("application_name", applicationName);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("sslaccept", "strict");
  url.searchParams.set("sslcert", tls.caCertificatePath);
  url.searchParams.set("sslidentity", tls.clientIdentityPath);
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

function directClient(tls) {
  return new pg.Client({
    application_name: "leetplus.current187.r9.control",
    connectionTimeoutMillis: 5_000,
    database: DATABASE,
    host: DATABASE_HOST,
    password: "postgres",
    port: 5_432,
    query_timeout: 5_000,
    ssl: {
      ca: tls.caCertificatePem,
      cert: tls.clientCertificatePem,
      key: tls.clientPrivateKeyPem,
      rejectUnauthorized: true,
      servername: DATABASE_HOST,
    },
    user: "postgres",
  });
}

function normalizeHbaRows(rows) {
  return rows.map((row) => ({
    address: row.address,
    authMethod: row.authMethod,
    databases: row.databases,
    error: row.error,
    fileName: row.fileName,
    lineNumber: row.lineNumber,
    netmask: row.netmask,
    options: row.options ?? [],
    ruleNumber: row.ruleNumber,
    type: row.type,
    users: row.users,
  }));
}

async function collectIdentityAndHba(tls) {
  const client = directClient(tls);
  await client.connect();
  try {
    const identities = await client.query(
      `
      SELECT
        database_row.oid::text AS "databaseOid",
        database_row.datname::text AS "databaseName",
        role_row.oid::text AS "roleOid",
        role_row.rolname::text AS "roleName"
      FROM pg_catalog.pg_database AS database_row
      CROSS JOIN pg_catalog.pg_roles AS role_row
      WHERE database_row.datname = '${DATABASE}'
        AND role_row.rolname = ANY($1::text[])
      ORDER BY role_row.rolname
    `,
      [SERVICE_IDENTITIES.map((identity) => identity.role)],
    );
    const control = await client.query(`
      SELECT pg_catalog.pg_conf_load_time() AS "configurationLoadTime"
    `);
    const hba = await client.query(`
      SELECT
        rule_number::text AS "ruleNumber",
        file_name::text AS "fileName",
        line_number::text AS "lineNumber",
        type::text AS "type",
        database::text[] AS "databases",
        user_name::text[] AS "users",
        address::text AS "address",
        netmask::text AS "netmask",
        auth_method::text AS "authMethod",
        options::text[] AS "options",
        error::text AS "error"
      FROM pg_catalog.pg_hba_file_rules
      ORDER BY rule_number
    `);
    return Object.freeze({
      configurationLoadTime: control.rows[0].configurationLoadTime,
      hbaRows: normalizeHbaRows(hba.rows),
      identities: identities.rows,
    });
  } finally {
    await client.end();
  }
}

function certificateDigests(tls) {
  const certificate = new X509Certificate(tls.serverCertificatePem);
  return Object.freeze({
    leafCertificateSha256: certificate.fingerprint256
      .replaceAll(":", "")
      .toLowerCase(),
    leafSpkiSha256: createHash("sha256")
      .update(certificate.publicKey.export({ format: "der", type: "spki" }))
      .digest("hex"),
  });
}

async function collectServiceReceipts(tls, catalog) {
  const certificate = certificateDigests(tls);
  const services = [];
  for (const [index, identity] of SERVICE_IDENTITIES.entries()) {
    const databaseIdentity = catalog.identities.find(
      (row) => row.roleName === identity.role,
    );
    assert.ok(databaseIdentity);
    const applicationName = `leetplus.current187.r9.${identity.purpose.toLowerCase()}`;
    const secretReferenceDigest = sha256(
      `current187-r9-${identity.purpose}-secret-reference`,
    );
    const postgresSessionReceipt =
      await collectCurrent187PostgresSessionEvidence({
        applicationName,
        clusterIdentityDigest: "7".repeat(64),
        databaseUniverseDigest: "8".repeat(64),
        databaseUrl: strictDatabaseUrl(identity, tls, applicationName),
        environment: "production",
        expectedDatabaseName: databaseIdentity.databaseName,
        expectedDatabaseOid: databaseIdentity.databaseOid,
        expectedRoleName: databaseIdentity.roleName,
        expectedRoleOid: databaseIdentity.roleOid,
        explicitConfirmation:
          CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION,
        purpose: identity.purpose,
        releaseSha: releaseSha(),
        secretReferenceDigest,
        statementTimeoutMs: 5_000,
        transactionTimeoutMs: 15_000,
        verificationChallengeDigest: sha256(
          `current187-r9-${identity.purpose}-session-challenge`,
        ),
      });
    assert.equal(
      isVerifiedCurrent187ProductionPostgresSessionReceipt(
        postgresSessionReceipt,
      ),
      true,
    );
    const endpointTlsPeerReceipt =
      await collectCurrent187EndpointTlsPeerEvidence({
        caCertificatePem: tls.caCertificatePem,
        caCertificateSha256: sha256(tls.caCertificatePem),
        clientCertificatePem: tls.clientCertificatePem,
        clientCertificateSha256: sha256(tls.clientCertificatePem),
        clientPrivateKeyPem: tls.clientPrivateKeyPem,
        clientPrivateKeySha256: sha256(tls.clientPrivateKeyPem),
        clusterIdentityDigest: "7".repeat(64),
        connectTimeoutMs: 5_000,
        databaseUniverseDigest: "8".repeat(64),
        endpointClass: identity.endpointClass,
        endpointHost: identity.host,
        endpointPort: identity.port,
        environment: "production",
        expectedLeafCertificateSha256: certificate.leafCertificateSha256,
        expectedLeafSpkiSha256: certificate.leafSpkiSha256,
        expectedResolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
        explicitConfirmation:
          CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION,
        handshakeTimeoutMs: 10_000,
        postgresSessionReceiptDigest:
          postgresSessionReceipt.postgresSessionReceiptDigest,
        purpose: identity.purpose,
        releaseSha: releaseSha(),
        secretReferenceDigest,
        serverName: identity.host,
        verificationChallengeDigest: sha256(
          `current187-r9-${identity.purpose}-tls-challenge`,
        ),
      });
    assert.equal(
      isVerifiedCurrent187ProductionEndpointTlsPeerReceipt(
        endpointTlsPeerReceipt,
      ),
      true,
    );
    services.push(
      Object.freeze({
        endpointTlsPeerReceipt,
        identity,
        index,
        postgresSessionReceipt,
      }),
    );
  }
  return Object.freeze(services);
}

async function collectControlReceipts(tls, catalog, serviceReceipts) {
  const controlIdentity = {
    endpointClass: "DIRECT_DATABASE",
    host: DATABASE_HOST,
    password: "postgres",
    poolMode: "SESSION",
    port: 5_432,
    purpose: "CONTROL",
    role: "postgres",
  };
  const controlClient = directClient(tls);
  await controlClient.connect();
  let controlDatabaseIdentity;
  try {
    const result = await controlClient.query(
      `
      SELECT
        database_row.oid::text AS "databaseOid",
        role_row.oid::text AS "roleOid"
      FROM pg_catalog.pg_database AS database_row
      CROSS JOIN pg_catalog.pg_roles AS role_row
      WHERE database_row.datname = $1
        AND role_row.rolname = $2
    `,
      [DATABASE, "postgres"],
    );
    assert.equal(result.rows.length, 1);
    controlDatabaseIdentity = result.rows[0];
  } finally {
    await controlClient.end();
  }
  const applicationName = "leetplus.current187.r9.hba.control";
  const hbaReloadReceipt = await collectCurrent187HbaReloadEvidence({
    applicationName,
    clusterIdentityDigest: "7".repeat(64),
    databaseUrl: strictDatabaseUrl(controlIdentity, tls, applicationName),
    databaseUniverseDigest: "8".repeat(64),
    environment: "production",
    expectedControlDatabaseName: DATABASE,
    expectedControlDatabaseOid: controlDatabaseIdentity.databaseOid,
    expectedControlRoleName: "postgres",
    expectedControlRoleOid: controlDatabaseIdentity.roleOid,
    expectedHbaCatalogDigest:
      computeSyntheticCurrent187HbaCatalogDigestForTestOnly(catalog.hbaRows),
    explicitConfirmation: CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION,
    releaseSha: releaseSha(),
    reloadChallengeDigest: sha256("current187-r9-hba-reload-challenge"),
    reloadNotBefore: new Date(
      new Date(catalog.configurationLoadTime).getTime() - 1_000,
    ).toISOString(),
    statementTimeoutMs: 5_000,
    transactionTimeoutMs: 15_000,
  });
  assert.equal(
    isVerifiedCurrent187ProductionHbaReloadReceipt(hbaReloadReceipt),
    true,
  );

  const observed = await showResults(tls);
  const applicationTlsReceipt = serviceReceipts[0].endpointTlsPeerReceipt;
  const overrides = {
    clusterIdentityDigest: "7".repeat(64),
    databaseUniverseDigest: "8".repeat(64),
    endpointTlsPeerReceiptDigest:
      applicationTlsReceipt.endpointTlsPeerReceiptDigest,
    hbaReloadReceiptDigest: hbaReloadReceipt.hbaReloadReceiptDigest,
  };
  const provisionalInput = collectorInput("4".repeat(64), tls, overrides);
  const expectedPoolerConfigurationDigest =
    computeCurrent187PgBouncerConfigurationDigestForTestOnly(
      provisionalInput,
      observed,
      false,
    );
  const pgbouncerReceipt = await collectCurrent187PgBouncerControlPlaneEvidence(
    collectorInput(expectedPoolerConfigurationDigest, tls, overrides),
  );
  assert.equal(
    isVerifiedCurrent187ProductionPgBouncerReceipt(pgbouncerReceipt),
    true,
  );
  return Object.freeze({ hbaReloadReceipt, pgbouncerReceipt });
}

function negativeConnections(tls, identity, index) {
  return CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.slice(0, 5).map(
    (scenario) => {
      const plaintext = scenario === "PLAINTEXT_TRANSPORT";
      const certificatePem = plaintext
        ? null
        : scenario === "WRONG_CA"
          ? tls.wrongCaCertificatePem
          : tls.caCertificatePem;
      const role = scenario === "WRONG_ROLE" ? "lp_wrong" : identity.role;
      const password =
        scenario === "WRONG_ROLE"
          ? "current187-ci-deliberately-wrong"
          : identity.password;
      const database =
        scenario === "WRONG_DATABASE" ? `missing_r9_${index}` : DATABASE;
      return {
        caCertificatePem: certificatePem,
        challengeDigest: sha256(
          `current187-r9-${identity.purpose}-${scenario}-challenge`,
        ),
        clientCertificatePem: plaintext ? null : tls.clientCertificatePem,
        clientCertificateSha256: plaintext
          ? null
          : sha256(tls.clientCertificatePem),
        clientPrivateKeyPem: plaintext ? null : tls.clientPrivateKeyPem,
        clientPrivateKeySha256: plaintext
          ? null
          : sha256(tls.clientPrivateKeyPem),
        connectionString: `postgresql://${role}:${password}@${BACKEND_HOST}:${identity.port}/${database}?sslmode=${plaintext ? "disable" : "verify-full"}`,
        scenario,
        serverName: plaintext
          ? null
          : scenario === "WRONG_HOSTNAME"
            ? "wrong.current187.invalid"
            : identity.host,
      };
    },
  );
}

function runnerInput(tls, serviceReceipts, controlReceipts) {
  return {
    clusterIdentityDigest: "7".repeat(64),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: "8".repeat(64),
    environment: "production",
    hbaReloadReceipt: controlReceipts.hbaReloadReceipt,
    hostControlChallengeDigest: sha256("current187-r9-host-control-challenge"),
    nonce: sha256("current187-r9-runner-nonce"),
    operationId: "33333333-3333-4333-8333-333333333333",
    pgbouncerReceipt: controlReceipts.pgbouncerReceipt,
    probeRunnerArtifactDigest: sha256("current187-r9-runner-artifact"),
    releaseSha: releaseSha(),
    services: serviceReceipts.map(
      ({
        endpointTlsPeerReceipt,
        identity,
        index,
        postgresSessionReceipt,
      }) => ({
        allowedOperationsDigest: sha256(
          `current187-r9-${identity.purpose}-allowed-operations`,
        ),
        endpointClass: identity.endpointClass,
        endpointTlsPeerReceipt,
        hbaAuthMethod: "scram-sha-256",
        hbaRuleDigest: sha256(`current187-r9-${identity.purpose}-hba-rule`),
        negativeConnections: negativeConnections(tls, identity, index),
        poolerMappingDigest: sha256(
          `current187-r9-${identity.purpose}-pooler-mapping`,
        ),
        poolMode: identity.poolMode,
        postgresSessionReceipt,
        purpose: identity.purpose,
        tlsMode: "VERIFY_FULL",
      }),
    ),
  };
}

test(
  "actual mTLS PgBouncer stats-only console returns a strict production-origin receipt",
  { timeout: 30_000 },
  async (context) => {
    if (
      process.env.IDENTITY_MAIL_PGBOUNCER_CURRENT187_E2E_CONFIRM !==
      REQUIRED_CONFIRMATION
    ) {
      context.skip("explicit CURRENT187 PgBouncer fixture confirmation absent");
      return;
    }

    const tls = await fixtureTlsMaterial();
    const application = applicationClient(tls);
    await application.connect();
    try {
      assert.deepEqual((await application.query("SELECT 1 AS ready")).rows, [
        { ready: 1 },
      ]);

      const observed = await showResults(tls);
      const provisionalInput = collectorInput("4".repeat(64), tls);
      const expectedPoolerConfigurationDigest =
        computeCurrent187PgBouncerConfigurationDigestForTestOnly(
          provisionalInput,
          observed,
          false,
        );
      const receipt = await collectCurrent187PgBouncerControlPlaneEvidence(
        collectorInput(expectedPoolerConfigurationDigest, tls),
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
      assert.equal(
        isVerifiedCurrent187ProductionPgBouncerReceipt(receipt),
        true,
      );
      assert.match(receipt.clientCredentialBindingDigest, /^[a-f0-9]{64}$/u);
      const serializedReceipt = JSON.stringify(receipt);
      assert.doesNotMatch(
        serializedReceipt,
        /current187-ci|lp_application|lp_pool_stats|leetplus_ci/iu,
      );
      assert.equal(serializedReceipt.includes(tls.clientCertificatePem), false);
      assert.equal(serializedReceipt.includes(tls.clientPrivateKeyPem), false);
      assert.equal(
        serializedReceipt.includes(sha256(tls.clientCertificatePem)),
        false,
      );
      assert.equal(
        serializedReceipt.includes(sha256(tls.clientPrivateKeyPem)),
        false,
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

    const tls = await fixtureTlsMaterial();
    const unauthorized = applicationClient(tls, "pgbouncer");
    await assert.rejects(async () => {
      try {
        await unauthorized.connect();
      } finally {
        await unauthorized.end().catch(() => undefined);
      }
    }, /not allowed|no privileges|admin console/iu);
  },
);

test(
  "PgBouncer verify-full rejects a TLS client without a client certificate",
  { timeout: 15_000 },
  async (context) => {
    if (
      process.env.IDENTITY_MAIL_PGBOUNCER_CURRENT187_E2E_CONFIRM !==
      REQUIRED_CONFIRMATION
    ) {
      context.skip("explicit CURRENT187 PgBouncer fixture confirmation absent");
      return;
    }

    const tls = await fixtureTlsMaterial();
    const certificateLess = adminClient(tls, false);
    await assert.rejects(async () => {
      try {
        await certificateLess.connect();
      } finally {
        await certificateLess.end().catch(() => undefined);
      }
    });
  },
);

test(
  "co-located public J1-J4 chain executes the strict production runner matrix",
  { timeout: 90_000 },
  async (context) => {
    if (
      process.env.IDENTITY_MAIL_PGBOUNCER_CURRENT187_E2E_CONFIRM !==
      REQUIRED_CONFIRMATION
    ) {
      context.skip("explicit CURRENT187 PgBouncer fixture confirmation absent");
      return;
    }

    assert.deepEqual(
      SERVICE_IDENTITIES.map((identity) => identity.purpose),
      CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES,
    );
    const tls = await fixtureTlsMaterial();
    const catalog = await collectIdentityAndHba(tls);
    assert.equal(catalog.identities.length, 4);
    assert.equal(catalog.hbaRows.length, 7);
    const serviceReceipts = await collectServiceReceipts(tls, catalog);
    const controlReceipts = await collectControlReceipts(
      tls,
      catalog,
      serviceReceipts,
    );
    const probeInput = runnerInput(tls, serviceReceipts, controlReceipts);
    for (const service of probeInput.services) {
      assert.equal(
        service.negativeConnections.every(
          (connection) =>
            new URL(connection.connectionString).hostname === BACKEND_HOST,
        ),
        true,
      );
    }
    const receipt = await runCurrent187ConnectionProbeMatrix(probeInput);

    assert.equal(receipt.status, CURRENT187_CONNECTION_PROBE_RUNNER_STATUS);
    assert.equal(
      isVerifiedCurrent187ConnectionProbeRunnerReceipt(receipt),
      true,
    );
    assert.equal(receipt.actualPositiveProbeCount, 4);
    assert.equal(receipt.actualNetworkNegativeProbeCount, 20);
    assert.equal(receipt.controlPolicyNegativeProbeCount, 12);
    assert.equal(receipt.negativeProbeCount, 32);
    assert.equal(receipt.syntheticOnly, false);
    assert.equal(receipt.sourceNetworkIoPerformed, true);
    assert.equal(receipt.productionRuntimeAttested, false);
    assert.equal(receipt.testAccessAuthorized, false);
    assert.equal(receipt.sharedBetaAccess, false);
    const serializedReceipt = JSON.stringify(receipt);
    for (const secret of [
      "current187-ci-",
      "BEGIN CERTIFICATE",
      "BEGIN PRIVATE KEY",
      "lp_application",
      "lp_coordinator",
      "lp_migration",
      "lp_worker",
      HOST,
      DATABASE_HOST,
      DATABASE,
    ]) {
      assert.equal(serializedReceipt.includes(secret), false);
    }
  },
);

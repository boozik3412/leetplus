import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION,
  CURRENT187_PGBOUNCER_STATUS,
  CURRENT187_PGBOUNCER_SYNTHETIC_CONFIRMATION,
  collectCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly,
  collectSyntheticCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly,
  computeCurrent187PgBouncerConfigurationDigestForTestOnly,
  computeSyntheticCurrent187PgBouncerConfigurationDigestForTestOnly,
  isVerifiedCurrent187PgBouncerReceipt,
  isVerifiedCurrent187ProductionPgBouncerReceipt,
} from "./identity-mail-cluster-pgbouncer-control-plane-collector-current187.mjs";

const NOW = "2026-08-12T10:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);
const CA_PEM =
  "-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----\n";
const CLIENT_CERTIFICATE_PEM =
  "-----BEGIN CERTIFICATE-----\nQ0xJRU5U\n-----END CERTIFICATE-----\n";
const CLIENT_PRIVATE_KEY_PEM =
  "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function results(overrides = {}, production = false) {
  const configValues = {
    auth_type: "scram-sha-256",
    client_tls_sslmode: production ? "verify-full" : "disable",
    ignore_startup_parameters: "extra_float_digits",
    max_client_conn: "500",
    max_prepared_statements: "0",
    pool_mode: "transaction",
    server_reset_query_always: "0",
    server_tls_sslmode: production ? "verify-full" : "disable",
    ...(overrides.configValues ?? {}),
  };
  const base = {
    config: Object.entries(configValues).map(([key, value]) => ({
      changeable: "yes",
      default: "",
      key,
      value,
    })),
    databases: [
      {
        current_client_connections: 1,
        current_connections: 1,
        database: "leetplus",
        disabled: 0,
        force_user: null,
        host: "postgres.internal",
        max_client_connections: 500,
        max_connections: 50,
        name: "leetplus",
        paused: 0,
        pool_mode: null,
        pool_size: 20,
        port: 5432,
      },
    ],
    pools: [
      {
        cl_active: 1,
        database: "leetplus",
        pool_mode: "transaction",
        sv_active: 1,
        user: "lp_application",
      },
    ],
    servers: [
      {
        addr: "10.0.0.10",
        close_needed: 0,
        database: "leetplus",
        port: 5432,
        state: "active",
        tls: production ? "TLSv1.3/TLS_AES_256_GCM_SHA384" : "",
        user: "lp_application",
      },
    ],
    state: [
      { key: "active", value: "yes" },
      { key: "paused", value: "no" },
      { key: "suspended", value: "no" },
    ],
    users: [
      {
        current_client_connections: 1,
        current_connections: 1,
        max_user_client_connections: 500,
        max_user_connections: 50,
        name: "lp_application",
        pool_mode: null,
      },
    ],
    version: [{ version: "PgBouncer 1.24.1" }],
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== "configValues") base[key] = value;
  }
  return base;
}

function input(overrides = {}, production = false) {
  const host = production ? "pool.internal.example" : "localhost";
  return {
    adminUrl: `postgresql://lp_pool_admin:test-only@${host}:6432/pgbouncer`,
    applicationDatabaseName: "leetplus",
    applicationUserName: "lp_application",
    caCertificatePem: production ? CA_PEM : null,
    caCertificateSha256: production
      ? sha256(CA_PEM)
      : sha256("synthetic-no-ca"),
    clientCertificatePem: production ? CLIENT_CERTIFICATE_PEM : null,
    clientCertificateSha256: production ? sha256(CLIENT_CERTIFICATE_PEM) : null,
    clientPrivateKeyPem: production ? CLIENT_PRIVATE_KEY_PEM : null,
    clientPrivateKeySha256: production ? sha256(CLIENT_PRIVATE_KEY_PEM) : null,
    clusterIdentityDigest: "1".repeat(64),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: "2".repeat(64),
    endpointTlsPeerReceiptDigest: "3".repeat(64),
    environment: production ? "production" : "ci",
    expectedBackendAddress: "10.0.0.10",
    expectedBackendDatabaseName: "leetplus",
    expectedBackendHost: "postgres.internal",
    expectedBackendPort: 5432,
    expectedPoolerConfigurationDigest: "4".repeat(64),
    explicitConfirmation: production
      ? CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION
      : CURRENT187_PGBOUNCER_SYNTHETIC_CONFIRMATION,
    hbaReloadReceiptDigest: "5".repeat(64),
    queryTimeoutMs: 5_000,
    releaseSha: RELEASE_SHA,
    serverName: host,
    verificationChallengeDigest: "6".repeat(64),
    ...overrides,
  };
}

function dependencies(
  showResults,
  { connectError = false, disconnectError = false } = {},
) {
  const calls = [];
  const byStatement = {
    "SHOW CONFIG": showResults.config,
    "SHOW DATABASES": showResults.databases,
    "SHOW POOLS": showResults.pools,
    "SHOW SERVERS": showResults.servers,
    "SHOW STATE": showResults.state,
    "SHOW USERS": showResults.users,
    "SHOW VERSION": showResults.version,
  };
  return {
    calls,
    value: {
      createClient(connection) {
        calls.push(["create", connection]);
        return {
          async connect() {
            calls.push(["connect"]);
            if (connectError) throw new Error("secret connect detail");
          },
          async disconnect() {
            calls.push(["disconnect"]);
            if (disconnectError) throw new Error("secret disconnect detail");
          },
          async query(statement) {
            calls.push(["query", statement]);
            return structuredClone(byStatement[statement]);
          },
        };
      },
      now() {
        return NOW;
      },
    },
  };
}

async function collect({
  inputOverrides = {},
  production = false,
  resultOverrides = {},
  dependencyOptions = {},
} = {}) {
  const showResults = results(resultOverrides, production);
  const baseInput = input({}, production);
  const expectedPoolerConfigurationDigest =
    inputOverrides.expectedPoolerConfigurationDigest ??
    computeCurrent187PgBouncerConfigurationDigestForTestOnly(
      baseInput,
      showResults,
      !production,
    );
  const source = input(
    { expectedPoolerConfigurationDigest, ...inputOverrides },
    production,
  );
  const deps = dependencies(showResults, dependencyOptions);
  const receipt = production
    ? await collectCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
        source,
        deps.value,
      )
    : await collectSyntheticCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
        source,
        deps.value,
      );
  return { deps, receipt, showResults, source };
}

test("actual SHOW control-plane path returns only a branded deny-only PgBouncer observation", async () => {
  const { deps, receipt, source } = await collect();
  assert.equal(receipt.status, CURRENT187_PGBOUNCER_STATUS);
  assert.equal(receipt.sourceNetworkIoPerformed, true);
  assert.equal(receipt.poolerIdentityObserved, true);
  assert.equal(receipt.poolModeObserved, true);
  assert.equal(receipt.transactionPoolModeObserved, true);
  assert.equal(receipt.userCollapseAbsentObserved, true);
  assert.equal(receipt.poolerIdentityAttested, false);
  assert.equal(receipt.userCollapseAbsentAttested, false);
  assert.equal(receipt.negativeProbePerformed, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.productionRuntimeAttested, false);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(
    receipt.poolerConfigurationDigest,
    source.expectedPoolerConfigurationDigest,
  );
  assert.equal(isVerifiedCurrent187PgBouncerReceipt(receipt), true);
  assert.equal(isVerifiedCurrent187PgBouncerReceipt({ ...receipt }), false);
  assert.deepEqual(
    deps.calls.filter((row) => row[0] === "query").map((row) => row[1]),
    [
      "SHOW VERSION",
      "SHOW STATE",
      "SHOW CONFIG",
      "SHOW DATABASES",
      "SHOW USERS",
      "SHOW POOLS",
      "SHOW SERVERS",
    ],
  );
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(
    serialized,
    /test-only|lp_application|leetplus|postgres\.internal/iu,
  );
});

test("global, database, user, and runtime pool-mode drift fail closed", async () => {
  const cases = [
    { configValues: { pool_mode: "session" } },
    { configValues: { max_prepared_statements: "100" } },
    { configValues: { server_reset_query_always: "1" } },
    { configValues: { max_client_conn: "unbounded" } },
    { databases: [{ ...results().databases[0], pool_mode: "session" }] },
    { users: [{ ...results().users[0], pool_mode: "session" }] },
    { pools: [{ ...results().pools[0], pool_mode: "session" }] },
  ];
  for (const resultOverrides of cases) {
    await assert.rejects(
      () =>
        collect({
          inputOverrides: { expectedPoolerConfigurationDigest: "4".repeat(64) },
          resultOverrides,
        }),
      { code: "CURRENT187_PGBOUNCER_COLLECTION_FAILED" },
    );
  }
});

test("force_user, user collapse, stale server, backend drift, and paused database fail closed", async () => {
  const base = results();
  for (const resultOverrides of [
    { databases: [{ ...base.databases[0], force_user: "lp_collapsed" }] },
    { pools: [{ ...base.pools[0], user: "lp_collapsed" }] },
    { servers: [{ ...base.servers[0], user: "lp_collapsed" }] },
    { servers: [{ ...base.servers[0], addr: "10.0.0.11" }] },
    { servers: [{ ...base.servers[0], close_needed: 1 }] },
    { databases: [{ ...base.databases[0], paused: 1 }] },
  ]) {
    await assert.rejects(
      () =>
        collect({
          inputOverrides: { expectedPoolerConfigurationDigest: "4".repeat(64) },
          resultOverrides,
        }),
      { code: "CURRENT187_PGBOUNCER_COLLECTION_FAILED" },
    );
  }
});

test("PgBouncer global pause and suspend state drift fail closed", async () => {
  const base = results();
  for (const state of [
    base.state.map((row) =>
      row.key === "paused" ? { ...row, value: "yes" } : row,
    ),
    base.state.map((row) =>
      row.key === "suspended" ? { ...row, value: "yes" } : row,
    ),
    base.state.slice(0, 2),
    [{ state: "active" }],
  ]) {
    await assert.rejects(
      () =>
        collect({
          inputOverrides: { expectedPoolerConfigurationDigest: "4".repeat(64) },
          resultOverrides: { state },
        }),
      { code: "CURRENT187_PGBOUNCER_COLLECTION_FAILED" },
    );
  }
});

test("production requires verify-full client/server TLS and an active TLS server mapping", async () => {
  const productionResults = results({}, true);
  const { deps, receipt } = await collect({ production: true });
  assert.equal(receipt.syntheticOnly, false);
  assert.equal(isVerifiedCurrent187ProductionPgBouncerReceipt(receipt), false);
  assert.match(receipt.clientCredentialBindingDigest, /^[a-f0-9]{64}$/u);
  const connection = deps.calls.find((call) => call[0] === "create")[1];
  assert.deepEqual(connection.ssl, {
    ca: CA_PEM,
    cert: CLIENT_CERTIFICATE_PEM,
    key: CLIENT_PRIVATE_KEY_PEM,
    rejectUnauthorized: true,
    servername: "pool.internal.example",
  });
  const serializedReceipt = JSON.stringify(receipt);
  assert.doesNotMatch(
    serializedReceipt,
    /Q0xJRU5U|UFJJVkFURQ|BEGIN (?:CERTIFICATE|PRIVATE KEY)/u,
  );
  assert.equal(
    serializedReceipt.includes(sha256(CLIENT_CERTIFICATE_PEM)),
    false,
  );
  assert.equal(
    serializedReceipt.includes(sha256(CLIENT_PRIVATE_KEY_PEM)),
    false,
  );
  for (const resultOverrides of [
    { configValues: { client_tls_sslmode: "require" } },
    { configValues: { server_tls_sslmode: "require" } },
    { servers: [{ ...productionResults.servers[0], tls: "" }] },
  ]) {
    await assert.rejects(
      () =>
        collect({
          inputOverrides: { expectedPoolerConfigurationDigest: "4".repeat(64) },
          production: true,
          resultOverrides,
        }),
      { code: "CURRENT187_PGBOUNCER_COLLECTION_FAILED" },
    );
  }
});

test("production client mTLS credentials are exact, digest-bound, and absent in synthetic mode", async () => {
  for (const inputOverrides of [
    { clientCertificatePem: null },
    { clientPrivateKeyPem: null },
    { clientCertificateSha256: sha256("wrong-certificate") },
    { clientPrivateKeySha256: sha256("wrong-private-key") },
    { clientCertificatePem: `${CLIENT_CERTIFICATE_PEM}\n` },
    {
      clientPrivateKeyPem:
        "-----BEGIN RSA PRIVATE KEY-----\nUFJJVkFURQ==\n-----END RSA PRIVATE KEY-----\n",
    },
  ]) {
    await assert.rejects(() => collect({ inputOverrides, production: true }), {
      code: "CURRENT187_PGBOUNCER_CLIENT_CREDENTIAL_INVALID",
    });
  }

  for (const inputOverrides of [
    { clientCertificatePem: CLIENT_CERTIFICATE_PEM },
    { clientCertificateSha256: sha256(CLIENT_CERTIFICATE_PEM) },
    { clientPrivateKeyPem: CLIENT_PRIVATE_KEY_PEM },
    { clientPrivateKeySha256: sha256(CLIENT_PRIVATE_KEY_PEM) },
  ]) {
    await assert.rejects(() => collect({ inputOverrides }), {
      code: "CURRENT187_PGBOUNCER_CLIENT_CREDENTIAL_INVALID",
    });
  }
});

test("baseline drift and connect/disconnect ambiguity fail closed", async () => {
  await assert.rejects(
    () =>
      collect({
        inputOverrides: { expectedPoolerConfigurationDigest: "f".repeat(64) },
      }),
    { code: "CURRENT187_PGBOUNCER_BASELINE_MISMATCH" },
  );
  await assert.rejects(
    () => collect({ dependencyOptions: { connectError: true } }),
    {
      code: "CURRENT187_PGBOUNCER_COLLECTION_FAILED",
    },
  );
  await assert.rejects(
    () => collect({ dependencyOptions: { disconnectError: true } }),
    {
      code: "CURRENT187_PGBOUNCER_DISCONNECT_FAILED",
    },
  );
});

test("proxy, accessor, extra input, duplicate identities, and unknown row values fail closed", async () => {
  const showResults = results();
  const source = input({
    expectedPoolerConfigurationDigest:
      computeSyntheticCurrent187PgBouncerConfigurationDigestForTestOnly(
        input(),
        showResults,
      ),
  });
  const deps = dependencies(showResults);
  await assert.rejects(
    () =>
      collectSyntheticCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
        new Proxy(source, {}),
        deps.value,
      ),
    { code: "CURRENT187_PGBOUNCER_INPUT_INVALID" },
  );
  await assert.rejects(
    () =>
      collect({
        inputOverrides: {
          adminUrl:
            "postgresql://lp_pool_admin:%E0%A4%A@localhost:6432/pgbouncer",
        },
      }),
    { code: "CURRENT187_PGBOUNCER_ADMIN_URL_DENIED" },
  );
  await assert.rejects(
    () =>
      collectSyntheticCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
        { ...source, extra: true },
        deps.value,
      ),
    { code: "CURRENT187_PGBOUNCER_INPUT_INVALID" },
  );
  const duplicate = results();
  duplicate.databases.push({ ...duplicate.databases[0] });
  await assert.rejects(
    () =>
      collect({
        inputOverrides: { expectedPoolerConfigurationDigest: "4".repeat(64) },
        resultOverrides: { databases: duplicate.databases },
      }),
    { code: "CURRENT187_PGBOUNCER_COLLECTION_FAILED" },
  );
});

test("source uses pg simple-query SHOW only and exposes no filesystem, Prisma, env, or control mutation", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-pgbouncer-control-plane-collector-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of [
    "SHOW VERSION",
    "SHOW STATE",
    "SHOW CONFIG",
    "SHOW DATABASES",
    "SHOW USERS",
    "SHOW POOLS",
    "SHOW SERVERS",
  ]) {
    assert.match(source, new RegExp(statement, "u"));
  }
  assert.match(source, /queryMode:\s*"simple"/u);
  assert.match(
    source,
    /return collectInternal\(input, pgDependencies\(\), false, true\)/u,
  );
  assert.match(
    source,
    /return collectInternal\(input, dependencies, false, false\)/u,
  );
  assert.doesNotMatch(
    source,
    /return collectInternal\(input, dependencies, false, true\)/u,
  );
  assert.doesNotMatch(
    source,
    /Prisma|process\.env|node:fs|node:child_process/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:SET|RELOAD|PAUSE|SUSPEND|RESUME|SHUTDOWN|KILL)\b/u,
  );
  assert.doesNotMatch(
    source,
    /authorization:\s*true|canMutate:\s*true|canSend:\s*true/u,
  );
});

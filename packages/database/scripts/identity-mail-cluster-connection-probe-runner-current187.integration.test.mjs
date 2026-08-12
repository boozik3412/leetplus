import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TLSSocket, createSecureContext } from "node:tls";
import { promisify } from "node:util";

import { CURRENT187_CONNECTION_NEGATIVE_SCENARIOS } from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
  isVerifiedCurrent187ConnectionProbeRunnerReceipt,
  runCurrent187ConnectionProbeMatrix,
  runSyntheticCurrent187ConnectionProbeMatrixWithActualNetworkForTestOnly,
} from "./identity-mail-cluster-connection-probe-runner-current187.mjs";
import {
  CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION,
  CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
  collectCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly,
  isVerifiedCurrent187ProductionEndpointTlsPeerReceipt,
} from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";
import {
  CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION,
  collectCurrent187HbaReloadEvidenceWithDependenciesForTestOnly,
  computeSyntheticCurrent187HbaCatalogDigestForTestOnly,
  isVerifiedCurrent187ProductionHbaReloadReceipt,
} from "./identity-mail-cluster-hba-reload-collector-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import {
  CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION,
  collectCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly,
  computeCurrent187PgBouncerConfigurationDigestForTestOnly,
  isVerifiedCurrent187ProductionPgBouncerReceipt,
} from "./identity-mail-cluster-pgbouncer-control-plane-collector-current187.mjs";
import {
  CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION,
  CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
  collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly,
  isVerifiedCurrent187ProductionPostgresSessionReceipt,
} from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const execFileAsync = promisify(execFile);
const CONFIRMATION =
  "run-current187-negative-connection-probe-protocol-integration-e2e";
const enabled =
  process.env.IDENTITY_MAIL_CONNECTION_PROBE_RUNNER_CURRENT187_E2E_CONFIRM ===
  CONFIRMATION;
const PRODUCTION_LIKE_NOW = "2026-08-12T12:00:00.000Z";
const PRODUCTION_LIKE_CLUSTER_DIGEST = digest(
  "current187-production-like-cluster",
);
const PRODUCTION_LIKE_UNIVERSE_DIGEST = digest(
  "current187-production-like-universe",
);
const PRODUCTION_LIKE_CA_PEM =
  "-----BEGIN CERTIFICATE-----\nVEVTVA==\n-----END CERTIFICATE-----\n";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function releaseSha() {
  const value = process.env.CI_RELEASE_SHA;
  return typeof value === "string" && /^[a-f0-9]{40}$/u.test(value)
    ? value
    : "a".repeat(40);
}

function opensslExecutable() {
  if (process.platform !== "win32") return "openssl";
  return "C:\\Program Files\\Git\\usr\\bin\\openssl.exe";
}

async function runOpenSsl(root, args) {
  await execFileAsync(opensslExecutable(), args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1_024,
    timeout: 20_000,
    windowsHide: true,
  });
}

async function createCertificates(root) {
  await writeFile(
    join(root, "server.ext"),
    [
      "basicConstraints=critical,CA:FALSE",
      "keyUsage=critical,digitalSignature,keyEncipherment",
      "extendedKeyUsage=serverAuth",
      "subjectAltName=DNS:localhost",
      "",
    ].join("\n"),
    { encoding: "utf8", flag: "wx" },
  );
  for (const [keyName, commonName] of [
    ["ca", "LeetPlus CURRENT187 Probe CA"],
    ["wrong-ca", "LeetPlus CURRENT187 Wrong Probe CA"],
  ]) {
    await runOpenSsl(root, [
      "genpkey",
      "-algorithm",
      "RSA",
      "-pkeyopt",
      "rsa_keygen_bits:2048",
      "-out",
      `${keyName}.key`,
    ]);
    await runOpenSsl(root, [
      "req",
      "-x509",
      "-new",
      "-key",
      `${keyName}.key`,
      "-sha256",
      "-days",
      "2",
      "-subj",
      `/CN=${commonName}`,
      "-out",
      `${keyName}.crt`,
    ]);
  }
  await runOpenSsl(root, [
    "genpkey",
    "-algorithm",
    "RSA",
    "-pkeyopt",
    "rsa_keygen_bits:2048",
    "-out",
    "server.key",
  ]);
  await runOpenSsl(root, [
    "req",
    "-new",
    "-key",
    "server.key",
    "-subj",
    "/CN=localhost",
    "-out",
    "server.csr",
  ]);
  await runOpenSsl(root, [
    "x509",
    "-req",
    "-in",
    "server.csr",
    "-CA",
    "ca.crt",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-days",
    "2",
    "-sha256",
    "-extfile",
    "server.ext",
    "-out",
    "server.crt",
  ]);
  const [ca, wrongCa, certificate, key] = await Promise.all([
    readFile(join(root, "ca.crt"), "utf8"),
    readFile(join(root, "wrong-ca.crt"), "utf8"),
    readFile(join(root, "server.crt"), "utf8"),
    readFile(join(root, "server.key")),
  ]);
  return {
    ca: ca.replaceAll("\r\n", "\n"),
    secureContext: createSecureContext({
      cert: certificate.replaceAll("\r\n", "\n"),
      key,
      maxVersion: "TLSv1.3",
      minVersion: "TLSv1.2",
    }),
    wrongCa: wrongCa.replaceAll("\r\n", "\n"),
  };
}

function postgresErrorPacket(code, message) {
  const body = Buffer.from(`SFATAL\0C${code}\0M${message}\0\0`, "utf8");
  const packet = Buffer.allocUnsafe(body.length + 5);
  packet[0] = 0x45;
  packet.writeInt32BE(body.length + 4, 1);
  body.copy(packet, 5);
  return packet;
}

function startupParameters(packet) {
  if (!Buffer.isBuffer(packet) || packet.length < 8) return null;
  const length = packet.readInt32BE(0);
  if (length !== packet.length || packet.readInt32BE(4) !== 196_608)
    return null;
  const fields = packet.subarray(8, -1).toString("utf8").split("\0");
  const entries = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    entries.push([fields[index], fields[index + 1]]);
  }
  return Object.fromEntries(entries);
}

async function startPostgresRejectionHarness(secureContext) {
  const sockets = new Set();
  const counters = { plaintext: 0, sslRequests: 0, tlsStartups: 0 };
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.once("error", () => {});
    socket.once("data", (request) => {
      const sslRequest =
        Buffer.isBuffer(request) &&
        request.length === 8 &&
        request.readInt32BE(0) === 8 &&
        request.readInt32BE(4) === 80_877_103;
      if (!sslRequest) {
        counters.plaintext += 1;
        socket.end(
          postgresErrorPacket("28000", "TLS is required by this fixture"),
        );
        return;
      }
      counters.sslRequests += 1;
      socket.write(Buffer.from([0x53]), () => {
        const secureSocket = new TLSSocket(socket, {
          isServer: true,
          requestCert: false,
          secureContext,
        });
        sockets.add(secureSocket);
        secureSocket.once("close", () => sockets.delete(secureSocket));
        secureSocket.once("error", () => {});
        secureSocket.once("data", (startup) => {
          const parameters = startupParameters(startup);
          if (!parameters) {
            secureSocket.destroy();
            return;
          }
          counters.tlsStartups += 1;
          const wrongDatabase = parameters.database?.startsWith("missing_");
          secureSocket.end(
            postgresErrorPacket(
              wrongDatabase ? "3D000" : "28P01",
              wrongDatabase
                ? "database does not exist"
                : "password authentication failed",
            ),
          );
        });
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    counters,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
    port: address.port,
  };
}

function productionLikeIdentity(purpose, index) {
  const label = purpose.toLowerCase();
  return Object.freeze({
    applicationName: `leetplus.current187.rehearsal.${label}`,
    databaseName: `leetplus_rehearsal_${label}`,
    databaseOid: String(20_000 + index),
    roleName: `lp_current187_${label}_runtime`,
    roleOid: String(21_000 + index),
    secretReferenceDigest: digest(`production-like:${purpose}:secret-ref`),
  });
}

function productionLikeSessionObservation(identity, index) {
  return {
    applicationName: identity.applicationName,
    backendPid: String(30_000 + index),
    clientAddress: "10.10.0.20",
    clientPort: String(50_000 + index),
    currentRoleBypassRls: false,
    currentRoleCanLogin: true,
    currentRoleConnectionLimit: 4,
    currentRoleCreateDatabase: false,
    currentRoleCreateRole: false,
    currentRoleInherit: false,
    currentRoleName: identity.roleName,
    currentRoleOid: identity.roleOid,
    currentRoleReplication: false,
    currentRoleSuperuser: false,
    databaseConnect: true,
    databaseCreate: false,
    databaseName: identity.databaseName,
    databaseOid: identity.databaseOid,
    databaseTemporary: false,
    incomingMembershipCount: "0",
    outgoingMembershipCount: "0",
    postmasterStartTime: "2026-08-12 08:00:00+00",
    recovery: false,
    roleSettingCount: "0",
    serverAddress: "10.10.0.10",
    serverPort: "5432",
    serverVersionNum: "160014",
    sessionRoleName: identity.roleName,
    sessionRoleOid: identity.roleOid,
    tlsBits: "256",
    tlsCipher: "TLS_AES_256_GCM_SHA384",
    tlsClientDn: null,
    tlsIssuerDn: null,
    tlsSerial: null,
    tlsVersion: "TLSv1.3",
    transactionReadOnly: true,
    transportTls: true,
  };
}

function productionLikeSessionDependencies(identity, index) {
  return {
    createClient() {
      return {
        async disconnect() {},
        async transaction(callback) {
          return callback({
            async execute() {
              return 0;
            },
            async query(statement) {
              if (statement.includes("pg_stat_ssl")) {
                return [productionLikeSessionObservation(identity, index)];
              }
              if (/SELECT\s+'1'::TEXT/u.test(statement)) {
                return [
                  {
                    databaseName: identity.databaseName,
                    sessionRoleName: identity.roleName,
                    transactionReadOnly: true,
                    value: "1",
                  },
                ];
              }
              return [];
            },
          });
        },
      };
    },
    now() {
      return PRODUCTION_LIKE_NOW;
    },
  };
}

async function createProductionLikeSessionReceipt(purpose, index) {
  const identity = productionLikeIdentity(purpose, index);
  const databaseUrl = new URL(
    `postgresql://${identity.roleName}:fixture-only@db-${index}.current187.example:5432/${identity.databaseName}`,
  );
  databaseUrl.searchParams.set("application_name", identity.applicationName);
  databaseUrl.searchParams.set("connection_limit", "1");
  databaseUrl.searchParams.set("sslmode", "verify-full");
  databaseUrl.searchParams.set("sslaccept", "strict");
  const receipt =
    await collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      {
        applicationName: identity.applicationName,
        clusterIdentityDigest: PRODUCTION_LIKE_CLUSTER_DIGEST,
        databaseUniverseDigest: PRODUCTION_LIKE_UNIVERSE_DIGEST,
        databaseUrl: databaseUrl.toString(),
        environment: "production",
        expectedDatabaseName: identity.databaseName,
        expectedDatabaseOid: identity.databaseOid,
        expectedRoleName: identity.roleName,
        expectedRoleOid: identity.roleOid,
        explicitConfirmation:
          CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION,
        purpose,
        releaseSha: releaseSha(),
        secretReferenceDigest: identity.secretReferenceDigest,
        statementTimeoutMs: 5_000,
        transactionTimeoutMs: 15_000,
        verificationChallengeDigest: digest(
          `production-like:${purpose}:session-challenge`,
        ),
      },
      productionLikeSessionDependencies(identity, index),
    );
  return Object.freeze({ identity, receipt });
}

async function createProductionLikeTlsReceipt(
  purpose,
  index,
  sessionReceiptValue,
) {
  const endpointHost = `${purpose.toLowerCase()}.current187.example`;
  const endpointPort = index === 0 ? 6_432 : 5_432 + index;
  const leafCertificateSha256 = digest(
    `production-like:${purpose}:leaf-certificate`,
  );
  const leafSpkiSha256 = digest(`production-like:${purpose}:leaf-spki`);
  return collectCurrent187EndpointTlsPeerEvidenceWithDependenciesForTestOnly(
    {
      caCertificatePem: PRODUCTION_LIKE_CA_PEM,
      caCertificateSha256: digest(PRODUCTION_LIKE_CA_PEM),
      clientCertificatePem:
        "-----BEGIN CERTIFICATE-----\nQ0xJRU5U\n-----END CERTIFICATE-----\n",
      clientCertificateSha256: digest(
        "-----BEGIN CERTIFICATE-----\nQ0xJRU5U\n-----END CERTIFICATE-----\n",
      ),
      clientPrivateKeyPem:
        "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n",
      clientPrivateKeySha256: digest(
        "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n",
      ),
      clusterIdentityDigest: PRODUCTION_LIKE_CLUSTER_DIGEST,
      connectTimeoutMs: 5_000,
      databaseUniverseDigest: PRODUCTION_LIKE_UNIVERSE_DIGEST,
      endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
      endpointHost,
      endpointPort,
      environment: "production",
      expectedLeafCertificateSha256: leafCertificateSha256,
      expectedLeafSpkiSha256: leafSpkiSha256,
      expectedResolvedAddresses: [{ address: "127.0.0.1", family: 4 }],
      explicitConfirmation:
        CURRENT187_ENDPOINT_TLS_PEER_PRODUCTION_CONFIRMATION,
      handshakeTimeoutMs: 10_000,
      postgresSessionReceiptDigest:
        sessionReceiptValue.postgresSessionReceiptDigest,
      purpose,
      releaseSha: releaseSha(),
      secretReferenceDigest: sessionReceiptValue.secretReferenceDigest,
      serverName: endpointHost,
      verificationChallengeDigest: digest(
        `production-like:${purpose}:tls-challenge`,
      ),
    },
    {
      async connectEndpoint() {
        return {
          alpnProtocol: null,
          authorizationError: null,
          authorized: true,
          cipherName: "TLS_AES_256_GCM_SHA384",
          leafCertificateSha256,
          leafSpkiSha256,
          leafValidFrom: "2026-08-11T00:00:00.000Z",
          leafValidTo: "2026-08-14T00:00:00.000Z",
          localAddress: "127.0.0.1",
          localPort: 51_000 + index,
          protocol: "TLSv1.3",
          remoteAddress: "127.0.0.1",
          remotePort: endpointPort,
          serverName: endpointHost,
        };
      },
      now() {
        return PRODUCTION_LIKE_NOW;
      },
      async resolveEndpoint() {
        return [{ address: "127.0.0.1", family: 4 }];
      },
    },
  );
}

function productionLikeHbaRules() {
  return [
    {
      address: null,
      authMethod: "peer",
      databases: ["postgres"],
      error: null,
      fileName: "/etc/postgresql/16/main/pg_hba.conf",
      lineNumber: "90",
      netmask: null,
      options: [],
      ruleNumber: "1",
      type: "local",
      users: ["lp_current187_control_prod"],
    },
    {
      address: "10.10.0.0/24",
      authMethod: "scram-sha-256",
      databases: ["leetplus_control"],
      error: null,
      fileName: "/etc/postgresql/16/main/pg_hba.conf",
      lineNumber: "91",
      netmask: "255.255.255.0",
      options: [],
      ruleNumber: "2",
      type: "hostssl",
      users: ["lp_current187_control_prod"],
    },
  ];
}

async function createProductionLikeHbaReceipt() {
  const rules = productionLikeHbaRules();
  const applicationName = "leetplus-current187-hba-production-like";
  return collectCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
    {
      applicationName,
      clusterIdentityDigest: PRODUCTION_LIKE_CLUSTER_DIGEST,
      databaseUrl: `postgresql://lp_current187_control_prod:fixture-only@control.current187.example:5432/leetplus_control?application_name=${applicationName}&connection_limit=1&sslmode=verify-full&sslaccept=strict`,
      databaseUniverseDigest: PRODUCTION_LIKE_UNIVERSE_DIGEST,
      environment: "production",
      expectedControlDatabaseName: "leetplus_control",
      expectedControlDatabaseOid: "22000",
      expectedControlRoleName: "lp_current187_control_prod",
      expectedControlRoleOid: "22001",
      expectedHbaCatalogDigest:
        computeSyntheticCurrent187HbaCatalogDigestForTestOnly(rules),
      explicitConfirmation: CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION,
      releaseSha: releaseSha(),
      reloadChallengeDigest: digest("production-like:hba-reload-challenge"),
      reloadNotBefore: "2026-08-12T11:58:00.000Z",
      statementTimeoutMs: 5_000,
      transactionTimeoutMs: 15_000,
    },
    {
      createClient() {
        return {
          async disconnect() {},
          async transaction(callback) {
            return callback({
              async execute() {
                return 0;
              },
              async query(statement) {
                if (statement.includes("pg_hba_file_rules")) return rules;
                if (statement.includes("pg_conf_load_time")) {
                  return [
                    {
                      applicationName,
                      configurationLoadTime: "2026-08-12T11:59:00.000Z",
                      controlDatabaseName: "leetplus_control",
                      controlDatabaseOid: "22000",
                      controlRoleName: "lp_current187_control_prod",
                      controlRoleOid: "22001",
                      postmasterStartTime: "2026-08-12T08:00:00.000Z",
                      transactionReadOnly: true,
                    },
                  ];
                }
                return [];
              },
            });
          },
        };
      },
      now() {
        return PRODUCTION_LIKE_NOW;
      },
    },
  );
}

function productionLikePgBouncerResults() {
  const configValues = {
    auth_type: "scram-sha-256",
    client_tls_sslmode: "verify-full",
    ignore_startup_parameters: "extra_float_digits",
    max_client_conn: "500",
    max_prepared_statements: "0",
    pool_mode: "transaction",
    server_reset_query_always: "0",
    server_tls_sslmode: "verify-full",
  };
  return {
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
        database: "leetplus_rehearsal_application",
        disabled: 0,
        force_user: null,
        host: "postgres.current187.example",
        max_client_connections: 500,
        max_connections: 50,
        name: "leetplus_rehearsal_application",
        paused: 0,
        pool_mode: null,
        pool_size: 20,
        port: 5432,
      },
    ],
    pools: [
      {
        cl_active: 1,
        database: "leetplus_rehearsal_application",
        pool_mode: "transaction",
        sv_active: 1,
        user: "lp_current187_application_runtime",
      },
    ],
    servers: [
      {
        addr: "10.10.0.10",
        close_needed: 0,
        database: "leetplus_rehearsal_application",
        port: 5432,
        state: "active",
        tls: "TLSv1.3/TLS_AES_256_GCM_SHA384",
        user: "lp_current187_application_runtime",
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
        name: "lp_current187_application_runtime",
        pool_mode: null,
      },
    ],
    version: [{ version: "PgBouncer 1.24.1" }],
  };
}

async function createProductionLikePgBouncerReceipt(
  hbaReceipt,
  applicationTlsReceipt,
) {
  const results = productionLikePgBouncerResults();
  const baseInput = {
    adminUrl:
      "postgresql://lp_pool_admin:fixture-only@pool.current187.example:6432/pgbouncer",
    applicationDatabaseName: "leetplus_rehearsal_application",
    applicationUserName: "lp_current187_application_runtime",
    caCertificatePem: PRODUCTION_LIKE_CA_PEM,
    caCertificateSha256: digest(PRODUCTION_LIKE_CA_PEM),
    clientCertificatePem:
      "-----BEGIN CERTIFICATE-----\nQ0xJRU5U\n-----END CERTIFICATE-----\n",
    clientCertificateSha256: digest(
      "-----BEGIN CERTIFICATE-----\nQ0xJRU5U\n-----END CERTIFICATE-----\n",
    ),
    clientPrivateKeyPem:
      "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n",
    clientPrivateKeySha256: digest(
      "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n",
    ),
    clusterIdentityDigest: PRODUCTION_LIKE_CLUSTER_DIGEST,
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: PRODUCTION_LIKE_UNIVERSE_DIGEST,
    endpointTlsPeerReceiptDigest:
      applicationTlsReceipt.endpointTlsPeerReceiptDigest,
    environment: "production",
    expectedBackendAddress: "10.10.0.10",
    expectedBackendDatabaseName: "leetplus_rehearsal_application",
    expectedBackendHost: "postgres.current187.example",
    expectedBackendPort: 5432,
    expectedPoolerConfigurationDigest: digest(
      "production-like:provisional-pgbouncer-config",
    ),
    explicitConfirmation: CURRENT187_PGBOUNCER_PRODUCTION_CONFIRMATION,
    hbaReloadReceiptDigest: hbaReceipt.hbaReloadReceiptDigest,
    queryTimeoutMs: 5_000,
    releaseSha: releaseSha(),
    serverName: "pool.current187.example",
    verificationChallengeDigest: digest("production-like:pgbouncer-challenge"),
  };
  const expectedPoolerConfigurationDigest =
    computeCurrent187PgBouncerConfigurationDigestForTestOnly(
      baseInput,
      results,
      false,
    );
  const byStatement = {
    "SHOW CONFIG": results.config,
    "SHOW DATABASES": results.databases,
    "SHOW POOLS": results.pools,
    "SHOW SERVERS": results.servers,
    "SHOW STATE": results.state,
    "SHOW USERS": results.users,
    "SHOW VERSION": results.version,
  };
  return collectCurrent187PgBouncerControlPlaneEvidenceWithDependenciesForTestOnly(
    { ...baseInput, expectedPoolerConfigurationDigest },
    {
      createClient() {
        return {
          async connect() {},
          async disconnect() {},
          async query(statement) {
            return structuredClone(byStatement[statement]);
          },
        };
      },
      now() {
        return PRODUCTION_LIKE_NOW;
      },
    },
  );
}

async function productionLikeBrandedRunnerInput(certificates, port) {
  const services = [];
  for (const [
    index,
    purpose,
  ] of CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.entries()) {
    const { receipt: postgresSessionReceipt } =
      await createProductionLikeSessionReceipt(purpose, index);
    const endpointTlsPeerReceipt = await createProductionLikeTlsReceipt(
      purpose,
      index,
      postgresSessionReceipt,
    );
    services.push({
      allowedOperationsDigest: digest(`production-like:${purpose}:operations`),
      endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
      endpointTlsPeerReceipt,
      hbaAuthMethod: "scram-sha-256",
      hbaRuleDigest: digest(`production-like:${purpose}:hba-rule`),
      negativeConnections: CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.slice(
        0,
        5,
      ).map((scenario) => ({
        caCertificatePem:
          scenario === "PLAINTEXT_TRANSPORT"
            ? null
            : scenario === "WRONG_CA"
              ? certificates.wrongCa
              : certificates.ca,
        challengeDigest: digest(
          `production-like:${purpose}:${scenario}:challenge`,
        ),
        clientCertificatePem:
          scenario === "PLAINTEXT_TRANSPORT"
            ? null
            : "-----BEGIN CERTIFICATE-----\nY2xpZW50\n-----END CERTIFICATE-----\n",
        clientCertificateSha256:
          scenario === "PLAINTEXT_TRANSPORT"
            ? null
            : digest(
                "-----BEGIN CERTIFICATE-----\nY2xpZW50\n-----END CERTIFICATE-----\n",
              ),
        clientPrivateKeyPem:
          scenario === "PLAINTEXT_TRANSPORT"
            ? null
            : "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n",
        clientPrivateKeySha256:
          scenario === "PLAINTEXT_TRANSPORT"
            ? null
            : digest(
                "-----BEGIN PRIVATE KEY-----\nUFJJVkFURQ==\n-----END PRIVATE KEY-----\n",
              ),
        connectionString: `postgresql://${
          scenario === "WRONG_ROLE"
            ? `wrong_role_${index}`
            : `allowed_role_${index}`
        }:fixture-password@127.0.0.1:${port}/${
          scenario === "WRONG_DATABASE"
            ? `missing_${index}`
            : `allowed_${index}`
        }?sslmode=${
          scenario === "PLAINTEXT_TRANSPORT" ? "disable" : "verify-full"
        }`,
        scenario,
        serverName:
          scenario === "PLAINTEXT_TRANSPORT"
            ? null
            : scenario === "WRONG_HOSTNAME"
              ? "wrong.invalid"
              : "localhost",
      })),
      poolerMappingDigest: digest(`production-like:${purpose}:pooler-mapping`),
      poolMode: index === 0 ? "TRANSACTION" : "SESSION",
      postgresSessionReceipt,
      purpose,
      tlsMode: "VERIFY_FULL",
    });
  }
  const hbaReloadReceipt = await createProductionLikeHbaReceipt();
  const pgbouncerReceipt = await createProductionLikePgBouncerReceipt(
    hbaReloadReceipt,
    services[0].endpointTlsPeerReceipt,
  );
  return {
    clusterIdentityDigest: PRODUCTION_LIKE_CLUSTER_DIGEST,
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: PRODUCTION_LIKE_UNIVERSE_DIGEST,
    environment: "production",
    hbaReloadReceipt,
    hostControlChallengeDigest: digest(
      "production-like:host-control-challenge",
    ),
    nonce: digest("production-like:runner-nonce"),
    operationId: "22222222-2222-4222-8222-222222222222",
    pgbouncerReceipt,
    probeRunnerArtifactDigest: digest("production-like:runner-artifact"),
    releaseSha: releaseSha(),
    services,
  };
}

function sessionReceipt(purpose) {
  return {
    applicationNameDigest: digest(`${purpose}:application`),
    authorization: false,
    backendIdentityDigest: digest(`${purpose}:backend`),
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: digest("integration-cluster"),
    databaseUniverseDigest: digest("integration-universe"),
    kind: CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
    positiveProbeDigest: digest(`${purpose}:positive`),
    postgresSessionReceiptDigest: digest(`${purpose}:j1`),
    purpose,
    releaseSha: releaseSha(),
    secretReferenceDigest: digest(`${purpose}:secret-ref`),
    sourceDatabaseIoPerformed: true,
    syntheticOnly: true,
    transportTlsObserved: true,
  };
}

function service(purpose, index, certificates, port) {
  const session = sessionReceipt(purpose);
  return {
    allowedOperationsDigest: digest(`${purpose}:operations`),
    endpointClass: index === 0 ? "POOLER" : "DIRECT_DATABASE",
    endpointTlsPeerReceipt: {
      authorization: false,
      canMutate: false,
      canSend: false,
      clusterIdentityDigest: digest("integration-cluster"),
      databaseUniverseDigest: digest("integration-universe"),
      endpointTlsPeerReceiptDigest: digest(`${purpose}:j2`),
      kind: CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
      postgresSessionReceiptDigest: session.postgresSessionReceiptDigest,
      purpose,
      releaseSha: releaseSha(),
      sourceNetworkIoPerformed: true,
      syntheticOnly: true,
      tlsCaVerified: true,
      tlsHostnameVerified: true,
    },
    hbaAuthMethod: "scram-sha-256",
    hbaRuleDigest: digest(`${purpose}:hba-rule`),
    negativeConnections: CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.slice(
      0,
      5,
    ).map((scenario) => ({
      caCertificatePem:
        scenario === "PLAINTEXT_TRANSPORT"
          ? null
          : scenario === "WRONG_CA"
            ? certificates.wrongCa
            : certificates.ca,
      challengeDigest: digest(`${purpose}:${scenario}:challenge`),
      clientCertificatePem: null,
      clientCertificateSha256: null,
      clientPrivateKeyPem: null,
      clientPrivateKeySha256: null,
      connectionString: `postgresql://${
        scenario === "WRONG_ROLE"
          ? `wrong_role_${index}`
          : `allowed_role_${index}`
      }:fixture-password@127.0.0.1:${port}/${
        scenario === "WRONG_DATABASE" ? `missing_${index}` : `allowed_${index}`
      }?sslmode=${
        scenario === "PLAINTEXT_TRANSPORT" ? "disable" : "verify-full"
      }`,
      scenario,
      serverName:
        scenario === "PLAINTEXT_TRANSPORT"
          ? null
          : scenario === "WRONG_HOSTNAME"
            ? "wrong.invalid"
            : "localhost",
    })),
    poolerMappingDigest: digest(`${purpose}:pooler-mapping`),
    poolMode: index === 0 ? "TRANSACTION" : "SESSION",
    postgresSessionReceipt: session,
    purpose,
    tlsMode: "VERIFY_FULL",
  };
}

function runnerInput(certificates, port) {
  const hbaReloadReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: digest("integration-cluster"),
    databaseUniverseDigest: digest("integration-universe"),
    hbaReloadReceiptDigest: digest("integration-j3"),
    releaseSha: releaseSha(),
    reloadEpochDigest: digest("integration-reload-epoch"),
    syntheticOnly: true,
  };
  return {
    clusterIdentityDigest: digest("integration-cluster"),
    connectTimeoutMs: 5_000,
    databaseUniverseDigest: digest("integration-universe"),
    environment: "ci",
    hbaReloadReceipt,
    hostControlChallengeDigest: digest("integration-host-control"),
    nonce: digest("integration-nonce"),
    operationId: "11111111-1111-4111-8111-111111111111",
    pgbouncerReceipt: {
      authorization: false,
      canMutate: false,
      canSend: false,
      clusterIdentityDigest: digest("integration-cluster"),
      databaseUniverseDigest: digest("integration-universe"),
      hbaReloadReceiptDigest: hbaReloadReceipt.hbaReloadReceiptDigest,
      pgbouncerReceiptDigest: digest("integration-j4"),
      releaseSha: releaseSha(),
      syntheticOnly: true,
      transactionPoolModeObserved: true,
      userCollapseAbsentObserved: true,
    },
    probeRunnerArtifactDigest: digest("integration-runner-artifact"),
    releaseSha: releaseSha(),
    services: CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.map(
      (purpose, index) => service(purpose, index, certificates, port),
    ),
  };
}

test(
  "actual PostgreSQL wire/TLS fixture rejects all 20 negative connections and emits no secrets",
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const root = await mkdtemp(
      join(tmpdir(), "leetplus-current187-probe-runner-"),
    );
    let harness;
    try {
      const certificates = await createCertificates(root);
      harness = await startPostgresRejectionHarness(certificates.secureContext);
      const receipt =
        await runSyntheticCurrent187ConnectionProbeMatrixWithActualNetworkForTestOnly(
          runnerInput(certificates, harness.port),
          {
            environment: "ci",
            explicitConfirmation:
              CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION,
            nodeEnv: "test",
          },
        );
      assert.equal(
        isVerifiedCurrent187ConnectionProbeRunnerReceipt(receipt),
        true,
      );
      assert.equal(receipt.actualNetworkNegativeProbeCount, 20);
      assert.equal(receipt.controlPolicyNegativeProbeCount, 12);
      assert.equal(receipt.negativeProbeCount, 32);
      assert.equal(harness.counters.plaintext, 4);
      assert.equal(harness.counters.sslRequests, 16);
      assert.equal(harness.counters.tlsStartups, 8);
      assert.equal(
        new Set(
          receipt.services.flatMap((entry) =>
            entry.negativeProbes.map((probe) => probe.evidenceDigest),
          ),
        ).size,
        32,
      );
      const serializedReceipt = JSON.stringify(receipt);
      for (const secretFragment of [
        "fixture-password",
        "wrong_role_",
        "allowed_0",
        "missing_0",
        "BEGIN CERTIFICATE",
        "127.0.0.1",
        "localhost",
        "wrong.invalid",
      ]) {
        assert.equal(
          serializedReceipt.includes(secretFragment),
          false,
          `receipt leaked ${secretFragment}`,
        );
      }
      assert.equal(receipt.authorization, false);
      assert.equal(receipt.canMutate, false);
      assert.equal(receipt.canSend, false);
      assert.equal(receipt.productionRuntimeAttested, false);
      assert.equal(receipt.sharedBetaAccess, false);
      assert.equal(receipt.testAccessAuthorized, false);
    } finally {
      if (harness) await harness.close();
      await rm(root, { force: true, recursive: true });
    }
  },
);

test(
  "dependency-backed production-mode receipts cannot cross the actual-I/O runner brand boundary",
  { skip: !enabled, timeout: 60_000 },
  async () => {
    const root = await mkdtemp(
      join(tmpdir(), "leetplus-current187-production-like-runner-"),
    );
    let harness;
    try {
      const certificates = await createCertificates(root);
      harness = await startPostgresRejectionHarness(certificates.secureContext);
      const input = await productionLikeBrandedRunnerInput(
        certificates,
        harness.port,
      );
      for (const serviceEntry of input.services) {
        assert.equal(serviceEntry.postgresSessionReceipt.syntheticOnly, false);
        assert.equal(serviceEntry.endpointTlsPeerReceipt.syntheticOnly, false);
        assert.equal(
          isVerifiedCurrent187ProductionPostgresSessionReceipt(
            serviceEntry.postgresSessionReceipt,
          ),
          false,
        );
        assert.equal(
          isVerifiedCurrent187ProductionEndpointTlsPeerReceipt(
            serviceEntry.endpointTlsPeerReceipt,
          ),
          false,
        );
      }
      assert.equal(input.hbaReloadReceipt.syntheticOnly, false);
      assert.equal(input.pgbouncerReceipt.syntheticOnly, false);
      assert.equal(
        isVerifiedCurrent187ProductionHbaReloadReceipt(input.hbaReloadReceipt),
        false,
      );
      assert.equal(
        isVerifiedCurrent187ProductionPgBouncerReceipt(input.pgbouncerReceipt),
        false,
      );
      await assert.rejects(() => runCurrent187ConnectionProbeMatrix(input), {
        code: "CURRENT187_CONNECTION_PROBE_RUNNER_CONTROL_RECEIPT_INVALID",
      });
      assert.deepEqual(harness.counters, {
        plaintext: 0,
        sslRequests: 0,
        tlsStartups: 0,
      });
    } finally {
      if (harness) await harness.close();
      await rm(root, { force: true, recursive: true });
    }
  },
);

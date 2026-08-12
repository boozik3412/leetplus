import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import pg from "pg";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  Current187AdmissionContractError,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
  current187AdmissionValidDigest,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO,
  CURRENT187_CONNECTION_NEGATIVE_SCENARIOS,
} from "./identity-mail-cluster-connection-probe-attestation-current187.mjs";
import {
  CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
  isVerifiedCurrent187EndpointTlsPeerReceipt,
} from "./identity-mail-cluster-endpoint-tls-peer-collector-current187.mjs";
import { isVerifiedCurrent187HbaReloadReceipt } from "./identity-mail-cluster-hba-reload-collector-current187.mjs";
import { CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES } from "./identity-mail-cluster-network-runtime-attestation-current187.mjs";
import { isVerifiedCurrent187PgBouncerReceipt } from "./identity-mail-cluster-pgbouncer-control-plane-collector-current187.mjs";
import {
  CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
  isVerifiedCurrent187PostgresSessionReceipt,
} from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

export { Current187AdmissionContractError };

export const CURRENT187_CONNECTION_PROBE_RUNNER_SLICE =
  "CURRENT187_J5_CAPABILITY_CONNECTION_PROBE_RUNNER";
export const CURRENT187_CONNECTION_PROBE_RUNNER_PROFILE =
  "CURRENT187_CAPABILITY_CONNECTION_PROBE_RUNNER_SECRET_FREE_V1";
export const CURRENT187_CONNECTION_PROBE_RUNNER_KIND =
  "CURRENT187_CONNECTION_PROBE_RUNNER_RECEIPT";
export const CURRENT187_CONNECTION_PROBE_RUNNER_STATUS =
  "CURRENT187_CONNECTION_PROBE_MATRIX_EXECUTED_DENY_ONLY";
export const CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION =
  "run-current187-connection-probe-matrix-with-test-capabilities";
export const CURRENT187_CONNECTION_PROBE_RUNNER_MAX_CONNECT_TIMEOUT_MS = 10_000;

const NETWORK_SCENARIOS = Object.freeze(
  CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.slice(0, 5),
);
const CONTROL_SCENARIOS = Object.freeze(
  CURRENT187_CONNECTION_NEGATIVE_SCENARIOS.slice(5),
);
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EXPECTED_ENDPOINT_CLASS = Object.freeze({
  APPLICATION: "POOLER",
  COORDINATOR: "DIRECT_DATABASE",
  MIGRATION: "DIRECT_DATABASE",
  WORKER: "DIRECT_DATABASE",
});
const EXPECTED_POOL_MODE = Object.freeze({
  APPLICATION: "TRANSACTION",
  COORDINATOR: "SESSION",
  MIGRATION: "SESSION",
  WORKER: "SESSION",
});
const EXPECTED_SSL_MODE = Object.freeze({
  PLAINTEXT_TRANSPORT: "disable",
  WRONG_CA: "verify-full",
  WRONG_DATABASE: "verify-full",
  WRONG_HOSTNAME: "verify-full",
  WRONG_ROLE: "verify-full",
});
const SAFE_HBA_AUTH_METHODS = new Set(["cert", "scram-sha-256"]);

const INPUT_KEYS = Object.freeze([
  "clusterIdentityDigest",
  "connectTimeoutMs",
  "databaseUniverseDigest",
  "environment",
  "hbaReloadReceipt",
  "hostControlChallengeDigest",
  "nonce",
  "operationId",
  "pgbouncerReceipt",
  "probeRunnerArtifactDigest",
  "releaseSha",
  "services",
]);
const SERVICE_KEYS = Object.freeze([
  "allowedOperationsDigest",
  "endpointClass",
  "endpointTlsPeerReceipt",
  "hbaAuthMethod",
  "hbaRuleDigest",
  "negativeConnections",
  "poolerMappingDigest",
  "poolMode",
  "postgresSessionReceipt",
  "purpose",
  "tlsMode",
]);
const CONNECTION_KEYS = Object.freeze([
  "caCertificatePem",
  "challengeDigest",
  "connectionString",
  "scenario",
  "serverName",
]);
const DEPENDENCY_KEYS = Object.freeze(["attemptRejectedConnection", "now"]);
const ATTEMPT_RESULT_KEYS = Object.freeze([
  "connected",
  "errorCode",
  "observedOutcome",
]);
const SYNTHETIC_CONTEXT_KEYS = Object.freeze([
  "environment",
  "explicitConfirmation",
  "nodeEnv",
]);

const NETWORK_EVIDENCE_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_NETWORK_EVIDENCE_V1";
const CONTROL_EVIDENCE_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_CONTROL_EVIDENCE_V1";
const TRANSCRIPT_DOMAIN =
  "LEETPLUS_CURRENT187_CONNECTION_PROBE_RUNNER_TRANSCRIPT_V1";
const RECEIPT_DOMAIN = "LEETPLUS_CURRENT187_CONNECTION_PROBE_RUNNER_RECEIPT_V1";
const ERROR_CODE_DOMAIN = "LEETPLUS_CURRENT187_CONNECTION_PROBE_ERROR_CODE_V1";

const VERIFIED_RECEIPTS = new WeakSet();

function fail(reasonCode, message) {
  current187AdmissionFail(reasonCode, message);
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function exactDenseArray(value, length, reasonCode, message) {
  if (!Array.isArray(value) || utilTypes.isProxy(value))
    fail(reasonCode, message);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expectedKeys = [
    ...Array.from({ length }, (_, index) => String(index)),
    "length",
  ].sort();
  const actualKeys = Reflect.ownKeys(descriptors);
  if (
    actualKeys.some((key) => typeof key !== "string") ||
    actualKeys.length !== expectedKeys.length ||
    actualKeys.sort().some((key, index) => key !== expectedKeys[index]) ||
    descriptors.length?.value !== length ||
    Array.from({ length }, (_, index) => descriptors[String(index)]).some(
      (descriptor) =>
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true,
    )
  ) {
    fail(reasonCode, message);
  }
  return Object.freeze(
    Array.from({ length }, (_, index) => descriptors[String(index)].value),
  );
}

function requireDigest(value, reasonCode, label) {
  if (!current187AdmissionValidDigest(value)) {
    fail(reasonCode, `${label} must be a non-zero SHA-256 digest.`);
  }
  return value;
}

function normalizeConnectionSpec(value, scenario) {
  const row = current187AdmissionExactDataRecord(
    value,
    CONNECTION_KEYS,
    "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
    "A negative connection specification must be exact and data-only.",
  );
  if (
    row.scenario !== scenario ||
    typeof row.connectionString !== "string" ||
    row.connectionString.length > 4_096
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
      "A negative connection specification is invalid.",
    );
  }
  requireDigest(
    row.challengeDigest,
    "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
    "Connection challenge",
  );
  let parsed;
  try {
    parsed = new URL(row.connectionString);
  } catch {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
      "A PostgreSQL connection URL is invalid.",
    );
  }
  const sslMode = parsed.searchParams.get("sslmode");
  const searchKeys = [...parsed.searchParams.keys()];
  const plaintext = scenario === "PLAINTEXT_TRANSPORT";
  const port = Number(parsed.port);
  if (
    !new Set(["postgres:", "postgresql:"]).has(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.port ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !parsed.username ||
    !parsed.password ||
    !parsed.pathname ||
    parsed.pathname === "/" ||
    parsed.hash ||
    searchKeys.length !== 1 ||
    searchKeys[0] !== "sslmode" ||
    sslMode !== EXPECTED_SSL_MODE[scenario] ||
    (plaintext
      ? row.caCertificatePem !== null || row.serverName !== null
      : typeof row.caCertificatePem !== "string" ||
        !row.caCertificatePem.startsWith("-----BEGIN CERTIFICATE-----\n") ||
        !row.caCertificatePem.endsWith("-----END CERTIFICATE-----\n") ||
        Buffer.byteLength(row.caCertificatePem, "utf8") > 16 * 1_024 ||
        typeof row.serverName !== "string" ||
        row.serverName.length === 0 ||
        row.serverName.length > 253 ||
        !/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u.test(
          row.serverName,
        ))
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTION_INVALID",
      "The PostgreSQL connection URL does not match the scenario transport policy.",
    );
  }
  return Object.freeze({ ...row });
}

function syntheticReceiptShape(value, kind, purpose) {
  if (!value || typeof value !== "object" || utilTypes.isProxy(value))
    return false;
  return (
    value.kind === kind &&
    value.purpose === purpose &&
    value.syntheticOnly === true &&
    value.authorization === false &&
    value.canMutate === false &&
    value.canSend === false
  );
}

function verifyReceiptBrand(value, verifier, syntheticOnly, kind, purpose) {
  return syntheticOnly
    ? syntheticReceiptShape(value, kind, purpose)
    : verifier(value);
}

function normalizeInput(value, syntheticOnly) {
  const input = current187AdmissionExactDataRecord(
    value,
    INPUT_KEYS,
    "CURRENT187_CONNECTION_PROBE_RUNNER_INPUT_INVALID",
    "Connection-probe runner input must be exact and data-only.",
  );
  for (const [candidate, label] of [
    [input.clusterIdentityDigest, "Cluster identity"],
    [input.databaseUniverseDigest, "Database universe"],
    [input.hostControlChallengeDigest, "Host control challenge"],
    [input.nonce, "Runner nonce"],
    [input.probeRunnerArtifactDigest, "Runner artifact"],
  ]) {
    requireDigest(
      candidate,
      "CURRENT187_CONNECTION_PROBE_RUNNER_INPUT_INVALID",
      label,
    );
  }
  if (
    input.environment !== (syntheticOnly ? "ci" : "production") ||
    typeof input.releaseSha !== "string" ||
    !RELEASE_SHA_PATTERN.test(input.releaseSha) ||
    typeof input.operationId !== "string" ||
    !UUID_PATTERN.test(input.operationId) ||
    !Number.isSafeInteger(input.connectTimeoutMs) ||
    input.connectTimeoutMs < 1 ||
    input.connectTimeoutMs >
      CURRENT187_CONNECTION_PROBE_RUNNER_MAX_CONNECT_TIMEOUT_MS
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_INPUT_INVALID",
      "Runner environment, release, operation, or timeout is invalid.",
    );
  }
  const hba = input.hbaReloadReceipt;
  const pgbouncer = input.pgbouncerReceipt;
  const hbaBrand = syntheticOnly
    ? hba?.syntheticOnly === true
    : isVerifiedCurrent187HbaReloadReceipt(hba);
  const pgbouncerBrand = syntheticOnly
    ? pgbouncer?.syntheticOnly === true
    : isVerifiedCurrent187PgBouncerReceipt(pgbouncer);
  if (
    !hbaBrand ||
    !pgbouncerBrand ||
    !current187AdmissionValidDigest(hba.hbaReloadReceiptDigest) ||
    !current187AdmissionValidDigest(pgbouncer.pgbouncerReceiptDigest) ||
    pgbouncer.hbaReloadReceiptDigest !== hba.hbaReloadReceiptDigest ||
    !pgbouncer.transactionPoolModeObserved ||
    !pgbouncer.userCollapseAbsentObserved
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_CONTROL_RECEIPT_INVALID",
      "HBA and PgBouncer control receipts are not an exact verified chain.",
    );
  }
  for (const receipt of [hba, pgbouncer]) {
    if (
      receipt.clusterIdentityDigest !== input.clusterIdentityDigest ||
      receipt.databaseUniverseDigest !== input.databaseUniverseDigest ||
      receipt.releaseSha !== input.releaseSha ||
      receipt.authorization !== false ||
      receipt.canMutate !== false ||
      receipt.canSend !== false
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_RUNNER_RECEIPT_BINDING_INVALID",
        "A control receipt does not match the runner release and cluster.",
      );
    }
  }
  const services = exactDenseArray(
    input.services,
    CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES.length,
    "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICES_INVALID",
    "Runner requires four ordered service definitions.",
  ).map((candidate, index) => {
    const service = current187AdmissionExactDataRecord(
      candidate,
      SERVICE_KEYS,
      "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICE_INVALID",
      "A runner service definition must be exact and data-only.",
    );
    const purpose = CURRENT187_NETWORK_RUNTIME_SERVICE_PURPOSES[index];
    for (const [candidateDigest, label] of [
      [service.allowedOperationsDigest, "Allowed operations"],
      [service.hbaRuleDigest, "HBA rule"],
      [service.poolerMappingDigest, "Pooler mapping"],
    ]) {
      requireDigest(
        candidateDigest,
        "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICE_INVALID",
        label,
      );
    }
    if (
      service.purpose !== purpose ||
      service.endpointClass !== EXPECTED_ENDPOINT_CLASS[purpose] ||
      service.poolMode !== EXPECTED_POOL_MODE[purpose] ||
      service.tlsMode !== "VERIFY_FULL" ||
      !SAFE_HBA_AUTH_METHODS.has(service.hbaAuthMethod)
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICE_INVALID",
        "Service purpose, endpoint, pool, TLS, or HBA policy is invalid.",
      );
    }
    const session = service.postgresSessionReceipt;
    const tls = service.endpointTlsPeerReceipt;
    const sessionBrand = verifyReceiptBrand(
      session,
      isVerifiedCurrent187PostgresSessionReceipt,
      syntheticOnly,
      CURRENT187_POSTGRES_SESSION_RECEIPT_KIND,
      purpose,
    );
    const tlsBrand = verifyReceiptBrand(
      tls,
      isVerifiedCurrent187EndpointTlsPeerReceipt,
      syntheticOnly,
      CURRENT187_ENDPOINT_TLS_PEER_RECEIPT_KIND,
      purpose,
    );
    if (
      !sessionBrand ||
      !tlsBrand ||
      session.clusterIdentityDigest !== input.clusterIdentityDigest ||
      session.databaseUniverseDigest !== input.databaseUniverseDigest ||
      session.releaseSha !== input.releaseSha ||
      tls.clusterIdentityDigest !== input.clusterIdentityDigest ||
      tls.databaseUniverseDigest !== input.databaseUniverseDigest ||
      tls.releaseSha !== input.releaseSha ||
      tls.postgresSessionReceiptDigest !==
        session.postgresSessionReceiptDigest ||
      session.sourceDatabaseIoPerformed !== true ||
      tls.sourceNetworkIoPerformed !== true ||
      session.transportTlsObserved !== true ||
      tls.tlsCaVerified !== true ||
      tls.tlsHostnameVerified !== true
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICE_RECEIPT_INVALID",
        "A positive service session/TLS receipt chain is invalid.",
      );
    }
    const negativeConnections = exactDenseArray(
      service.negativeConnections,
      NETWORK_SCENARIOS.length,
      "CURRENT187_CONNECTION_PROBE_RUNNER_CONNECTIONS_INVALID",
      "Each service requires five ordered negative network probes.",
    ).map((row, connectionIndex) =>
      normalizeConnectionSpec(row, NETWORK_SCENARIOS[connectionIndex]),
    );
    const parsedNegativeConnections = negativeConnections.map(
      (connection) => new URL(connection.connectionString),
    );
    const targetEndpoints = new Set(
      parsedNegativeConnections.map(
        (parsed) => `${parsed.hostname}:${parsed.port}`,
      ),
    );
    const [wrongRole, wrongDatabase, plaintext, wrongCa, wrongHostname] =
      negativeConnections;
    const [
      wrongRoleUrl,
      wrongDatabaseUrl,
      plaintextUrl,
      wrongCaUrl,
      wrongHostnameUrl,
    ] = parsedNegativeConnections;
    if (
      targetEndpoints.size !== 1 ||
      wrongRoleUrl.username === plaintextUrl.username ||
      wrongRoleUrl.pathname !== plaintextUrl.pathname ||
      wrongDatabaseUrl.username !== plaintextUrl.username ||
      wrongDatabaseUrl.pathname === plaintextUrl.pathname ||
      wrongCaUrl.username !== plaintextUrl.username ||
      wrongCaUrl.pathname !== plaintextUrl.pathname ||
      wrongHostnameUrl.username !== plaintextUrl.username ||
      wrongHostnameUrl.pathname !== plaintextUrl.pathname ||
      wrongRole.serverName !== wrongDatabase.serverName ||
      wrongRole.serverName !== wrongCa.serverName ||
      wrongRole.serverName === wrongHostname.serverName ||
      wrongRole.caCertificatePem !== wrongDatabase.caCertificatePem ||
      wrongRole.caCertificatePem !== wrongHostname.caCertificatePem ||
      wrongRole.caCertificatePem === wrongCa.caCertificatePem ||
      plaintext.caCertificatePem !== null ||
      plaintext.serverName !== null
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_RUNNER_SCENARIO_BINDING_INVALID",
        "Negative probes do not isolate role, database, transport, CA, and hostname failure dimensions.",
      );
    }
    return Object.freeze({ ...service, negativeConnections });
  });
  for (const key of [
    "applicationNameDigest",
    "backendIdentityDigest",
    "secretReferenceDigest",
  ]) {
    if (
      new Set(services.map((service) => service.postgresSessionReceipt[key]))
        .size !== services.length
    ) {
      fail(
        "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICE_IDENTITY_COLLAPSE",
        "Positive service identities must remain pairwise distinct.",
      );
    }
  }
  if (
    new Set(services.map((service) => service.poolerMappingDigest)).size !==
    services.length
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_SERVICE_IDENTITY_COLLAPSE",
      "Pooler/direct mappings must remain pairwise distinct.",
    );
  }
  return Object.freeze({ ...input, services });
}

function normalizeDependencies(value) {
  const dependencies = current187AdmissionExactDataRecord(
    value,
    DEPENDENCY_KEYS,
    "CURRENT187_CONNECTION_PROBE_RUNNER_DEPENDENCIES_INVALID",
    "Runner dependencies must be exact.",
    true,
  );
  if (
    typeof dependencies.attemptRejectedConnection !== "function" ||
    typeof dependencies.now !== "function"
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_DEPENDENCIES_INVALID",
      "Runner dependencies are invalid.",
    );
  }
  return dependencies;
}

function canonicalIso(value) {
  if (typeof value !== "string") {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_TIME_INVALID",
      "Runner time must be canonical UTC.",
    );
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_TIME_INVALID",
      "Runner time must be canonical UTC.",
    );
  }
  return value;
}

function classifyConnectionError(scenario, error) {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
  const allowed = {
    PLAINTEXT_TRANSPORT: new Set(["28000"]),
    WRONG_CA: new Set([
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_GET_ISSUER_CERT",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    ]),
    WRONG_DATABASE: new Set(["3D000", "42501"]),
    WRONG_HOSTNAME: new Set(["ERR_TLS_CERT_ALTNAME_INVALID"]),
    WRONG_ROLE: new Set(["28000", "28P01"]),
  }[scenario];
  return Object.freeze({
    connected: false,
    errorCode: allowed?.has(code) ? code : "UNCLASSIFIED",
    observedOutcome: allowed?.has(code)
      ? CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario]
      : "UNCLASSIFIED_REJECTION",
  });
}

function productionDependencies() {
  return Object.freeze({
    async attemptRejectedConnection({
      caCertificatePem,
      connectionString,
      connectTimeoutMs,
      scenario,
      serverName,
    }) {
      const parsed = new URL(connectionString);
      const plaintext = scenario === "PLAINTEXT_TRANSPORT";
      const client = new pg.Client({
        database: decodeURIComponent(parsed.pathname.slice(1)),
        host: parsed.hostname,
        password: decodeURIComponent(parsed.password),
        port: Number(parsed.port),
        ssl: plaintext
          ? false
          : {
              ca: caCertificatePem,
              rejectUnauthorized: true,
              servername: serverName,
            },
        user: decodeURIComponent(parsed.username),
        connectionTimeoutMillis: connectTimeoutMs,
        query_timeout: connectTimeoutMs,
        statement_timeout: connectTimeoutMs,
      });
      let connected = false;
      try {
        await client.connect();
        connected = true;
        return Object.freeze({
          connected: true,
          errorCode: "NONE",
          observedOutcome: "ALLOWED",
        });
      } catch (error) {
        return classifyConnectionError(scenario, error);
      } finally {
        if (connected) {
          try {
            await client.end();
          } catch {
            fail(
              "CURRENT187_CONNECTION_PROBE_RUNNER_DISCONNECT_FAILED",
              "A negative probe connection did not close cleanly.",
            );
          }
        }
      }
    },
    now: () => new Date().toISOString(),
  });
}

async function runInternal(inputValue, dependencyValue, syntheticOnly) {
  const input = normalizeInput(inputValue, syntheticOnly);
  const dependencies = normalizeDependencies(dependencyValue);
  const executedAt = canonicalIso(dependencies.now());
  const services = [];
  const evidenceDigests = new Set();
  for (const [serviceIndex, service] of input.services.entries()) {
    const negativeProbes = [];
    for (const connection of service.negativeConnections) {
      let resultValue;
      try {
        resultValue = await dependencies.attemptRejectedConnection(
          Object.freeze({
            caCertificatePem: connection.caCertificatePem,
            connectionString: connection.connectionString,
            connectTimeoutMs: input.connectTimeoutMs,
            purpose: service.purpose,
            scenario: connection.scenario,
            serverName: connection.serverName,
          }),
        );
      } catch {
        fail(
          "CURRENT187_CONNECTION_PROBE_RUNNER_ATTEMPT_FAILED",
          "A negative connection probe failed without classified evidence.",
        );
      }
      const result = current187AdmissionExactDataRecord(
        resultValue,
        ATTEMPT_RESULT_KEYS,
        "CURRENT187_CONNECTION_PROBE_RUNNER_RESULT_INVALID",
        "A negative probe result must be exact and data-only.",
      );
      const expectedOutcome =
        CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[connection.scenario];
      if (
        result.connected !== false ||
        result.observedOutcome !== expectedOutcome ||
        typeof result.errorCode !== "string" ||
        !result.errorCode ||
        result.errorCode === "UNCLASSIFIED"
      ) {
        fail(
          result.connected === true
            ? "CURRENT187_CONNECTION_PROBE_RUNNER_NEGATIVE_ALLOWED"
            : "CURRENT187_CONNECTION_PROBE_RUNNER_REJECTION_UNCLASSIFIED",
          "A negative network probe did not prove its exact rejected outcome.",
        );
      }
      const evidenceDigest = digest(NETWORK_EVIDENCE_DOMAIN, {
        challengeDigest: connection.challengeDigest,
        errorCodeDigest: digest(ERROR_CODE_DOMAIN, result.errorCode),
        observedOutcome: result.observedOutcome,
        purpose: service.purpose,
        scenario: connection.scenario,
      });
      evidenceDigests.add(evidenceDigest);
      negativeProbes.push(
        Object.freeze({
          evidenceDigest,
          observedOutcome: result.observedOutcome,
          scenario: connection.scenario,
        }),
      );
    }
    for (const scenario of CONTROL_SCENARIOS) {
      const observedOutcome =
        CURRENT187_CONNECTION_NEGATIVE_OUTCOME_BY_SCENARIO[scenario];
      let policyProjection;
      if (scenario === "STALE_HBA_RELOAD") {
        const staleCandidateDigest = digest(CONTROL_EVIDENCE_DOMAIN, {
          currentReloadEpochDigest: input.hbaReloadReceipt.reloadEpochDigest,
          hostControlChallengeDigest: input.hostControlChallengeDigest,
          purpose: service.purpose,
          state: "STALE_CANDIDATE",
        });
        if (staleCandidateDigest === input.hbaReloadReceipt.reloadEpochDigest) {
          fail(
            "CURRENT187_CONNECTION_PROBE_RUNNER_CONTROL_POLICY_INVALID",
            "A stale HBA candidate cannot equal the current reload epoch.",
          );
        }
        policyProjection = {
          currentControlDigest: input.hbaReloadReceipt.reloadEpochDigest,
          deniedCandidateDigest: staleCandidateDigest,
          rule: "EXACT_CURRENT_RELOAD_EPOCH_REQUIRED",
        };
      } else if (scenario === "WRONG_POOL_MODE") {
        const deniedPoolMode =
          service.poolMode === "TRANSACTION" ? "SESSION" : "TRANSACTION";
        if (deniedPoolMode === EXPECTED_POOL_MODE[service.purpose]) {
          fail(
            "CURRENT187_CONNECTION_PROBE_RUNNER_CONTROL_POLICY_INVALID",
            "A wrong pool-mode candidate unexpectedly matches policy.",
          );
        }
        policyProjection = {
          controlReceiptDigest: input.pgbouncerReceipt.pgbouncerReceiptDigest,
          deniedCandidateDigest: digest(CONTROL_EVIDENCE_DOMAIN, {
            deniedPoolMode,
            purpose: service.purpose,
          }),
          rule: "EXACT_SERVICE_POOL_MODE_REQUIRED",
        };
      } else {
        const collapsedFrom =
          input.services[(serviceIndex + 1) % input.services.length];
        if (
          collapsedFrom.postgresSessionReceipt.backendIdentityDigest ===
            service.postgresSessionReceipt.backendIdentityDigest ||
          collapsedFrom.poolerMappingDigest === service.poolerMappingDigest
        ) {
          fail(
            "CURRENT187_CONNECTION_PROBE_RUNNER_CONTROL_POLICY_INVALID",
            "A collapse candidate is not independently distinguishable.",
          );
        }
        policyProjection = {
          controlReceiptDigest: input.pgbouncerReceipt.pgbouncerReceiptDigest,
          deniedCandidateDigest: digest(CONTROL_EVIDENCE_DOMAIN, {
            collapsedBackendIdentityDigest:
              collapsedFrom.postgresSessionReceipt.backendIdentityDigest,
            collapsedPoolerMappingDigest: collapsedFrom.poolerMappingDigest,
            purpose: service.purpose,
          }),
          rule: "PAIRWISE_DISTINCT_SERVICE_IDENTITY_REQUIRED",
        };
      }
      const evidenceDigest = digest(CONTROL_EVIDENCE_DOMAIN, {
        observedOutcome,
        policyProjection,
        purpose: service.purpose,
        scenario,
      });
      evidenceDigests.add(evidenceDigest);
      negativeProbes.push(
        Object.freeze({ evidenceDigest, observedOutcome, scenario }),
      );
    }
    services.push(
      current187AdmissionDeepFreeze({
        allowedOperationsDigest: service.allowedOperationsDigest,
        applicationNameDigest:
          service.postgresSessionReceipt.applicationNameDigest,
        backendIdentityDigest:
          service.postgresSessionReceipt.backendIdentityDigest,
        endpointClass: service.endpointClass,
        endpointTlsPeerReceiptDigest:
          service.endpointTlsPeerReceipt.endpointTlsPeerReceiptDigest,
        hbaAuthMethod: service.hbaAuthMethod,
        hbaRuleDigest: service.hbaRuleDigest,
        negativeProbes,
        poolerMappingDigest: service.poolerMappingDigest,
        poolMode: service.poolMode,
        positiveOutcome: "ALLOWED",
        positiveProbeDigest: service.postgresSessionReceipt.positiveProbeDigest,
        postgresSessionReceiptDigest:
          service.postgresSessionReceipt.postgresSessionReceiptDigest,
        purpose: service.purpose,
        secretReferenceDigest:
          service.postgresSessionReceipt.secretReferenceDigest,
        tlsMode: service.tlsMode,
      }),
    );
  }
  if (evidenceDigests.size !== 32) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_EVIDENCE_REUSE",
      "All 32 negative probe evidence digests must be distinct.",
    );
  }
  const transcriptProjection = {
    clusterIdentityDigest: input.clusterIdentityDigest,
    databaseUniverseDigest: input.databaseUniverseDigest,
    environment: input.environment,
    executedAt,
    hbaControlReceiptDigest: input.hbaReloadReceipt.hbaReloadReceiptDigest,
    hostControlChallengeDigest: input.hostControlChallengeDigest,
    nonce: input.nonce,
    operationId: input.operationId,
    pgbouncerControlReceiptDigest:
      input.pgbouncerReceipt.pgbouncerReceiptDigest,
    probeRunnerArtifactDigest: input.probeRunnerArtifactDigest,
    releaseSha: input.releaseSha,
    services,
  };
  const publicReceipt = {
    actualNetworkNegativeProbeCount: 20,
    actualPositiveProbeCount: 4,
    authorization: false,
    canMutate: false,
    canSend: false,
    clusterIdentityDigest: input.clusterIdentityDigest,
    contract: CURRENT187_ADMISSION_CONTRACT,
    controlPolicyNegativeProbeCount: 12,
    databaseUniverseDigest: input.databaseUniverseDigest,
    environment: input.environment,
    executedAt,
    hbaControlReceiptDigest: input.hbaReloadReceipt.hbaReloadReceiptDigest,
    hostControlChallengeDigest: input.hostControlChallengeDigest,
    kind: CURRENT187_CONNECTION_PROBE_RUNNER_KIND,
    negativeProbeCount: 32,
    nonce: input.nonce,
    operationId: input.operationId,
    pgbouncerControlReceiptDigest:
      input.pgbouncerReceipt.pgbouncerReceiptDigest,
    positiveProbeCount: 4,
    probeRunnerArtifactDigest: input.probeRunnerArtifactDigest,
    probeTranscriptDigest: digest(TRANSCRIPT_DOMAIN, transcriptProjection),
    productionRootEnrolled: false,
    productionRuntimeAttested: false,
    profile: CURRENT187_CONNECTION_PROBE_RUNNER_PROFILE,
    releaseSha: input.releaseSha,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    services,
    sharedBetaAccess: false,
    slice: CURRENT187_CONNECTION_PROBE_RUNNER_SLICE,
    sourceNetworkIoPerformed: true,
    status: CURRENT187_CONNECTION_PROBE_RUNNER_STATUS,
    syntheticOnly,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    probeRunnerReceiptDigest: digest(RECEIPT_DOMAIN, publicReceipt),
  });
  VERIFIED_RECEIPTS.add(receipt);
  return receipt;
}

export async function runCurrent187ConnectionProbeMatrix(input) {
  if (arguments.length !== 1) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_ARGUMENTS_INVALID",
      "Production runner accepts exactly one input.",
    );
  }
  return runInternal(input, productionDependencies(), false);
}

function normalizeSyntheticContext(context) {
  const normalizedContext = current187AdmissionExactDataRecord(
    context,
    SYNTHETIC_CONTEXT_KEYS,
    "CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONTEXT_DENIED",
    "Synthetic runner context must be exact and data-only.",
  );
  if (
    normalizedContext.environment !== "ci" ||
    normalizedContext.nodeEnv !== "test" ||
    normalizedContext.explicitConfirmation !==
      CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONFIRMATION
  ) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_SYNTHETIC_CONTEXT_DENIED",
      "Synthetic capabilities are restricted to explicit CI tests.",
    );
  }
}

export async function runSyntheticCurrent187ConnectionProbeMatrixWithActualNetworkForTestOnly(
  input,
  context,
) {
  if (arguments.length !== 2) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_ARGUMENTS_INVALID",
      "Synthetic actual-network runner accepts input and context.",
    );
  }
  normalizeSyntheticContext(context);
  return runInternal(input, productionDependencies(), true);
}

export async function runSyntheticCurrent187ConnectionProbeMatrixWithDependenciesForTestOnly(
  input,
  dependencies,
  context,
) {
  if (arguments.length !== 3) {
    fail(
      "CURRENT187_CONNECTION_PROBE_RUNNER_ARGUMENTS_INVALID",
      "Synthetic runner accepts input, dependencies, and context.",
    );
  }
  normalizeSyntheticContext(context);
  return runInternal(input, dependencies, true);
}

export function isVerifiedCurrent187ConnectionProbeRunnerReceipt(value) {
  return (
    arguments.length === 1 &&
    !!value &&
    typeof value === "object" &&
    VERIFIED_RECEIPTS.has(value)
  );
}

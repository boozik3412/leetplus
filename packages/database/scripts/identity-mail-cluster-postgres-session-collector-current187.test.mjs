import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_POSTGRES_SESSION_OBSERVATION_SQL_FOR_TEST_ONLY,
  CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION,
  CURRENT187_POSTGRES_SESSION_STATUS,
  CURRENT187_POSTGRES_SESSION_SYNTHETIC_CONFIRMATION,
  collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly,
  collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly,
  isVerifiedCurrent187PostgresSessionReceipt,
} from "./identity-mail-cluster-postgres-session-collector-current187.mjs";

const NOW = "2026-08-11T00:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);
const DATABASE_NAME = "lp_current187_j1_ci";
const DATABASE_OID = "16384";
const ROLE_NAME = "lp_current187_j1_reader";
const ROLE_OID = "16385";
const APPLICATION_NAME = "leetplus.current187.j1.application";
const PASSWORD = "not-for-receipt-secret";

function input(overrides = {}, production = false) {
  const ssl = production
    ? "sslmode=verify-full&sslaccept=strict"
    : "sslmode=disable";
  return {
    applicationName: APPLICATION_NAME,
    clusterIdentityDigest: "1".repeat(64),
    databaseUniverseDigest: "2".repeat(64),
    databaseUrl: `postgresql://${ROLE_NAME}:${PASSWORD}@127.0.0.1:5432/${DATABASE_NAME}?application_name=${APPLICATION_NAME}&connection_limit=1&${ssl}`,
    environment: production ? "production" : "ci",
    expectedDatabaseName: DATABASE_NAME,
    expectedDatabaseOid: DATABASE_OID,
    expectedRoleName: ROLE_NAME,
    expectedRoleOid: ROLE_OID,
    explicitConfirmation: production
      ? CURRENT187_POSTGRES_SESSION_PRODUCTION_CONFIRMATION
      : CURRENT187_POSTGRES_SESSION_SYNTHETIC_CONFIRMATION,
    purpose: "APPLICATION",
    releaseSha: RELEASE_SHA,
    secretReferenceDigest: "3".repeat(64),
    statementTimeoutMs: 5_000,
    transactionTimeoutMs: 15_000,
    verificationChallengeDigest: "4".repeat(64),
    ...overrides,
  };
}

function observation(overrides = {}, production = false) {
  return {
    applicationName: APPLICATION_NAME,
    backendPid: "991",
    clientAddress: "127.0.0.1",
    clientPort: "50123",
    currentRoleBypassRls: false,
    currentRoleCanLogin: true,
    currentRoleConnectionLimit: 4,
    currentRoleCreateDatabase: false,
    currentRoleCreateRole: false,
    currentRoleInherit: false,
    currentRoleName: ROLE_NAME,
    currentRoleOid: ROLE_OID,
    currentRoleReplication: false,
    currentRoleSuperuser: false,
    databaseConnect: true,
    databaseCreate: false,
    databaseName: DATABASE_NAME,
    databaseOid: DATABASE_OID,
    databaseTemporary: false,
    incomingMembershipCount: "0",
    outgoingMembershipCount: "0",
    postmasterStartTime: "2026-08-10 20:00:00+00",
    recovery: false,
    roleSettingCount: "0",
    serverAddress: "127.0.0.1",
    serverPort: "5432",
    serverVersionNum: "160013",
    sessionRoleName: ROLE_NAME,
    sessionRoleOid: ROLE_OID,
    tlsBits: production ? "256" : null,
    tlsCipher: production ? "TLS_AES_256_GCM_SHA384" : null,
    tlsClientDn: null,
    tlsIssuerDn: null,
    tlsSerial: null,
    tlsVersion: production ? "TLSv1.3" : null,
    transactionReadOnly: true,
    transportTls: production,
    ...overrides,
  };
}

function positive(overrides = {}) {
  return {
    databaseName: DATABASE_NAME,
    sessionRoleName: ROLE_NAME,
    transactionReadOnly: true,
    value: "1",
    ...overrides,
  };
}

function dependencies({
  disconnectError = null,
  now = NOW,
  observationRows = [observation()],
  positiveRows = [positive()],
  queryError = null,
} = {}) {
  const calls = [];
  const dependency = {
    createClient(databaseUrl) {
      calls.push({ databaseUrl, kind: "createClient" });
      return {
        async disconnect() {
          calls.push({ kind: "disconnect" });
          if (disconnectError) throw disconnectError;
        },
        async transaction(callback, options) {
          calls.push({ kind: "transaction", options });
          return callback({
            async execute(statement) {
              calls.push({ kind: "execute", statement });
              if (queryError) throw queryError;
              return 0;
            },
            async query(statement, parameters) {
              calls.push({ kind: "query", parameters, statement });
              if (queryError) throw queryError;
              if (
                statement ===
                CURRENT187_POSTGRES_SESSION_OBSERVATION_SQL_FOR_TEST_ONLY
              ) {
                return observationRows;
              }
              if (/SELECT\s+'1'::TEXT/u.test(statement)) return positiveRows;
              return [];
            },
          });
        },
      };
    },
    now() {
      calls.push({ kind: "now" });
      return now;
    },
  };
  return { calls, dependency };
}

async function collectSynthetic(inputOverrides = {}, dependencyOptions = {}) {
  const fixture = dependencies(dependencyOptions);
  const receipt =
    await collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(inputOverrides),
      fixture.dependency,
    );
  return { ...fixture, receipt };
}

test("actual query path produces a branded secret-free deny-only backend session receipt", async () => {
  const { calls, receipt } = await collectSynthetic();
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
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.collectedAt, NOW);
  assert.equal(Object.isFrozen(receipt), true);
  for (const key of [
    "applicationNameDigest",
    "backendIdentityDigest",
    "endpointObservationDigest",
    "positiveProbeDigest",
    "postgresSessionReceiptDigest",
    "rolePolicyObservationDigest",
    "tlsObservationDigest",
  ]) {
    assert.match(receipt[key], /^[a-f0-9]{64}$/u);
  }
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, new RegExp(PASSWORD, "u"));
  assert.doesNotMatch(serialized, new RegExp(ROLE_NAME, "u"));
  assert.doesNotMatch(serialized, new RegExp(DATABASE_NAME, "u"));
  assert.doesNotMatch(serialized, /postgresql:\/\//u);
  assert.deepEqual(
    calls.map((call) => call.kind),
    [
      "createClient",
      "transaction",
      "execute",
      "query",
      "query",
      "query",
      "query",
      "query",
      "now",
      "disconnect",
    ],
  );
  assert.equal(calls[2].statement, "SET TRANSACTION READ ONLY");
  assert.deepEqual(calls[1].options, {
    isolationLevel: "Serializable",
    maxWait: 5_000,
    timeout: 15_000,
  });
});

test("production-mode observation requires verify-full strict TLS and safe negotiated transport", async () => {
  const good = dependencies({ observationRows: [observation({}, true)] });
  const receipt =
    await collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input({}, true),
      good.dependency,
    );
  assert.equal(receipt.syntheticOnly, false);
  assert.equal(receipt.transportTlsObserved, true);
  assert.equal(receipt.productionRuntimeAttested, false);

  for (const rowMutation of [
    { transportTls: false },
    { tlsVersion: "TLSv1.1" },
    { tlsCipher: "" },
    { tlsBits: "64" },
  ]) {
    const fixture = dependencies({
      observationRows: [observation(rowMutation, true)],
    });
    await assert.rejects(
      collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
        input({}, true),
        fixture.dependency,
      ),
      /collection failed closed/u,
    );
  }

  for (const databaseUrl of [
    input({}, true).databaseUrl.replace("verify-full", "require"),
    input({}, true).databaseUrl.replace(
      "sslaccept=strict",
      "sslaccept=accept_invalid_certs",
    ),
  ]) {
    await assert.rejects(
      collectCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
        input({ databaseUrl }, true),
        good.dependency,
      ),
      /verify-full strict TLS/u,
    );
  }
});

test("database, role, OID, application name, network, and read-only drift fail closed", async () => {
  for (const mutation of [
    { databaseName: "other_ci" },
    { databaseOid: "16386" },
    { sessionRoleName: "other_reader" },
    { sessionRoleOid: "16386" },
    { currentRoleName: "other_reader" },
    { currentRoleOid: "16386" },
    { applicationName: "other.application" },
    { databaseConnect: false },
    { transactionReadOnly: false },
    { serverAddress: null },
    { serverPort: null },
    { clientAddress: null },
    { clientPort: null },
    { backendPid: "0" },
    { serverVersionNum: "0" },
  ]) {
    const fixture = dependencies({ observationRows: [observation(mutation)] });
    await assert.rejects(
      collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
        input(),
        fixture.dependency,
      ),
      /collection failed closed/u,
    );
  }
});

test("role-policy drift changes only its scoped digest and the aggregate receipt", async () => {
  const first = await collectSynthetic();
  const changedDependencies = dependencies({
    observationRows: [observation({ databaseCreate: true })],
  });
  const second =
    await collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(),
      changedDependencies.dependency,
    );
  assert.notEqual(
    first.receipt.rolePolicyObservationDigest,
    second.rolePolicyObservationDigest,
  );
  assert.notEqual(
    first.receipt.postgresSessionReceiptDigest,
    second.postgresSessionReceiptDigest,
  );
  assert.equal(
    first.receipt.backendIdentityDigest,
    second.backendIdentityDigest,
  );
  assert.equal(
    first.receipt.endpointObservationDigest,
    second.endpointObservationDigest,
  );
});

test("positive probe, exact row count, and row shape fail closed", async () => {
  for (const options of [
    { observationRows: [] },
    { observationRows: [observation(), observation()] },
    { positiveRows: [positive({ value: "2" })] },
    { positiveRows: [] },
    { observationRows: [{ ...observation(), unexpected: true }] },
  ]) {
    const fixture = dependencies(options);
    await assert.rejects(
      collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
        input(),
        fixture.dependency,
      ),
      /collection failed closed/u,
    );
  }
});

test("URL policy rejects credentials or identity drift, duplicates, unknown parameters, and remote synthetic hosts", async () => {
  const base = input().databaseUrl;
  for (const databaseUrl of [
    base.replace(ROLE_NAME, "wrong_reader"),
    base.replace(PASSWORD, ""),
    base.replace(DATABASE_NAME, "other_ci"),
    `${base}&sslmode=disable`,
    `${base}&unknown=true`,
    base.replace("127.0.0.1", "db.example.com"),
    base.replace("sslmode=disable", "sslmode=require"),
    base.replace("connection_limit=1", "connection_limit=2"),
    "x".repeat(8_193),
  ]) {
    const fixture = dependencies();
    await assert.rejects(
      collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
        input({ databaseUrl }),
        fixture.dependency,
      ),
      /Database URL/u,
    );
    assert.equal(fixture.calls.length, 0);
  }

  const hostileUrl = {
    toString() {
      throw new Error("must not run");
    },
  };
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input({ databaseUrl: hostileUrl }),
      dependencies().dependency,
    ),
    /Database URL/u,
  );
});

test("query and disconnect failures are secret-free, always disconnect, and never return evidence", async () => {
  const queryFailure = dependencies({ queryError: new Error(PASSWORD) });
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(),
      queryFailure.dependency,
    ),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(PASSWORD, "u"));
      assert.equal(error.code, "CURRENT187_POSTGRES_SESSION_COLLECTION_FAILED");
      return true;
    },
  );
  assert.equal(queryFailure.calls.at(-1).kind, "disconnect");

  const disconnectFailure = dependencies({
    disconnectError: new Error(PASSWORD),
  });
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(),
      disconnectFailure.dependency,
    ),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(PASSWORD, "u"));
      assert.equal(error.code, "CURRENT187_POSTGRES_SESSION_DISCONNECT_FAILED");
      return true;
    },
  );
});

test("input, dependencies, client, transaction, and rows reject proxy/accessor/extra shapes without getters", async () => {
  const fixture = dependencies();
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      new Proxy(input(), {}),
      fixture.dependency,
    ),
    /exact input record/u,
  );
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(),
      new Proxy(fixture.dependency, {}),
    ),
    /dependencies must be an exact/u,
  );

  let getterCalls = 0;
  const hostile = observation();
  Object.defineProperty(hostile, "databaseName", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return DATABASE_NAME;
    },
  });
  const hostileFixture = dependencies({ observationRows: [hostile] });
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(),
      hostileFixture.dependency,
    ),
    /collection failed closed/u,
  );
  assert.equal(getterCalls, 0);
});

test("receipt brand rejects clones and wrong arity", async () => {
  const { receipt } = await collectSynthetic();
  assert.equal(
    isVerifiedCurrent187PostgresSessionReceipt({ ...receipt }),
    false,
  );
  assert.equal(
    isVerifiedCurrent187PostgresSessionReceipt(receipt, true),
    false,
  );
  await assert.rejects(
    collectSyntheticCurrent187PostgresSessionEvidenceWithDependenciesForTestOnly(
      input(),
    ),
    /accepts exact input and dependencies/u,
  );
});

test("source performs only bounded Prisma read-only session observation and keeps missing layers explicit", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-postgres-session-collector-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /from "@prisma\/client"/u);
  assert.match(source, /SET TRANSACTION READ ONLY/u);
  assert.match(source, /pg_catalog\.pg_stat_ssl/u);
  assert.match(source, /negativeProbePerformed:\s*false/u);
  assert.match(source, /endpointIdentityAttested:\s*false/u);
  assert.match(source, /hbaRuleMatched:\s*false/u);
  assert.match(source, /poolerIdentityObserved:\s*false/u);
  assert.match(source, /productionRuntimeAttested:\s*false/u);
  assert.doesNotMatch(
    source,
    /node:fs|node:net|node:tls|node:child_process|fetch\s*\(|nodemailer|smtp|providerPayload/u,
  );
});

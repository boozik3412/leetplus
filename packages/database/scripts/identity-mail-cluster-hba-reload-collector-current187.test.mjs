import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION,
  CURRENT187_HBA_RELOAD_STATUS,
  CURRENT187_HBA_RELOAD_SYNTHETIC_CONFIRMATION,
  collectCurrent187HbaReloadEvidenceWithDependenciesForTestOnly,
  collectSyntheticCurrent187HbaReloadEvidenceWithDependenciesForTestOnly,
  computeSyntheticCurrent187HbaCatalogDigestForTestOnly,
  isVerifiedCurrent187HbaReloadReceipt,
  isVerifiedCurrent187ProductionHbaReloadReceipt,
} from "./identity-mail-cluster-hba-reload-collector-current187.mjs";

const NOW = "2026-08-12T10:00:00.000Z";
const LOAD_TIME = "2026-08-12T09:59:00.000Z";
const POSTMASTER_START = "2026-08-12T09:00:00.000Z";
const RELEASE_SHA = "a".repeat(40);

function rules(overrides = {}) {
  const rows = [
    {
      address: null,
      authMethod: "peer",
      databases: ["all"],
      error: null,
      fileName: "/etc/postgresql/16/main/pg_hba.conf",
      lineNumber: "90",
      netmask: null,
      options: [],
      ruleNumber: "1",
      type: "local",
      users: ["all"],
    },
    {
      address: "127.0.0.1/32",
      authMethod: "scram-sha-256",
      databases: ["lp_current187_hba_ci"],
      error: null,
      fileName: "/etc/postgresql/16/main/pg_hba.conf",
      lineNumber: "91",
      netmask: "255.255.255.255",
      options: [],
      ruleNumber: "2",
      type: "hostssl",
      users: ["lp_current187_control_test"],
    },
  ];
  for (const [key, value] of Object.entries(overrides)) rows[1][key] = value;
  return rows;
}

function input(overrides = {}, production = false) {
  const database = production ? "leetplus" : "lp_current187_hba_ci";
  const role = production
    ? "lp_current187_control_prod"
    : "lp_current187_control_test";
  const applicationName = production
    ? "leetplus-current187-hba-production"
    : "leetplus-current187-hba-ci";
  const host = production ? "db.internal.example" : "127.0.0.1";
  const query = new URLSearchParams({
    application_name: applicationName,
    connection_limit: "1",
    sslaccept: production ? "strict" : "",
    sslmode: production ? "verify-full" : "disable",
  });
  if (!production) query.delete("sslaccept");
  return {
    applicationName,
    clusterIdentityDigest: "1".repeat(64),
    databaseUrl: `postgresql://${role}:test-only@${host}:5432/${database}?${query}`,
    databaseUniverseDigest: "2".repeat(64),
    environment: production ? "production" : "ci",
    expectedControlDatabaseName: database,
    expectedControlDatabaseOid: "16384",
    expectedControlRoleName: role,
    expectedControlRoleOid: "16385",
    expectedHbaCatalogDigest:
      computeSyntheticCurrent187HbaCatalogDigestForTestOnly(rules()),
    explicitConfirmation: production
      ? CURRENT187_HBA_RELOAD_PRODUCTION_CONFIRMATION
      : CURRENT187_HBA_RELOAD_SYNTHETIC_CONFIRMATION,
    releaseSha: RELEASE_SHA,
    reloadChallengeDigest: "3".repeat(64),
    reloadNotBefore: "2026-08-12T09:58:00.000Z",
    statementTimeoutMs: 5_000,
    transactionTimeoutMs: 15_000,
    ...overrides,
  };
}

function control(overrides = {}, production = false) {
  return {
    applicationName: production
      ? "leetplus-current187-hba-production"
      : "leetplus-current187-hba-ci",
    configurationLoadTime: LOAD_TIME,
    controlDatabaseName: production ? "leetplus" : "lp_current187_hba_ci",
    controlDatabaseOid: "16384",
    controlRoleName: production
      ? "lp_current187_control_prod"
      : "lp_current187_control_test",
    controlRoleOid: "16385",
    postmasterStartTime: POSTMASTER_START,
    transactionReadOnly: true,
    ...overrides,
  };
}

function dependencies({
  controlRow = control(),
  disconnectError = false,
  hbaRows = rules(),
  now = NOW,
} = {}) {
  const calls = [];
  return {
    calls,
    value: {
      createClient(databaseUrl) {
        calls.push(["create", databaseUrl]);
        return {
          async disconnect() {
            calls.push(["disconnect"]);
            if (disconnectError) throw new Error("secret disconnect detail");
          },
          async transaction(callback, options) {
            calls.push(["transaction", options]);
            return callback({
              async execute(statement) {
                calls.push(["execute", statement]);
                return 0;
              },
              async query(statement, parameters) {
                calls.push(["query", statement, parameters]);
                if (statement.includes("pg_hba_file_rules")) return hbaRows;
                if (statement.includes("pg_conf_load_time"))
                  return [controlRow];
                return [];
              },
            });
          },
        };
      },
      now() {
        return now;
      },
    },
  };
}

async function collect({
  inputOverrides = {},
  production = false,
  dependencyOverrides = {},
  hbaRows = rules(),
} = {}) {
  const deps = dependencies({
    controlRow: control({}, production),
    hbaRows,
    ...dependencyOverrides,
  });
  const source = input(inputOverrides, production);
  const receipt = production
    ? await collectCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
        source,
        deps.value,
      )
    : await collectSyntheticCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
        source,
        deps.value,
      );
  return { deps, receipt, source };
}

test("actual HBA catalog and reload epoch produce only a branded deny-only observation", async () => {
  const { deps, receipt, source } = await collect();
  assert.equal(receipt.status, CURRENT187_HBA_RELOAD_STATUS);
  assert.equal(receipt.hbaRulesObserved, true);
  assert.equal(receipt.hbaCurrentFilePolicySafeObserved, true);
  assert.equal(receipt.reloadClockFreshnessObserved, true);
  assert.equal(receipt.hbaBaselineDigestMatched, true);
  assert.equal(receipt.hbaCatalogEffectiveAttested, false);
  assert.equal(receipt.hbaCatalogLoadedAttested, false);
  assert.equal(receipt.reloadEpochAttested, false);
  assert.equal(receipt.sourceDatabaseIoPerformed, true);
  assert.equal(receipt.hbaRuleMatched, false);
  assert.equal(receipt.productionRootEnrolled, false);
  assert.equal(receipt.productionRuntimeAttested, false);
  assert.equal(receipt.negativeProbePerformed, false);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.hbaCatalogDigest, source.expectedHbaCatalogDigest);
  assert.equal(isVerifiedCurrent187HbaReloadReceipt(receipt), true);
  assert.equal(isVerifiedCurrent187HbaReloadReceipt({ ...receipt }), false);
  assert.equal(Object.isFrozen(receipt), true);
  assert.match(deps.calls.find((row) => row[0] === "execute")[1], /READ ONLY/u);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(
    serialized,
    /test-only|pg_hba\.conf|password|databaseUrl/iu,
  );
});

test("production-mode boundary requires verify-full strict transport and exact control identity", async () => {
  const productionRows = rules();
  productionRows[1].databases = ["leetplus"];
  productionRows[1].users = ["lp_current187_control_prod"];
  const { receipt } = await collect({
    dependencyOverrides: { controlRow: control({}, true) },
    hbaRows: productionRows,
    inputOverrides: {
      expectedHbaCatalogDigest:
        computeSyntheticCurrent187HbaCatalogDigestForTestOnly(productionRows),
    },
    production: true,
  });
  assert.equal(receipt.syntheticOnly, false);
  assert.equal(isVerifiedCurrent187ProductionHbaReloadReceipt(receipt), false);
  await assert.rejects(
    () =>
      collect({
        hbaRows: productionRows,
        inputOverrides: {
          databaseUrl:
            "postgresql://lp_current187_control_prod:x@db.internal.example:5432/leetplus?application_name=leetplus-current187-hba-production&connection_limit=1&sslmode=disable",
        },
        production: true,
      }),
    { code: "CURRENT187_HBA_RELOAD_DATABASE_URL_DENIED" },
  );
});

test("trust, plaintext, wildcard selectors, identity maps, and parse errors fail closed", async () => {
  for (const override of [
    { authMethod: "trust" },
    { type: "hostnossl" },
    { address: "0.0.0.0/0" },
    { users: ["all"] },
    { users: ["+application_roles"] },
    { users: ["/^lp_.*$/"] },
    { databases: ["all"] },
    { databases: ["sameuser"] },
    { options: ["map=collapsed_users"] },
    { error: "invalid connection type" },
  ]) {
    const unsafeRows = rules(override);
    await assert.rejects(
      () =>
        collect({
          hbaRows: unsafeRows,
          inputOverrides: {
            expectedHbaCatalogDigest:
              computeSyntheticCurrent187HbaCatalogDigestForTestOnly(rules()),
          },
        }),
      { code: "CURRENT187_HBA_RELOAD_COLLECTION_FAILED" },
    );
  }
});

test("catalog reordering, duplicate rows, and unsupported methods fail closed", async () => {
  const reordered = rules();
  reordered[1].ruleNumber = "3";
  await assert.rejects(
    () =>
      collect({
        hbaRows: reordered,
        inputOverrides: {
          expectedHbaCatalogDigest:
            computeSyntheticCurrent187HbaCatalogDigestForTestOnly(rules()),
        },
      }),
    { code: "CURRENT187_HBA_RELOAD_COLLECTION_FAILED" },
  );
  for (const authMethod of ["md5", "password", "ldap", "pam"]) {
    await assert.rejects(
      () =>
        collect({
          hbaRows: rules({ authMethod }),
          inputOverrides: {
            expectedHbaCatalogDigest:
              computeSyntheticCurrent187HbaCatalogDigestForTestOnly(rules()),
          },
        }),
      { code: "CURRENT187_HBA_RELOAD_COLLECTION_FAILED" },
    );
  }
});

test("stale reload, future reload, and control identity drift fail closed", async () => {
  for (const controlRow of [
    control({ configurationLoadTime: "2026-08-12T09:57:59.000Z" }),
    control({ configurationLoadTime: "2026-08-12T10:00:01.000Z" }),
    control({ controlRoleOid: "16386" }),
    control({ transactionReadOnly: false }),
  ]) {
    await assert.rejects(
      () => collect({ dependencyOverrides: { controlRow } }),
      { code: "CURRENT187_HBA_RELOAD_COLLECTION_FAILED" },
    );
  }
});

test("baseline drift and disconnect ambiguity fail closed without returning evidence", async () => {
  await assert.rejects(
    () =>
      collect({ inputOverrides: { expectedHbaCatalogDigest: "f".repeat(64) } }),
    { code: "CURRENT187_HBA_RELOAD_BASELINE_MISMATCH" },
  );
  await assert.rejects(
    () => collect({ dependencyOverrides: { disconnectError: true } }),
    { code: "CURRENT187_HBA_RELOAD_DISCONNECT_FAILED" },
  );
});

test("proxy, accessor, extra input, and cloned receipt boundaries fail closed", async () => {
  const deps = dependencies();
  const source = input();
  await assert.rejects(
    () =>
      collectSyntheticCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
        new Proxy(source, {}),
        deps.value,
      ),
    { code: "CURRENT187_HBA_RELOAD_INPUT_INVALID" },
  );
  await assert.rejects(
    () =>
      collectSyntheticCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
        { ...source, extra: true },
        deps.value,
      ),
    { code: "CURRENT187_HBA_RELOAD_INPUT_INVALID" },
  );
  let getterCalls = 0;
  const hostile = { ...source };
  Object.defineProperty(hostile, "releaseSha", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return RELEASE_SHA;
    },
  });
  await assert.rejects(
    () =>
      collectSyntheticCurrent187HbaReloadEvidenceWithDependenciesForTestOnly(
        hostile,
        deps.value,
      ),
    { code: "CURRENT187_HBA_RELOAD_INPUT_INVALID" },
  );
  assert.equal(getterCalls, 0);
});

test("source is bounded read-only PostgreSQL control-plane observation with no ambient authority", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-hba-reload-collector-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /pg_hba_file_rules/u);
  assert.match(source, /pg_conf_load_time/u);
  assert.match(source, /SET TRANSACTION READ ONLY/u);
  assert.match(
    source,
    /return collectInternal\(input, prismaDependencies\(\), false, true\)/u,
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
    /process\.env|node:child_process|node:fs|pg_reload_conf/u,
  );
  assert.doesNotMatch(
    source,
    /authorization:\s*true|canMutate:\s*true|canSend:\s*true/u,
  );
  assert.doesNotMatch(
    source,
    /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b/u,
  );
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTED,
  FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED,
  FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT,
  createFounderPilotActivationRoleNetworkAdapterForTestOnly,
  createFounderPilotActivationRoleNetworkPgAdapter,
  founderPilotActivationRoleNetworkInternals,
  runFounderPilotActivationRoleNetworkAcceptance,
} from "./founder-pilot-activation-role-network-acceptance.mjs";
import {
  FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
  founderPilotActivationRoleDeploymentInternals,
} from "./founder-pilot-activation-role-deployment.mjs";
import {
  FOUNDER_PILOT_ACTIVATION_ROLE,
  FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
  founderPilotRestoredCopyManifestDigest,
} from "./founder-pilot-restored-copy-preflight.mjs";

const OPERATION_ID = "12345678-1234-4123-8123-123456789abc";
const RELEASE_SHA = "a".repeat(40);
const MIGRATION_DIGEST = "b".repeat(64);
const EMPTY_MIGRATION_DIGEST = createHash("sha256")
  .update("", "utf8")
  .digest("hex");
const ROLE_CATALOG_DIGEST = "c".repeat(64);
const CA_SHA = "d".repeat(64);
const CERTIFICATE_SHA = "e".repeat(64);
const NOW = new Date("2026-08-18T00:00:00.000Z");

function manifest() {
  return {
    backup: {
      backupPath: path.join(os.tmpdir(), "founder-network-backup.dump"),
      backupSha256: "f".repeat(64),
      capturedAt: "2026-08-17T22:00:00.000Z",
    },
    contractVersion: FOUNDER_PILOT_RESTORED_COPY_PREFLIGHT_CONTRACT,
    isolation: {
      apiStarted: false,
      databaseOnly: true,
      langameEnabled: false,
      productionServiceTokensMounted: false,
      schedulersEnabled: false,
      smtpEnabled: false,
      telegramEnabled: false,
      workersStarted: false,
    },
    release: {
      artifactPath: path.join(os.tmpdir(), "founder-network-artifact.tgz"),
      artifactSha256: "1".repeat(64),
      releaseSha: RELEASE_SHA,
    },
    retention: {
      deleteBy: "2026-08-19T00:00:00.000Z",
      rpoSeconds: 7200,
      rtoSeconds: 3600,
    },
    target: {
      databaseName: "leetplus_restored_network_test",
      expectedSystemIdentifier: "7612345678901234567",
      host: "127.0.0.1",
      ownerRoleName: "postgres",
      port: 55439,
      sourceMigrationCount: 185,
      sourceMigrationManifestDigest: MIGRATION_DIGEST,
      sourceRolledBackMigrationCount: 0,
      sourceRolledBackMigrationManifestDigest: EMPTY_MIGRATION_DIGEST,
      sourceSchemaHead: "20260818020000_identity_mail_delivery_current_head_v1",
    },
  };
}

function roleReceipt(value = manifest()) {
  return founderPilotActivationRoleDeploymentInternals.receiptFromMarker({
    appliedAt: "2026-08-17T23:00:00.000Z",
    catalogDigest: ROLE_CATALOG_DIGEST,
    contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_DEPLOYMENT_CONTRACT,
    manifestDigest: founderPilotRestoredCopyManifestDigest(value),
    operationId: OPERATION_ID,
    planDigest: "2".repeat(64),
    preflightEvidenceDigest: "3".repeat(64),
    publicDatabaseTemporaryBefore: true,
    publicSchemaCreateBefore: false,
    releaseSha: RELEASE_SHA,
    roleOid: "24576",
    sourceMigrationManifestDigest: MIGRATION_DIGEST,
    targetIdentityDigest: "4".repeat(64),
    validUntil: value.retention.deleteBy,
    verifierDigest: "5".repeat(64),
  });
}

function hbaRows(targetDatabase = manifest().target.databaseName) {
  return [
    {
      address: "127.0.0.1",
      authMethod: "scram-sha-256",
      databases: [targetDatabase],
      error: null,
      lineNumber: 1,
      netmask: "255.255.255.255",
      options: null,
      type: "hostssl",
      users: [FOUNDER_PILOT_ACTIVATION_ROLE],
    },
    {
      address: "127.0.0.1",
      authMethod: "reject",
      databases: ["all"],
      error: null,
      lineNumber: 2,
      netmask: "255.255.255.255",
      options: null,
      type: "hostssl",
      users: [FOUNDER_PILOT_ACTIVATION_ROLE],
    },
    {
      address: "127.0.0.1",
      authMethod: "reject",
      databases: ["all"],
      error: null,
      lineNumber: 3,
      netmask: "255.255.255.255",
      options: null,
      type: "hostnossl",
      users: [FOUNDER_PILOT_ACTIVATION_ROLE],
    },
  ];
}

function runtimeProbe(value = manifest()) {
  return {
    certificateSha256: CERTIFICATE_SHA,
    cipherName: "TLS_AES_256_GCM_SHA384",
    currentDatabase: value.target.databaseName,
    currentUser: FOUNDER_PILOT_ACTIVATION_ROLE,
    directRelationReadRejected: true,
    effectiveDatabaseConnect: true,
    effectiveDatabaseCreate: false,
    effectiveDatabaseTemporary: false,
    effectiveRequiredFunctionExecute: true,
    effectiveSchemaCreate: false,
    effectiveSchemaUsage: true,
    serverAddress: value.target.host,
    serverPort: value.target.port,
    sessionUser: FOUNDER_PILOT_ACTIVATION_ROLE,
    tlsAuthorized: true,
    tlsProtocol: "TLSv1.3",
  };
}

function dependencies(overrides = {}) {
  const value = manifest();
  const receipt = roleReceipt(value);
  return {
    attestRole: async () => ({
      catalogDigest: ROLE_CATALOG_DIGEST,
      decision: "ACTIVATION_ROLE_ATTESTED",
      reasonCode: null,
      receiptDigest: receipt.receiptDigest,
    }),
    close: async () => undefined,
    inspectDeniedDatabase: async () => ({
      allowConnections: true,
      databaseCount: 1,
      isTemplate: false,
    }),
    inspectHba: async () => hbaRows(value.target.databaseName),
    probeDeniedDatabase: async () => ({ code: "28000", rejected: true }),
    probePlaintext: async () => ({ code: "28000", rejected: true }),
    probeRuntime: async () => runtimeProbe(value),
    probeWrongSecret: async () => ({ code: "28P01", rejected: true }),
    ...overrides,
  };
}

function options(adapter, overrides = {}) {
  const value = manifest();
  return {
    adapter,
    caCertificateSha256: CA_SHA,
    deniedDatabaseName: "postgres",
    manifest: value,
    now: () => new Date(NOW),
    operationId: OPERATION_ID,
    roleReceipt: roleReceipt(value),
    ...overrides,
  };
}

test("accepts exact role, HBA, TLS, SCRAM, negative probes, and least privilege", async () => {
  const result = await runFounderPilotActivationRoleNetworkAcceptance(
    options(
      createFounderPilotActivationRoleNetworkAdapterForTestOnly(dependencies()),
    ),
  );
  assert.equal(
    result.contractVersion,
    FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT,
  );
  assert.equal(result.decision, FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_ACCEPTED);
  assert.equal(result.reasonCode, null);
  assert.equal(result.evidence.roleCatalogDigest, ROLE_CATALOG_DIGEST);
  assert.equal(result.evidence.certificateSha256, CERTIFICATE_SHA);
  assert.match(result.evidence.hbaCatalogDigest, /^[0-9a-f]{64}$/u);
  assert.match(result.evidenceDigest, /^[0-9a-f]{64}$/u);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.evidence));
  assert.doesNotMatch(
    JSON.stringify(result),
    /password|secret|BEGIN CERTIFICATE|ALIENWARE/iu,
  );
});

test("rejects cloned adapters and role receipt binding drift", async () => {
  const adapter =
    createFounderPilotActivationRoleNetworkAdapterForTestOnly(dependencies());
  const cloned = await runFounderPilotActivationRoleNetworkAcceptance(
    options({ ...adapter }),
  );
  assert.equal(cloned.decision, FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED);
  assert.equal(cloned.reasonCode, "FOUNDER_PILOT_NETWORK_ARGUMENTS_INVALID");

  const value = options(adapter);
  value.roleReceipt = { ...value.roleReceipt, releaseSha: "9".repeat(40) };
  const drift = await runFounderPilotActivationRoleNetworkAcceptance(value);
  assert.equal(drift.decision, FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED);
  assert.equal(
    drift.reasonCode,
    "FOUNDER_PILOT_ACTIVATION_ROLE_RECEIPT_INVALID",
  );
});

test("rejects HBA trust, missing deny rules, errors, and unsafe precedence", async () => {
  const cases = [
    (rows) => {
      rows[0].authMethod = "trust";
    },
    (rows) => {
      rows.pop();
    },
    (rows) => {
      rows[0].error = "invalid record";
    },
    (rows) => {
      rows.unshift({
        ...rows[0],
        authMethod: "trust",
        databases: ["all"],
        lineNumber: 0,
        users: ["all"],
      });
      rows.forEach((row, index) => {
        row.lineNumber = index + 1;
      });
    },
  ];
  for (const mutate of cases) {
    const rows = hbaRows();
    mutate(rows);
    const result = await runFounderPilotActivationRoleNetworkAcceptance(
      options(
        createFounderPilotActivationRoleNetworkAdapterForTestOnly(
          dependencies({ inspectHba: async () => rows }),
        ),
      ),
    );
    assert.equal(
      result.decision,
      FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED,
    );
  }
});

test("rejects each failed network and least-privilege dimension", async () => {
  const cases = [
    {
      probeWrongSecret: async () => ({ code: "CONNECTED", rejected: false }),
    },
    {
      probeDeniedDatabase: async () => ({ code: "CONNECTED", rejected: false }),
    },
    {
      inspectDeniedDatabase: async () => ({
        allowConnections: false,
        databaseCount: 0,
        isTemplate: false,
      }),
    },
    { probePlaintext: async () => ({ code: "CONNECTED", rejected: false }) },
    {
      probeRuntime: async () => ({
        ...runtimeProbe(),
        directRelationReadRejected: false,
      }),
    },
    {
      probeRuntime: async () => ({
        ...runtimeProbe(),
        effectiveDatabaseTemporary: true,
      }),
    },
    {
      probeRuntime: async () => ({
        ...runtimeProbe(),
        tlsAuthorized: false,
      }),
    },
  ];
  for (const override of cases) {
    const result = await runFounderPilotActivationRoleNetworkAcceptance(
      options(
        createFounderPilotActivationRoleNetworkAdapterForTestOnly(
          dependencies(override),
        ),
      ),
    );
    assert.equal(
      result.decision,
      FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED,
    );
  }
});

test("requires identical role attestation before and after all probes", async () => {
  let invocation = 0;
  const receipt = roleReceipt();
  const adapter = createFounderPilotActivationRoleNetworkAdapterForTestOnly(
    dependencies({
      attestRole: async () => ({
        catalogDigest:
          invocation++ === 0 ? ROLE_CATALOG_DIGEST : "9".repeat(64),
        decision: "ACTIVATION_ROLE_ATTESTED",
        reasonCode: null,
        receiptDigest: receipt.receiptDigest,
      }),
    }),
  );
  const result = await runFounderPilotActivationRoleNetworkAcceptance(
    options(adapter),
  );
  assert.equal(result.decision, FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED);
  assert.equal(
    result.reasonCode,
    "FOUNDER_PILOT_NETWORK_ROLE_POST_ATTESTATION_FAILED",
  );
});

test("maps raw adapter failures to a stage code without error text", async () => {
  const result = await runFounderPilotActivationRoleNetworkAcceptance(
    options(
      createFounderPilotActivationRoleNetworkAdapterForTestOnly(
        dependencies({
          probeRuntime: async () => {
            throw new Error("postgresql://user:secret@internal/private-path");
          },
        }),
      ),
    ),
  );
  assert.deepEqual(result, {
    contractVersion: FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_CONTRACT,
    decision: FOUNDER_PILOT_ACTIVATION_ROLE_NETWORK_BLOCKED,
    reasonCode: "FOUNDER_PILOT_NETWORK_RUNTIME_PROBE_FAILED",
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|internal|private-path/u);
});

test("pins SQL to HBA catalog, own TLS session, exact wrapper, and direct relation denial", () => {
  const { HBA_SQL, RUNTIME_SQL, normalizeRuntimeDatabaseUrl } =
    founderPilotActivationRoleNetworkInternals;
  assert.match(HBA_SQL, /pg_hba_file_rules/u);
  assert.match(HBA_SQL, /ORDER BY line_number/u);
  assert.match(RUNTIME_SQL, /pg_stat_ssl/u);
  assert.match(RUNTIME_SQL, /pg_backend_pid/u);
  assert.match(RUNTIME_SQL, /to_regprocedure\(\$1\)/u);
  assert.match(
    createFounderPilotActivationRoleNetworkPgAdapter.toString(),
    /checkServerIdentity\(runtime\.host, certificate\)/u,
  );
  assert.doesNotMatch(
    createFounderPilotActivationRoleNetworkPgAdapter.toString(),
    /servername/u,
  );
  assert.throws(
    () =>
      normalizeRuntimeDatabaseUrl(
        `postgresql://${FOUNDER_PILOT_ACTIVATION_ROLE}:${"A".repeat(32)}@127.0.0.1:5432/leetplus_restored_network_test`,
        manifest().target,
      ),
    { reasonCode: "FOUNDER_PILOT_NETWORK_RUNTIME_DATABASE_URL_INVALID" },
  );
  assert.equal(
    createHash("sha256").update("network-static-proof").digest("hex").length,
    64,
  );
});

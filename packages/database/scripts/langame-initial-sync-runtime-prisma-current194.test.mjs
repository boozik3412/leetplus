import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION,
  createLangameInitialSyncRuntimePrismaCurrent194,
  createLangameInitialSyncRuntimePrismaCurrent194ForTestOnly,
  createSyntheticLangameInitialSyncRuntimePrismaCurrent194,
  isLangameInitialSyncRuntimePrismaCurrent194,
} from "./langame-initial-sync-runtime-prisma-current194.mjs";

const DATABASE = "leetplus_ci";
const OWNER = "leetplus_migration_owner";
const RUNTIME = "leetplus_langame_initial_sync_current192";
const OWNER_OID = 20_002;
const RUNTIME_OID = 20_001;
const DATABASE_OID = 16_384;
const config = Object.freeze({
  expectedDatabase: DATABASE,
  ownerDatabaseUrl:
    "postgresql://leetplus_migration_owner:owner-password-current194@127.0.0.1:5432/leetplus_ci?schema=public&connect_timeout=5&socket_timeout=30",
  ownerRoleName: OWNER,
  runtimeDatabaseUrl:
    "postgresql://leetplus_langame_initial_sync_current192:runtime-password-current194@127.0.0.1:5432/leetplus_ci?schema=public&connect_timeout=5&socket_timeout=30",
});
const registration = Object.freeze({
  attestationId: "attestation-current194",
  catalogReceiptDigest: "2".repeat(64),
  contract: "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1",
  current192MigrationSha256:
    "cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3",
  databaseName: DATABASE,
  databaseOid: DATABASE_OID,
  executorRoleName: RUNTIME,
  executorRoleOid: RUNTIME_OID,
  issuedAt: "2026-08-13T09:29:00.000Z",
  payloadDigest: "1".repeat(64),
  planDigest: "3".repeat(64),
  publicKeyFingerprint: "4".repeat(64),
  registerRequestDigest: "5".repeat(64),
  registerRequestId: "register-request-current194",
  releaseSha: "a".repeat(40),
  schemaOwnerRoleName: OWNER,
  schemaOwnerRoleOid: OWNER_OID,
  signingKeyId: "langame-current194-ci-1",
  validUntil: "2026-08-13T09:34:00.000Z",
});
const consumption = Object.freeze({
  attestationId: registration.attestationId,
  consumeRequestDigest: "6".repeat(64),
  consumeRequestId: "consume-request-current194",
  contract: "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1",
  expectedCatalogReceiptDigest: registration.catalogReceiptDigest,
  expectedPayloadDigest: registration.payloadDigest,
  expectedReleaseSha: registration.releaseSha,
});
const revocation = Object.freeze({
  attestationId: registration.attestationId,
  contract: "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1",
  expectedPayloadDigest: registration.payloadDigest,
  revocationReasonDigest: "a".repeat(64),
  revokeRequestDigest: "9".repeat(64),
  revokeRequestId: "revoke-request-current194",
});
const claim = Object.freeze({
  actorUserId: "actor-user-current194",
  approvalId: "approval-current194",
  claimRequestDigest: "7".repeat(64),
  claimRequestId: "claim-request-current194",
  claimToken: "claim-token-current194-abcdefghijklmnopqrstuvwxyz",
  executionId: "execution-current194",
  planDigest: registration.planDigest,
  tenantId: "tenant-current194",
});
const execution = Object.freeze({
  actorUserId: claim.actorUserId,
  canonicalPlan: '{"contract":"CURRENT191"}',
  claimToken: claim.claimToken,
  executionId: claim.executionId,
  executionRequestDigest: "8".repeat(64),
  executionRequestId: "execute-request-current194",
  tenantId: claim.tenantId,
});
const reconciliation = Object.freeze({
  claimToken: claim.claimToken,
  executionId: claim.executionId,
  planDigest: claim.planDigest,
  tenantId: claim.tenantId,
});

function sqlText(query) {
  assert.equal(typeof query.sql, "string");
  assert.ok(Array.isArray(query.values));
  return query.sql;
}

function client(role, roleOid, overrides = {}) {
  const observed = { disconnects: 0, queries: [] };
  const value = {
    async $disconnect() {
      observed.disconnects += 1;
      if (overrides.disconnect) return overrides.disconnect(observed);
    },
    async $queryRaw(query) {
      const text = sqlText(query);
      observed.queries.push({ query, text, values: [...query.values] });
      if (overrides.query) {
        const overridden = await overrides.query(query, observed);
        if (overridden !== undefined) return overridden;
      }
      if (text.includes("pg_catalog.current_database")) {
        return [
          {
            databaseName: DATABASE,
            databaseOid: BigInt(DATABASE_OID),
            currentUser: role,
            roleOid: BigInt(roleOid),
            sessionUser: role,
          },
        ];
      }
      if (text.includes("attestation_register_current194_v1")) {
        return [
          {
            attestationId: registration.attestationId,
            payloadDigest: registration.payloadDigest,
            replayed: false,
            status: "ACTIVE",
            validUntil: new Date(registration.validUntil),
          },
        ];
      }
      if (text.includes("attestation_consume_current194_v1")) {
        return [
          {
            attestationId: registration.attestationId,
            consumedAt: new Date("2026-08-13T09:30:00.000Z"),
            replayed: false,
            status: "CONSUMED",
            validUntil: new Date(registration.validUntil),
          },
        ];
      }
      if (text.includes("attestation_revoke_current194_v1")) {
        return [
          {
            attestationId: registration.attestationId,
            replayed: false,
            revokedAt: new Date("2026-08-13T09:31:00.000Z"),
            status: "REVOKED",
          },
        ];
      }
      return [{ ok: true }];
    },
  };
  return { observed, value };
}

function fixture(ownerOverrides, runtimeOverrides) {
  const owner = client(OWNER, OWNER_OID, ownerOverrides);
  const runtime = client(RUNTIME, RUNTIME_OID, runtimeOverrides);
  const pair = createLangameInitialSyncRuntimePrismaCurrent194ForTestOnly(
    config,
    owner.value,
    runtime.value,
    LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION,
  );
  return { owner, pair, runtime };
}

async function registerAndConsume(value) {
  await value.pair.ownerDriver.registerCurrent194(registration);
  await value.pair.runtimeDriver.consumeCurrent194(consumption);
}

test("CURRENT194 Prisma production construction remains fail-closed", () => {
  assert.throws(
    () => createLangameInitialSyncRuntimePrismaCurrent194(),
    (error) => error.code === "CURRENT194_PRISMA_PRODUCTION_DENIED",
  );
  assert.throws(
    () =>
      createSyntheticLangameInitialSyncRuntimePrismaCurrent194(
        config,
        "wrong-confirmation",
      ),
    (error) => error.code === "CURRENT194_PRISMA_SYNTHETIC_DENIED",
  );
});

test("CURRENT194 creates a branded separated pair and attests both sessions", async () => {
  const value = fixture();
  assert.equal(isLangameInitialSyncRuntimePrismaCurrent194(value.pair), true);
  assert.deepEqual(Reflect.ownKeys(value.pair).sort(), [
    "ownerDriver",
    "runtimeDriver",
  ]);
  await value.pair.ownerDriver.registerCurrent194(registration);
  assert.equal(value.owner.observed.queries.length, 2);
  assert.equal(value.runtime.observed.queries.length, 1);
  assert.match(
    value.owner.observed.queries[1].text,
    /langame_runtime_attestation_register_current194_v1/u,
  );
  assert.equal(
    value.owner.observed.queries[1].values.includes(registration.payloadDigest),
    true,
  );
  assert.equal(
    value.owner.observed.queries[1].text.includes(registration.payloadDigest),
    false,
  );
  await value.pair.runtimeDriver.close();
});

test("CURRENT194 consumes before allowing only the three fixed runtime RPCs", async () => {
  const value = fixture();
  await assert.rejects(
    value.pair.runtimeDriver.claimCurrent192(claim),
    (error) => error.code === "CURRENT194_PRISMA_RUNTIME_NOT_CONSUMED",
  );
  await registerAndConsume(value);
  await value.pair.runtimeDriver.claimCurrent192(claim);
  await value.pair.runtimeDriver.executeCurrent192(execution);
  await value.pair.runtimeDriver.reconcileCurrent192(reconciliation);
  const sql = value.runtime.observed.queries
    .map((item) => item.text)
    .join("\n");
  assert.match(sql, /langame_runtime_attestation_consume_current194_v1/u);
  assert.match(sql, /langame_initial_sync_claim_current192_v1/u);
  assert.match(sql, /langame_initial_sync_execute_current192_v1/u);
  assert.match(sql, /langame_initial_sync_reconcile_current192_v1/u);
  assert.equal(sql.includes(execution.canonicalPlan), false);
  await value.pair.runtimeDriver.close();
});

test("CURRENT194 exact registration and consumption can reconcile lost responses", async () => {
  let registerAttempt = 0;
  let consumeAttempt = 0;
  const value = fixture(
    {
      query(query) {
        if (sqlText(query).includes("attestation_register_current194_v1")) {
          registerAttempt += 1;
          if (registerAttempt === 1) throw new Error("lost register response");
        }
      },
    },
    {
      query(query) {
        if (sqlText(query).includes("attestation_consume_current194_v1")) {
          consumeAttempt += 1;
          if (consumeAttempt === 1) throw new Error("lost consume response");
        }
      },
    },
  );
  await assert.rejects(value.pair.ownerDriver.registerCurrent194(registration));
  await value.pair.ownerDriver.registerCurrent194(registration);
  await assert.rejects(value.pair.runtimeDriver.consumeCurrent194(consumption));
  await value.pair.runtimeDriver.consumeCurrent194(consumption);
  assert.equal(registerAttempt, 2);
  assert.equal(consumeAttempt, 2);
  await value.pair.runtimeDriver.close();
});

test("CURRENT194 owner revokes after consumption with exact lost-response replay", async () => {
  let revokeAttempt = 0;
  const value = fixture({
    query(query) {
      if (sqlText(query).includes("attestation_revoke_current194_v1")) {
        revokeAttempt += 1;
        if (revokeAttempt === 1) throw new Error("lost revoke response");
        return [
          {
            attestationId: registration.attestationId,
            replayed: true,
            revokedAt: new Date("2026-08-13T09:31:00.000Z"),
            status: "REVOKED",
          },
        ];
      }
    },
  });
  await registerAndConsume(value);
  await assert.rejects(value.pair.ownerDriver.revokeCurrent194(revocation));
  const rows = await value.pair.ownerDriver.revokeCurrent194(revocation);
  assert.equal(rows[0].replayed, true);
  assert.equal(revokeAttempt, 2);
  assert.equal(
    value.owner.observed.queries
      .at(-1)
      .values.includes(revocation.revocationReasonDigest),
    true,
  );
  await assert.rejects(
    value.pair.runtimeDriver.reconcileCurrent192(reconciliation),
    (error) => error.code === "CURRENT194_PRISMA_RUNTIME_NOT_CONSUMED",
  );
  await value.pair.runtimeDriver.close();
});

test("CURRENT194 rejects changed or premature owner revocation", async () => {
  const premature = fixture();
  await assert.rejects(
    premature.pair.ownerDriver.revokeCurrent194(revocation),
    (error) => error.code === "CURRENT194_PRISMA_REVOKE_STATE_INVALID",
  );
  await premature.pair.runtimeDriver.close();

  const changed = fixture();
  await registerAndConsume(changed);
  await assert.rejects(
    changed.pair.ownerDriver.revokeCurrent194({
      ...revocation,
      expectedPayloadDigest: "b".repeat(64),
    }),
    (error) => error.code === "CURRENT194_PRISMA_REVOKE_BINDING_INVALID",
  );
  assert.equal(
    changed.owner.observed.queries.some((item) =>
      item.text.includes("attestation_revoke_current194_v1"),
    ),
    false,
  );
  await changed.pair.runtimeDriver.close();
});

test("CURRENT194 rejects binding and backend identity drift before lifecycle RPCs", async () => {
  const ownerDrift = fixture({
    query(query) {
      if (sqlText(query).includes("pg_catalog.current_database")) {
        return [
          {
            databaseName: DATABASE,
            databaseOid: BigInt(DATABASE_OID),
            currentUser: "wrong_owner",
            roleOid: BigInt(OWNER_OID),
            sessionUser: "wrong_owner",
          },
        ];
      }
    },
  });
  await assert.rejects(
    ownerDrift.pair.ownerDriver.registerCurrent194(registration),
    (error) => error.code === "CURRENT194_PRISMA_SESSION_IDENTITY_INVALID",
  );
  assert.equal(
    ownerDrift.owner.observed.queries.some((item) =>
      item.text.includes("attestation_register_current194_v1"),
    ),
    false,
  );
  await ownerDrift.pair.runtimeDriver.close();

  const changed = fixture();
  await assert.rejects(
    changed.pair.ownerDriver.registerCurrent194({
      ...registration,
      databaseName: "other_ci",
    }),
    (error) => error.code === "CURRENT194_PRISMA_REGISTER_BINDING_INVALID",
  );
  assert.equal(changed.owner.observed.queries.length, 0);
  await changed.pair.runtimeDriver.close();
});

test("CURRENT194 validates loopback CI URLs and separates credentials", () => {
  for (const badConfig of [
    { ...config, expectedDatabase: "leetplus_prod" },
    {
      ...config,
      runtimeDatabaseUrl: config.runtimeDatabaseUrl.replace(
        "127.0.0.1",
        "db.example.test",
      ),
    },
    {
      ...config,
      runtimeDatabaseUrl: config.runtimeDatabaseUrl.replace(
        "runtime-password-current194",
        "owner-password-current194",
      ),
    },
    {
      ...config,
      ownerDatabaseUrl: `${config.ownerDatabaseUrl}&application_name=extra`,
    },
  ]) {
    const owner = client(OWNER, OWNER_OID);
    const runtime = client(RUNTIME, RUNTIME_OID);
    assert.throws(() =>
      createLangameInitialSyncRuntimePrismaCurrent194ForTestOnly(
        badConfig,
        owner.value,
        runtime.value,
        LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION,
      ),
    );
  }
});

test("CURRENT194 close disconnects both clients once and seals runtime", async () => {
  const value = fixture();
  await registerAndConsume(value);
  const first = value.pair.runtimeDriver.close();
  const second = value.pair.runtimeDriver.close();
  await Promise.all([first, second]);
  assert.equal(value.owner.observed.disconnects, 1);
  assert.equal(value.runtime.observed.disconnects, 1);
  await assert.rejects(
    value.pair.runtimeDriver.reconcileCurrent192(reconciliation),
    (error) => error.code === "CURRENT194_PRISMA_RUNTIME_NOT_CONSUMED",
  );
});

test("CURRENT194 Prisma source contains only fixed parameterized SQL templates", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "./langame-initial-sync-runtime-prisma-current194.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.match(
    source,
    /new PrismaClient\(\{ datasourceUrl: url, log: \[\] \}\)/u,
  );
  assert.equal((source.match(/\.\$queryRaw\(Prisma\.sql`/gu) ?? []).length, 7);
  assert.doesNotMatch(
    source,
    /\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe|process\.env|ConfigService|PrismaService|fetch\s*\(|child_process/iu,
  );
  assert.equal(
    LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONTRACT,
    "LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_V1",
  );
  assert.equal(
    LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
    "create-langame-current194-prisma-drivers-on-loopback-ci",
  );
});

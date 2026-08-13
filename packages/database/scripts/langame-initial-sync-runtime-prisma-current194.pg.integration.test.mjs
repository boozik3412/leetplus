import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import test from "node:test";
import pg from "pg";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
  langameInitialSyncRuntimeAttestationCurrent193PayloadDigest,
  langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint,
  verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION,
  isLangameInitialSyncRuntimeBootstrapCurrent194,
  openSyntheticLangameInitialSyncRuntimeBootstrapCurrent194,
} from "./langame-initial-sync-runtime-bootstrap-current194.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
  createSyntheticLangameInitialSyncRuntimePrismaCurrent194,
} from "./langame-initial-sync-runtime-prisma-current194.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONFIRMATION,
  recoverSyntheticLangameInitialSyncRuntimeShutdownCurrent195,
} from "./langame-initial-sync-runtime-shutdown-current195.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONFIRMATION,
  createSyntheticLangameRuntimeRevokeIntentPrismaCurrent195,
} from "./langame-runtime-revoke-intent-prisma-current195.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION,
  LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
  langameRuntimeRevokeIntentCurrent195PayloadDigest,
  langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint,
  verifySyntheticLangameRuntimeRevokeIntentCurrent195,
} from "./langame-runtime-revoke-intent-current195.mjs";

const { Client } = pg;
const SOURCE_DATABASE = "leetplus_ci";
const TARGET_DATABASE = "leetplus_current194_prisma_ci";
const OWNER_ROLE = "leetplus_current194_owner_ci";
const RUNTIME_ROLE = "leetplus_langame_initial_sync_current192";
const OWNER_PASSWORD = "owner-current194-password-ci";
const RUNTIME_PASSWORD = "runtime-current194-password-ci";
const ROTATED_OWNER_PASSWORD = "owner-current194-password-rotated-ci";
const ROTATED_RUNTIME_PASSWORD = "runtime-current194-password-rotated-ci";
const DATABASE_MARKER = "LEETPLUS_CURRENT194_PRISMA_CI_V1";
const OWNER_MARKER = "LEETPLUS_CURRENT194_OWNER_CI_V1";
const RUNTIME_MARKER = "LEETPLUS_CURRENT194_RUNTIME_CI_V1";
const CONFIRMATION =
  "run-langame-current194-actual-prisma-on-disposable-github-ci";

function admittedEnvironment() {
  assert.equal(process.env.CI, "true");
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.LANGAME_CURRENT194_PRISMA_INTEGRATION, CONFIRMATION);
  const raw = process.env.DATABASE_URL;
  assert.equal(typeof raw, "string");
  const parsed = new URL(raw);
  assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(
    decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
    SOURCE_DATABASE,
  );
  assert.equal(decodeURIComponent(parsed.username), "postgres");
  assert.equal(decodeURIComponent(parsed.password), "postgres");
  assert.match(process.env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/u);
  return parsed;
}

function connectionUrl(base, database, role, password) {
  const endpoint = base.port ? `${base.hostname}:${base.port}` : base.hostname;
  return `postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@${endpoint}/${database}?schema=public&connect_timeout=5&socket_timeout=30`;
}

function pgUrl(base, database) {
  const value = new URL(base.toString());
  value.pathname = `/${database}`;
  value.search = "";
  value.hash = "";
  return value.toString();
}

async function scalar(client, text, values = []) {
  const result = await client.query(text, values);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

function bootstrapInput(databaseOid, ownerOid, runtimeOid) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const publicKeyFingerprint =
    langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
      publicKeyPem,
    );
  const keyId = "langame-current194-prisma-bootstrap-ci";
  const clock = Date.now();
  const expected = {
    boundaryContract: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
    boundaryProfile: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
    catalogReceiptDigest: "b".repeat(64),
    current192MigrationSha256:
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
    databaseName: TARGET_DATABASE,
    databaseOid,
    executorRoleName: RUNTIME_ROLE,
    executorRoleOid: runtimeOid,
    planDigest: "c".repeat(64),
    releaseSha: process.env.GITHUB_SHA,
    schemaOwnerRoleName: OWNER_ROLE,
    schemaOwnerRoleOid: ownerOid,
  };
  const payload = {
    attestationId: "attestation-current194-bootstrap-ci",
    ...expected,
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    issuedAt: new Date(clock - 10_000).toISOString(),
    publicKeyFingerprint,
    purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
    signingKeyId: keyId,
    trustDomain:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    validUntil: new Date(clock + 180_000).toISOString(),
  };
  return {
    attestationEnvelope: {
      payload,
      payloadDigest:
        langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload),
      publicKeyFingerprint,
      signature: signPayload(
        null,
        Buffer.from(canonicalStringify(payload), "utf8"),
        privateKey,
      ).toString("base64url"),
      signatureAlgorithm:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
      signingKeyId: keyId,
    },
    expectedAttestation: expected,
    now: new Date(clock).toISOString(),
    providerRequest: {
      consumeRequestDigest: "d".repeat(64),
      consumeRequestId: "consume-request-current194-bootstrap-ci",
      registerRequestDigest: "e".repeat(64),
      registerRequestId: "register-request-current194-bootstrap-ci",
    },
    runtimeContext: {
      databaseName: TARGET_DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    runtimeRoots: {
      [keyId]: {
        algorithm:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
        keyId,
        notAfter: new Date(clock + 600_000).toISOString(),
        notBefore: new Date(clock - 60_000).toISOString(),
        publicKeyFingerprint,
        publicKeyPem,
        purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
        status: "ACTIVE",
        trustDomain:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
      },
    },
  };
}

function verifiedRevokeIntent(input) {
  const attestation =
    verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
      input.attestationEnvelope,
      input.expectedAttestation,
      input.runtimeRoots,
      input.runtimeContext,
      input.now,
    );
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const publicKeyFingerprint =
    langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint(publicKeyPem);
  const keyId = "langame-current195-prisma-revoke-ci";
  const nowMs = Date.parse(input.now);
  const payload = {
    attestationId: attestation.attestationId,
    attestationPublicKeyFingerprint: attestation.publicKeyFingerprint,
    attestationSigningKeyId: attestation.signingKeyId,
    contract: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
    current194Contract:
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT,
    databaseName: attestation.databaseName,
    databaseOid: attestation.databaseOid,
    expectedPayloadDigest: attestation.payloadDigest,
    intentId: "revoke-intent-current195-prisma-ci",
    issuedAt: new Date(nowMs - 5_000).toISOString(),
    ownerRoleName: attestation.schemaOwnerRoleName,
    ownerRoleOid: attestation.schemaOwnerRoleOid,
    publicKeyFingerprint,
    purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
    releaseSha: attestation.releaseSha,
    revocationReasonDigest: "1".repeat(64),
    revokeRequestDigest: "f".repeat(64),
    revokeRequestId: "revoke-request-current194-bootstrap-ci",
    signingKeyId: keyId,
    trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
    validUntil: new Date(nowMs + 120_000).toISOString(),
  };
  const envelope = {
    payload,
    payloadDigest: langameRuntimeRevokeIntentCurrent195PayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      privateKey,
    ).toString("base64url"),
    signatureAlgorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
    signingKeyId: keyId,
  };
  return verifySyntheticLangameRuntimeRevokeIntentCurrent195(
    envelope,
    attestation,
    {
      [keyId]: {
        algorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
        keyId,
        notAfter: new Date(nowMs + 600_000).toISOString(),
        notBefore: new Date(nowMs - 60_000).toISOString(),
        publicKeyFingerprint,
        publicKeyPem,
        purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
        status: "ACTIVE",
        trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
      },
    },
    {
      databaseName: TARGET_DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    input.now,
  );
}

test(
  "CURRENT194 actual separated Prisma lifecycle revokes on a disposable clone",
  { timeout: 120_000 },
  async () => {
    const base = admittedEnvironment();
    const maintenance = new Client({
      connectionString: pgUrl(base, "postgres"),
    });
    let databaseCreated = false;
    let ownerCreated = false;
    let runtimeCreated = false;
    let targetDatabaseOid = null;
    let ownerOid = null;
    let runtimeOid = null;
    let drivers = null;
    let session = null;
    await maintenance.connect();
    try {
      const preflight = await scalar(
        maintenance,
        `SELECT
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_database
           WHERE datname = $1) AS "databaseCount",
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
           WHERE rolname = $2) AS "ownerCount",
          (SELECT count(*)::INTEGER FROM pg_catalog.pg_roles
           WHERE rolname = $3) AS "runtimeCount"`,
        [TARGET_DATABASE, OWNER_ROLE, RUNTIME_ROLE],
      );
      assert.deepEqual(preflight, {
        databaseCount: 0,
        ownerCount: 0,
        runtimeCount: 0,
      });

      await maintenance.query(
        `CREATE ROLE ${OWNER_ROLE}
         LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOREPLICATION NOBYPASSRLS PASSWORD '${OWNER_PASSWORD}'`,
      );
      ownerCreated = true;
      await maintenance.query(
        `COMMENT ON ROLE ${OWNER_ROLE} IS '${OWNER_MARKER}'`,
      );
      ownerOid = Number(
        (
          await scalar(
            maintenance,
            "SELECT oid::BIGINT AS oid FROM pg_catalog.pg_roles WHERE rolname = $1",
            [OWNER_ROLE],
          )
        ).oid,
      );

      await maintenance.query(
        `CREATE ROLE ${RUNTIME_ROLE}
         LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
         NOREPLICATION NOBYPASSRLS PASSWORD '${RUNTIME_PASSWORD}'`,
      );
      runtimeCreated = true;
      await maintenance.query(
        `COMMENT ON ROLE ${RUNTIME_ROLE} IS '${RUNTIME_MARKER}'`,
      );
      runtimeOid = Number(
        (
          await scalar(
            maintenance,
            "SELECT oid::BIGINT AS oid FROM pg_catalog.pg_roles WHERE rolname = $1",
            [RUNTIME_ROLE],
          )
        ).oid,
      );

      await maintenance.query(
        `CREATE DATABASE ${TARGET_DATABASE} TEMPLATE ${SOURCE_DATABASE}`,
      );
      databaseCreated = true;
      await maintenance.query(
        `COMMENT ON DATABASE ${TARGET_DATABASE} IS '${DATABASE_MARKER}'`,
      );
      targetDatabaseOid = Number(
        (
          await scalar(
            maintenance,
            "SELECT oid::BIGINT AS oid FROM pg_catalog.pg_database WHERE datname = $1",
            [TARGET_DATABASE],
          )
        ).oid,
      );

      const targetAdmin = new Client({
        connectionString: pgUrl(base, TARGET_DATABASE),
      });
      await targetAdmin.connect();
      try {
        await targetAdmin.query(`
          REVOKE CREATE, TEMPORARY ON DATABASE ${TARGET_DATABASE} FROM PUBLIC;
          REVOKE ALL ON DATABASE ${TARGET_DATABASE} FROM ${RUNTIME_ROLE};
          GRANT CONNECT ON DATABASE ${TARGET_DATABASE} TO ${OWNER_ROLE};
          GRANT CONNECT ON DATABASE ${TARGET_DATABASE} TO ${RUNTIME_ROLE};
          ALTER SCHEMA public OWNER TO ${OWNER_ROLE};
          REVOKE ALL ON SCHEMA public FROM PUBLIC;
          GRANT ALL ON SCHEMA public TO ${OWNER_ROLE};
          GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE};
          GRANT ALL ON ALL TABLES IN SCHEMA public TO ${OWNER_ROLE};
          GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${OWNER_ROLE};
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${RUNTIME_ROLE};
          REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${RUNTIME_ROLE};
          REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
          REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${RUNTIME_ROLE};

          ALTER FUNCTION public.langame_initial_sync_claim_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_initial_sync_execute_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_initial_sync_reconcile_current192_v1(
            TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_attestation_register_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT,
            TEXT, BIGINT, TEXT, BIGINT, TEXT, TEXT,
            TIMESTAMP(3) WITH TIME ZONE, TIMESTAMP(3) WITH TIME ZONE
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_attestation_consume_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_attestation_revoke_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_revoke_intent_register_current195_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT,
            TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
            TIMESTAMP(3) WITH TIME ZONE, TIMESTAMP(3) WITH TIME ZONE
          ) OWNER TO ${OWNER_ROLE};
          ALTER FUNCTION public.langame_runtime_revoke_intent_apply_current195_v1(
            TEXT, TEXT
          ) OWNER TO ${OWNER_ROLE};

          GRANT EXECUTE ON FUNCTION public.langame_initial_sync_claim_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
          GRANT EXECUTE ON FUNCTION public.langame_initial_sync_execute_current192_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
          GRANT EXECUTE ON FUNCTION public.langame_initial_sync_reconcile_current192_v1(
            TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
          GRANT EXECUTE ON FUNCTION public.langame_runtime_attestation_consume_current194_v1(
            TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
          ) TO ${RUNTIME_ROLE};
        `);
        const revokeAcl = await scalar(
          targetAdmin,
          `SELECT
             has_function_privilege($1,
               'public.langame_runtime_attestation_revoke_current194_v1(text,text,text,text,text)',
               'EXECUTE') AS "runtimeCanRevoke",
             has_function_privilege($2,
               'public.langame_runtime_attestation_revoke_current194_v1(text,text,text,text,text)',
               'EXECUTE') AS "ownerCanRevoke"`,
          [RUNTIME_ROLE, OWNER_ROLE],
        );
        assert.deepEqual(revokeAcl, {
          ownerCanRevoke: true,
          runtimeCanRevoke: false,
        });
      } finally {
        await targetAdmin.end();
      }

      const prismaConfig = {
        expectedDatabase: TARGET_DATABASE,
        ownerDatabaseUrl: connectionUrl(
          base,
          TARGET_DATABASE,
          OWNER_ROLE,
          OWNER_PASSWORD,
        ),
        ownerRoleName: OWNER_ROLE,
        runtimeDatabaseUrl: connectionUrl(
          base,
          TARGET_DATABASE,
          RUNTIME_ROLE,
          RUNTIME_PASSWORD,
        ),
      };
      drivers = createSyntheticLangameInitialSyncRuntimePrismaCurrent194(
        prismaConfig,
        LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION,
      );
      const now = Date.now();
      const registration = {
        attestationId: "attestation-current194-prisma-ci",
        catalogReceiptDigest: "2".repeat(64),
        contract: "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1",
        current192MigrationSha256:
          "cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3",
        databaseName: TARGET_DATABASE,
        databaseOid: targetDatabaseOid,
        executorRoleName: RUNTIME_ROLE,
        executorRoleOid: runtimeOid,
        issuedAt: new Date(now - 30_000).toISOString(),
        payloadDigest: "1".repeat(64),
        planDigest: "3".repeat(64),
        publicKeyFingerprint: "4".repeat(64),
        registerRequestDigest: "5".repeat(64),
        registerRequestId: "register-request-current194-prisma-ci",
        releaseSha: "a".repeat(40),
        schemaOwnerRoleName: OWNER_ROLE,
        schemaOwnerRoleOid: ownerOid,
        signingKeyId: "langame-current194-prisma-ci",
        validUntil: new Date(now + 180_000).toISOString(),
      };
      const registered =
        await drivers.ownerDriver.registerCurrent194(registration);
      assert.equal(registered[0].status, "ACTIVE");
      const consumed = await drivers.runtimeDriver.consumeCurrent194({
        attestationId: registration.attestationId,
        consumeRequestDigest: "6".repeat(64),
        consumeRequestId: "consume-request-current194-prisma-ci",
        contract: registration.contract,
        expectedCatalogReceiptDigest: registration.catalogReceiptDigest,
        expectedPayloadDigest: registration.payloadDigest,
        expectedReleaseSha: registration.releaseSha,
      });
      assert.equal(consumed[0].status, "CONSUMED");

      await assert.rejects(
        drivers.runtimeDriver.reconcileCurrent192({
          claimToken: "claim-token-current194-abcdefghijklmnopqrstuvwxyz",
          executionId: "missing-execution-current194",
          planDigest: registration.planDigest,
          tenantId: "missing-tenant-current194",
        }),
      );

      const revoked = await drivers.ownerDriver.revokeCurrent194({
        attestationId: registration.attestationId,
        contract: registration.contract,
        expectedPayloadDigest: registration.payloadDigest,
        revocationReasonDigest: "8".repeat(64),
        revokeRequestDigest: "7".repeat(64),
        revokeRequestId: "revoke-request-current194-prisma-ci",
      });
      assert.equal(revoked[0].status, "REVOKED");
      await assert.rejects(
        drivers.runtimeDriver.reconcileCurrent192({
          claimToken: "claim-token-current194-abcdefghijklmnopqrstuvwxyz",
          executionId: "missing-execution-current194",
          planDigest: registration.planDigest,
          tenantId: "missing-tenant-current194",
        }),
        (error) => error.code === "CURRENT194_PRISMA_RUNTIME_NOT_CONSUMED",
      );

      await drivers.runtimeDriver.close();
      drivers = null;

      await maintenance.query(
        `ALTER ROLE ${OWNER_ROLE} PASSWORD '${ROTATED_OWNER_PASSWORD}'`,
      );
      await maintenance.query(
        `ALTER ROLE ${RUNTIME_ROLE} PASSWORD '${ROTATED_RUNTIME_PASSWORD}'`,
      );
      for (const staleUrl of [
        prismaConfig.ownerDatabaseUrl,
        prismaConfig.runtimeDatabaseUrl,
      ]) {
        const stale = new Client({ connectionString: staleUrl });
        await assert.rejects(stale.connect());
        await stale.end().catch(() => undefined);
      }
      const rotatedPrismaConfig = {
        ...prismaConfig,
        ownerDatabaseUrl: connectionUrl(
          base,
          TARGET_DATABASE,
          OWNER_ROLE,
          ROTATED_OWNER_PASSWORD,
        ),
        runtimeDatabaseUrl: connectionUrl(
          base,
          TARGET_DATABASE,
          RUNTIME_ROLE,
          ROTATED_RUNTIME_PASSWORD,
        ),
      };

      const signedBootstrapInput = bootstrapInput(
        targetDatabaseOid,
        ownerOid,
        runtimeOid,
      );
      session = await openSyntheticLangameInitialSyncRuntimeBootstrapCurrent194(
        signedBootstrapInput,
        rotatedPrismaConfig,
        LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION,
      );
      assert.equal(
        isLangameInitialSyncRuntimeBootstrapCurrent194(session),
        true,
      );
      assert.equal(session.snapshot().state, "ACTIVE");
      assert.equal(session.snapshot().authorization, false);
      await assert.rejects(
        session.reconcileCurrent192({
          claimToken: "claim-token-bootstrap-current194-abcdefghijklmnop",
          executionId: "missing-execution-bootstrap-current194",
          planDigest: "c".repeat(64),
          tenantId: "missing-tenant-bootstrap-current194",
        }),
      );
      const verifiedIntent = verifiedRevokeIntent(signedBootstrapInput);
      const firstIntentLedger =
        createSyntheticLangameRuntimeRevokeIntentPrismaCurrent195(
          {
            expectedDatabase: TARGET_DATABASE,
            ownerDatabaseUrl: rotatedPrismaConfig.ownerDatabaseUrl,
            ownerRoleName: OWNER_ROLE,
          },
          LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONFIRMATION,
        );
      const persistedIntent =
        await firstIntentLedger.registerCurrent195(verifiedIntent);
      assert.equal(persistedIntent.persistedStatus, "PENDING");
      const liveRuntimeBackend = new Client({
        connectionString: rotatedPrismaConfig.runtimeDatabaseUrl,
      });
      await liveRuntimeBackend.connect();
      try {
        const runtimeBackendCount = await scalar(
          maintenance,
          `SELECT count(*)::INTEGER AS count
           FROM pg_catalog.pg_stat_activity
           WHERE datname = $1 AND usesysid = $2 AND backend_type = 'client backend'`,
          [TARGET_DATABASE, runtimeOid],
        );
        assert.equal(runtimeBackendCount.count >= 1, true);
        await assert.rejects(
          firstIntentLedger.applyCurrent195(persistedIntent),
          (error) =>
            error instanceof Error &&
            /runtime session is not drained/iu.test(
              `${error.message} ${error.meta?.message ?? ""}`,
            ),
        );
      } finally {
        await liveRuntimeBackend.end();
      }
      await firstIntentLedger.close();
      await session.drain();
      assert.equal(session.snapshot().state, "CLOSED");
      assert.equal(session.snapshot().revokedAt, null);
      session = null;

      const restartedIntentLedger =
        createSyntheticLangameRuntimeRevokeIntentPrismaCurrent195(
          {
            expectedDatabase: TARGET_DATABASE,
            ownerDatabaseUrl: rotatedPrismaConfig.ownerDatabaseUrl,
            ownerRoleName: OWNER_ROLE,
          },
          LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONFIRMATION,
        );
      const shutdown =
        await recoverSyntheticLangameInitialSyncRuntimeShutdownCurrent195(
          verifiedIntent,
          restartedIntentLedger,
          LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_CONFIRMATION,
        );
      assert.deepEqual(shutdown, {
        appliedAt: shutdown.appliedAt,
        attestationId: "attestation-current194-bootstrap-ci",
        authorization: false,
        contract: "LANGAME_INITIAL_SYNC_RUNTIME_SHUTDOWN_CURRENT195_V1",
        intentId: "revoke-intent-current195-prisma-ci",
        persistedBeforeRestart: true,
        productionExecutionAllowed: false,
        replayed: false,
        status: "APPLIED",
      });
      assert.match(shutdown.appliedAt, /^\d{4}-\d{2}-\d{2}T/u);

      const verify = new Client({
        connectionString: pgUrl(base, TARGET_DATABASE),
      });
      await verify.connect();
      try {
        const ledger = await scalar(
          verify,
          `
          SELECT
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeAttestationV1"
             WHERE "status" = 'CONSUMED') AS "consumedCount",
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeAttestationV1"
             WHERE "status" = 'REVOKED') AS "revokedCount",
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeAttestationEventV1"
             WHERE "eventType" IN ('REGISTERED', 'CONSUMED', 'REVOKED')) AS "eventCount",
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeRevokeIntentV1"
             WHERE "status" = 'APPLIED') AS "appliedIntentCount",
            (SELECT count(*)::INTEGER
             FROM public."LangameRuntimeRevokeIntentEventV1"
             WHERE "eventType" IN ('REGISTERED', 'APPLIED')) AS "intentEventCount"
        `,
        );
        assert.deepEqual(ledger, {
          appliedIntentCount: 1,
          consumedCount: 0,
          eventCount: 6,
          intentEventCount: 2,
          revokedCount: 2,
        });
      } finally {
        await verify.end();
      }
    } finally {
      if (session) {
        await Promise.resolve()
          .then(() => session.drain())
          .catch(() => undefined);
      }
      if (drivers) {
        await drivers.runtimeDriver.close().catch(() => undefined);
      }
      if (databaseCreated) {
        const identity = await scalar(
          maintenance,
          `SELECT database_object.oid::BIGINT AS oid,
             pg_catalog.shobj_description(database_object.oid, 'pg_database') AS marker
           FROM pg_catalog.pg_database AS database_object
           WHERE database_object.datname = $1`,
          [TARGET_DATABASE],
        );
        assert.equal(Number(identity.oid), targetDatabaseOid);
        assert.equal(identity.marker, DATABASE_MARKER);
        await maintenance.query(
          "SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = $1 AND pid <> pg_catalog.pg_backend_pid()",
          [TARGET_DATABASE],
        );
        await maintenance.query(`DROP DATABASE ${TARGET_DATABASE}`);
      }
      for (const role of [
        runtimeCreated
          ? { marker: RUNTIME_MARKER, name: RUNTIME_ROLE, oid: runtimeOid }
          : null,
        ownerCreated
          ? { marker: OWNER_MARKER, name: OWNER_ROLE, oid: ownerOid }
          : null,
      ]) {
        if (!role) continue;
        const identity = await scalar(
          maintenance,
          `SELECT role_object.oid::BIGINT AS oid,
             pg_catalog.shobj_description(role_object.oid, 'pg_authid') AS marker
           FROM pg_catalog.pg_roles AS role_object WHERE role_object.rolname = $1`,
          [role.name],
        );
        assert.equal(Number(identity.oid), role.oid);
        assert.equal(identity.marker, role.marker);
        await maintenance.query(`DROP ROLE ${role.name}`);
      }
      await maintenance.end();
    }
  },
);

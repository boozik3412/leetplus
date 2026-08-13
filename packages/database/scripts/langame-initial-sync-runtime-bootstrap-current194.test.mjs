import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
  langameInitialSyncRuntimeAttestationCurrent193PayloadDigest,
  langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION,
  isLangameInitialSyncRuntimeBootstrapCurrent194,
  openLangameInitialSyncRuntimeBootstrapCurrent194,
  openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly,
  openSyntheticLangameInitialSyncRuntimeBootstrapCurrent194,
} from "./langame-initial-sync-runtime-bootstrap-current194.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION,
  createLangameInitialSyncRuntimePrismaCurrent194ForTestOnly,
} from "./langame-initial-sync-runtime-prisma-current194.mjs";
import { isLangameInitialSyncRuntimeProviderCurrent194 } from "./langame-initial-sync-runtime-provider-current194.mjs";
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = "2026-08-13T09:30:00.000Z";
const DATABASE = "leetplus_current194_bootstrap_ci";
const DATABASE_OID = 16_384;
const OWNER = "leetplus_current194_owner_ci";
const OWNER_OID = 20_002;
const RUNTIME = LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE;
const RUNTIME_OID = 20_001;
const KEY_ID = "langame-current194-bootstrap-ci";

function authority() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" });
  const publicKeyFingerprint =
    langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
      publicKeyPem,
    );
  return {
    privateKey,
    publicKeyFingerprint,
    roots: {
      [KEY_ID]: {
        algorithm:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
        keyId: KEY_ID,
        notAfter: "2026-08-14T00:00:00.000Z",
        notBefore: "2026-08-13T00:00:00.000Z",
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

function attestationFixture(overrides = {}) {
  const signer = authority();
  const expected = {
    boundaryContract: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
    boundaryProfile: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
    catalogReceiptDigest: "2".repeat(64),
    current192MigrationSha256:
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    executorRoleName: RUNTIME,
    executorRoleOid: RUNTIME_OID,
    planDigest: "3".repeat(64),
    releaseSha: "a".repeat(40),
    schemaOwnerRoleName: OWNER,
    schemaOwnerRoleOid: OWNER_OID,
  };
  const payload = {
    attestationId: "attestation-current194-bootstrap",
    ...expected,
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    issuedAt: "2026-08-13T09:29:00.000Z",
    publicKeyFingerprint: signer.publicKeyFingerprint,
    purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
    signingKeyId: KEY_ID,
    trustDomain:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    validUntil: "2026-08-13T09:34:00.000Z",
    ...overrides,
  };
  return {
    envelope: {
      payload,
      payloadDigest:
        langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload),
      publicKeyFingerprint: signer.publicKeyFingerprint,
      signature: signPayload(
        null,
        Buffer.from(canonicalStringify(payload), "utf8"),
        signer.privateKey,
      ).toString("base64url"),
      signatureAlgorithm:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
      signingKeyId: KEY_ID,
    },
    expected,
    signer,
  };
}

function sqlText(query) {
  assert.equal(typeof query.sql, "string");
  assert.ok(Array.isArray(query.values));
  return query.sql;
}

function client(role, roleOid, payloadDigest, overrides = {}) {
  const observed = { disconnects: 0, queries: [] };
  return {
    observed,
    value: {
      async $disconnect() {
        observed.disconnects += 1;
        if (overrides.disconnect) await overrides.disconnect();
      },
      async $queryRaw(query) {
        const text = sqlText(query);
        observed.queries.push(text);
        if (overrides.query) {
          const result = await overrides.query(text);
          if (result !== undefined) return result;
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
              attestationId: "attestation-current194-bootstrap",
              payloadDigest,
              replayed: false,
              status: "ACTIVE",
              validUntil: new Date("2026-08-13T09:34:00.000Z"),
            },
          ];
        }
        if (text.includes("attestation_consume_current194_v1")) {
          return [
            {
              attestationId: "attestation-current194-bootstrap",
              consumedAt: new Date(NOW),
              replayed: false,
              status: "CONSUMED",
              validUntil: new Date("2026-08-13T09:34:00.000Z"),
            },
          ];
        }
        if (text.includes("attestation_revoke_current194_v1")) {
          return [
            {
              attestationId: "attestation-current194-bootstrap",
              replayed: false,
              revokedAt: new Date("2026-08-13T09:31:00.000Z"),
              status: "REVOKED",
            },
          ];
        }
        return [{ status: "MISSING" }];
      },
    },
  };
}

function bootstrapFixture(options = {}) {
  const attestation = attestationFixture(options.payloadOverrides);
  const owner = client(
    OWNER,
    OWNER_OID,
    attestation.envelope.payloadDigest,
    options.ownerOverrides,
  );
  const runtime = client(
    RUNTIME,
    RUNTIME_OID,
    attestation.envelope.payloadDigest,
    options.runtimeOverrides,
  );
  const config = {
    expectedDatabase: DATABASE,
    ownerDatabaseUrl: `postgresql://${OWNER}:owner-password-current194@127.0.0.1:5432/${DATABASE}?schema=public&connect_timeout=5&socket_timeout=30`,
    ownerRoleName: OWNER,
    runtimeDatabaseUrl: `postgresql://${RUNTIME}:runtime-password-current194@127.0.0.1:5432/${DATABASE}?schema=public&connect_timeout=5&socket_timeout=30`,
  };
  const pair = createLangameInitialSyncRuntimePrismaCurrent194ForTestOnly(
    config,
    owner.value,
    runtime.value,
    LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION,
  );
  const input = {
    attestationEnvelope: attestation.envelope,
    expectedAttestation: attestation.expected,
    now: NOW,
    providerRequest: {
      consumeRequestDigest: "6".repeat(64),
      consumeRequestId: "consume-request-current194-bootstrap",
      registerRequestDigest: "5".repeat(64),
      registerRequestId: "register-request-current194-bootstrap",
    },
    runtimeContext: {
      databaseName: DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    runtimeRoots: attestation.signer.roots,
  };
  return { attestation, config, input, owner, pair, runtime };
}

test("CURRENT194 bootstrap production and unconfirmed synthetic entries deny", async () => {
  await assert.rejects(
    openLangameInitialSyncRuntimeBootstrapCurrent194(),
    (error) => error.code === "CURRENT194_BOOTSTRAP_PRODUCTION_DENIED",
  );
  await assert.rejects(
    openSyntheticLangameInitialSyncRuntimeBootstrapCurrent194(
      new Proxy(
        {},
        {
          get() {
            throw new Error("accessed");
          },
        },
      ),
      {},
      "wrong-confirmation",
    ),
    (error) => error.code === "CURRENT194_BOOTSTRAP_SYNTHETIC_DENIED",
  );
});

test("CURRENT194 bootstrap verifies, persists, consumes and exposes a drained provider", async () => {
  const value = bootstrapFixture();
  const session =
    await openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly(
      value.input,
      value.pair,
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION,
    );
  assert.equal(isLangameInitialSyncRuntimeBootstrapCurrent194(session), true);
  assert.equal(isLangameInitialSyncRuntimeProviderCurrent194(session), true);
  assert.deepEqual(session.snapshot(), {
    attestationId: "attestation-current194-bootstrap",
    authorization: false,
    consumeReplayed: false,
    consumedAt: NOW,
    contract: "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1",
    inFlight: 0,
    productionExecutionAllowed: false,
    revokeReplayed: null,
    revokedAt: null,
    state: "ACTIVE",
  });
  await session.reconcileCurrent192({
    claimToken: "claim-token-current194-abcdefghijklmnopqrstuvwxyz",
    executionId: "execution-current194-bootstrap",
    planDigest: "3".repeat(64),
    tenantId: "tenant-current194-bootstrap",
  });
  await session.revokeAndDrain({
    revocationReasonDigest: "8".repeat(64),
    revokeRequestDigest: "7".repeat(64),
    revokeRequestId: "revoke-request-current194-bootstrap",
  });
  assert.equal(session.snapshot().state, "CLOSED");
  assert.equal(session.snapshot().revokedAt, "2026-08-13T09:31:00.000Z");
  assert.equal(
    value.owner.observed.queries.some((text) =>
      text.includes("attestation_revoke_current194_v1"),
    ),
    true,
  );
  assert.equal(value.owner.observed.disconnects, 1);
  assert.equal(value.runtime.observed.disconnects, 1);
});

test("CURRENT194 bootstrap closes both clients after verification or request failure", async () => {
  const invalidInput = bootstrapFixture();
  await assert.rejects(
    openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly(
      { ...invalidInput.input, unexpected: true },
      invalidInput.pair,
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION,
    ),
    (error) => error.code === "CURRENT194_BOOTSTRAP_INPUT_INVALID",
  );
  assert.equal(invalidInput.owner.observed.disconnects, 1);
  assert.equal(invalidInput.runtime.observed.disconnects, 1);

  const invalidSignature = bootstrapFixture();
  invalidSignature.input.attestationEnvelope.signature = "A".repeat(86);
  await assert.rejects(
    openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly(
      invalidSignature.input,
      invalidSignature.pair,
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION,
    ),
  );
  assert.equal(invalidSignature.owner.observed.disconnects, 1);
  assert.equal(invalidSignature.runtime.observed.disconnects, 1);

  const invalidRequest = bootstrapFixture();
  invalidRequest.input.providerRequest = {
    ...invalidRequest.input.providerRequest,
    unexpected: true,
  };
  await assert.rejects(
    openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly(
      invalidRequest.input,
      invalidRequest.pair,
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION,
    ),
  );
  assert.equal(invalidRequest.owner.observed.disconnects, 1);
  assert.equal(invalidRequest.runtime.observed.disconnects, 1);
});

test("CURRENT194 bootstrap closes exact clients after ambiguous registration", async () => {
  let registerCalls = 0;
  const value = bootstrapFixture({
    ownerOverrides: {
      query(text) {
        if (text.includes("attestation_register_current194_v1")) {
          registerCalls += 1;
          throw new Error("lost response");
        }
      },
    },
  });
  await assert.rejects(
    openLangameInitialSyncRuntimeBootstrapCurrent194ForTestOnly(
      value.input,
      value.pair,
      LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_TEST_CONFIRMATION,
    ),
    (error) => error.code === "CURRENT194_PROVIDER_REGISTER_RESPONSE_AMBIGUOUS",
  );
  assert.equal(registerCalls, 2);
  assert.equal(value.owner.observed.disconnects, 1);
  assert.equal(value.runtime.observed.disconnects, 1);
});

test("CURRENT194 bootstrap source keeps production denied and exports no driver", () => {
  const source = readFileSync(
    fileURLToPath(
      new URL(
        "./langame-initial-sync-runtime-bootstrap-current194.mjs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.match(source, /CURRENT194_BOOTSTRAP_PRODUCTION_DENIED/u);
  assert.doesNotMatch(
    source,
    /process\.env|PrismaClient|\$queryRaw|queryRawUnsafe|executeRawUnsafe|fetch\s*\(|child_process/iu,
  );
  assert.equal(
    LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONTRACT,
    "LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_V1",
  );
  assert.equal(
    LANGAME_INITIAL_SYNC_RUNTIME_BOOTSTRAP_CURRENT194_CONFIRMATION,
    "open-langame-current194-bootstrap-on-loopback-ci",
  );
});

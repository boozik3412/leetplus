import assert from "node:assert/strict";
import { generateKeyPairSync, sign as signPayload } from "node:crypto";
import test from "node:test";

import {
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
  LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES,
  attestLangameInitialSyncRuntimeCurrent193,
  planLangameInitialSyncRuntimeCurrent193,
} from "./langame-initial-sync-runtime-boundary-current193.mjs";
import {
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
  LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
  langameInitialSyncRuntimeAttestationCurrent193PayloadDigest,
  langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint,
  projectLangameInitialSyncRuntimeAttestationCurrent193,
  verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193,
} from "./langame-initial-sync-runtime-attestation-current193.mjs";
import {
  LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONFIRMATION,
  LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_TEST_CONFIRMATION,
  createLangameRuntimeRevokeIntentPrismaCurrent195,
  createLangameRuntimeRevokeIntentPrismaCurrent195ForTestOnly,
  createSyntheticLangameRuntimeRevokeIntentPrismaCurrent195,
  isLangameRuntimeRevokeIntentPrismaCurrent195,
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
import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

const NOW = "2026-08-13T09:30:00.000Z";
const DATABASE = "leetplus_ci";
const DATABASE_OID = 16_384;
const OWNER = "leetplus_migration_owner";
const OWNER_OID = 20_002;
const RUNTIME_OID = 20_001;
const RELEASE_SHA = "a".repeat(40);
const config = Object.freeze({
  expectedDatabase: DATABASE,
  ownerDatabaseUrl:
    "postgresql://leetplus_migration_owner:owner-password-current195@127.0.0.1:5432/leetplus_ci?schema=public&connect_timeout=5&socket_timeout=30",
  ownerRoleName: OWNER,
});

function catalogReceipt() {
  const plan = planLangameInitialSyncRuntimeCurrent193({
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    environment: "ci",
    executorRoleName: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    executorRoleOid: RUNTIME_OID,
    releaseSha: RELEASE_SHA,
    schemaOwnerRoleName: OWNER,
    schemaOwnerRoleOid: OWNER_OID,
  });
  return attestLangameInitialSyncRuntimeCurrent193(plan, {
    databaseAcl: { connect: true, create: false, temporary: false },
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    currentUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    defaultPrivilegeCount: 0,
    directSequencePrivilegeCount: 0,
    directTablePrivilegeCount: 0,
    executorRole: {
      bypassRls: false,
      canCreateDatabase: false,
      canCreateRole: false,
      canLogin: true,
      inherit: false,
      name: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
      oid: RUNTIME_OID,
      replication: false,
      superuser: false,
    },
    functionOwnerRoleName: OWNER,
    functionOwnerRoleOid: OWNER_OID,
    membershipCount: 0,
    ownedObjectCount: 0,
    routines: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES.map(
      (routine) => ({
        executorCanExecute: routine.callable,
        identity: routine.identity,
        ownerRoleName: OWNER,
        ownerRoleOid: OWNER_OID,
        publicCanExecute: false,
        searchPath: routine.searchPath,
        securityDefiner: routine.securityDefiner,
      }),
    ),
    schemaAcl: { create: false, usage: true },
    sessionUser: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    unexpectedExecutableRoutineCount: 0,
  });
}

function attestation() {
  const receipt = catalogReceipt();
  const expected =
    projectLangameInitialSyncRuntimeAttestationCurrent193(receipt);
  const keyId = "langame-current193-prisma-195";
  const authority = generateKeyPairSync("ed25519");
  const publicKeyPem = authority.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const publicKeyFingerprint =
    langameInitialSyncRuntimeAttestationCurrent193PublicKeyFingerprint(
      publicKeyPem,
    );
  const payload = {
    attestationId: "attestation-current193-prisma-195",
    ...expected,
    contract: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_CONTRACT,
    issuedAt: "2026-08-13T09:29:00.000Z",
    publicKeyFingerprint,
    purpose: LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_PURPOSE,
    signingKeyId: keyId,
    trustDomain:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_TRUST_DOMAIN,
    validUntil: "2026-08-13T09:34:00.000Z",
  };
  const envelope = {
    payload,
    payloadDigest:
      langameInitialSyncRuntimeAttestationCurrent193PayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      authority.privateKey,
    ).toString("base64url"),
    signatureAlgorithm:
      LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
    signingKeyId: keyId,
  };
  return verifySyntheticLangameInitialSyncRuntimeAttestationCurrent193(
    envelope,
    expected,
    {
      [keyId]: {
        algorithm:
          LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_ALGORITHM,
        keyId,
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
    {
      databaseName: DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_INITIAL_SYNC_RUNTIME_ATTESTATION_CURRENT193_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    NOW,
  );
}

function intent() {
  const verifiedAttestation = attestation();
  const keyId = "langame-current195-prisma-ledger";
  const authority = generateKeyPairSync("ed25519");
  const publicKeyPem = authority.publicKey.export({
    format: "pem",
    type: "spki",
  });
  const publicKeyFingerprint =
    langameRuntimeRevokeIntentCurrent195PublicKeyFingerprint(publicKeyPem);
  const payload = {
    attestationId: verifiedAttestation.attestationId,
    attestationPublicKeyFingerprint: verifiedAttestation.publicKeyFingerprint,
    attestationSigningKeyId: verifiedAttestation.signingKeyId,
    contract: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CONTRACT,
    current194Contract:
      LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_CURRENT194_CONTRACT,
    databaseName: DATABASE,
    databaseOid: DATABASE_OID,
    expectedPayloadDigest: verifiedAttestation.payloadDigest,
    intentId: "revoke-intent-current195-prisma",
    issuedAt: "2026-08-13T09:29:30.000Z",
    ownerRoleName: OWNER,
    ownerRoleOid: OWNER_OID,
    publicKeyFingerprint,
    purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
    releaseSha: RELEASE_SHA,
    revocationReasonDigest: "8".repeat(64),
    revokeRequestDigest: "7".repeat(64),
    revokeRequestId: "revoke-request-current195-prisma",
    signingKeyId: keyId,
    trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
    validUntil: "2026-08-13T09:34:30.000Z",
  };
  const envelope = {
    payload,
    payloadDigest: langameRuntimeRevokeIntentCurrent195PayloadDigest(payload),
    publicKeyFingerprint,
    signature: signPayload(
      null,
      Buffer.from(canonicalStringify(payload), "utf8"),
      authority.privateKey,
    ).toString("base64url"),
    signatureAlgorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
    signingKeyId: keyId,
  };
  return verifySyntheticLangameRuntimeRevokeIntentCurrent195(
    envelope,
    verifiedAttestation,
    {
      [keyId]: {
        algorithm: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_ALGORITHM,
        keyId,
        notAfter: "2026-08-14T00:00:00.000Z",
        notBefore: "2026-08-13T00:00:00.000Z",
        publicKeyFingerprint,
        publicKeyPem,
        purpose: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_PURPOSE,
        status: "ACTIVE",
        trustDomain: LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_TRUST_DOMAIN,
      },
    },
    {
      databaseName: DATABASE,
      environment: "ci",
      explicitConfirmation:
        LANGAME_RUNTIME_REVOKE_INTENT_CURRENT195_SYNTHETIC_CONFIRMATION,
      hostname: "127.0.0.1",
    },
    NOW,
  );
}

function sqlText(query) {
  assert.equal(typeof query.sql, "string");
  assert.ok(Array.isArray(query.values));
  return query.sql;
}

function client(overrides = {}) {
  const observed = { disconnects: 0, queries: [] };
  const value = {
    async $disconnect() {
      observed.disconnects += 1;
    },
    async $queryRaw(query) {
      const text = sqlText(query);
      observed.queries.push({ text, values: [...query.values] });
      if (overrides.query) {
        const result = await overrides.query(query, observed);
        if (result !== undefined) return result;
      }
      if (text.includes("pg_catalog.current_database")) {
        return [
          {
            currentUser: OWNER,
            databaseName: DATABASE,
            databaseOid: BigInt(DATABASE_OID),
            roleOid: BigInt(OWNER_OID),
            sessionUser: OWNER,
          },
        ];
      }
      if (text.includes("revoke_intent_register_current195_v1")) {
        return [
          {
            intentId: "revoke-intent-current195-prisma",
            replayed: false,
            status: "PENDING",
            validUntil: new Date("2026-08-13T09:34:30.000Z"),
          },
        ];
      }
      if (text.includes("revoke_intent_apply_current195_v1")) {
        return [
          {
            appliedAt: new Date("2026-08-13T09:31:00.000Z"),
            attestationId: "attestation-current193-prisma-195",
            expiredAt: null,
            intentId: "revoke-intent-current195-prisma",
            replayed: false,
            status: "APPLIED",
          },
        ];
      }
      return [];
    },
  };
  return { observed, value };
}

function fixture(overrides) {
  const owner = client(overrides);
  const driver = createLangameRuntimeRevokeIntentPrismaCurrent195ForTestOnly(
    config,
    owner.value,
    LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_TEST_CONFIRMATION,
  );
  return { driver, owner };
}

test("CURRENT195 Prisma production and unconfirmed synthetic entries deny", () => {
  assert.throws(
    () => createLangameRuntimeRevokeIntentPrismaCurrent195(),
    (error) => error.code === "CURRENT195_PRISMA_PRODUCTION_DENIED",
  );
  assert.throws(
    () =>
      createSyntheticLangameRuntimeRevokeIntentPrismaCurrent195(
        config,
        "wrong-confirmation",
      ),
    (error) => error.code === "CURRENT195_PRISMA_SYNTHETIC_DENIED",
  );
});

test("CURRENT195 Prisma persists then atomically applies exact intent", async () => {
  const value = fixture();
  const verified = intent();
  assert.equal(
    isLangameRuntimeRevokeIntentPrismaCurrent195(value.driver),
    true,
  );
  const persisted = await value.driver.registerCurrent195(verified);
  assert.equal(persisted.persistedStatus, "PENDING");
  assert.equal(persisted.authorization, false);
  assert.equal(Object.isFrozen(persisted), true);
  const applied = await value.driver.applyCurrent195(persisted);
  assert.equal(applied.status, "APPLIED");
  assert.equal(applied.replayed, false);
  assert.equal(
    value.owner.observed.queries.some((entry) =>
      entry.values.includes(verified.signature),
    ),
    true,
  );
  await value.driver.close();
  assert.equal(value.owner.observed.disconnects, 1);
});

test("CURRENT195 Prisma reconciles lost register and apply responses", async () => {
  let registerAttempts = 0;
  let applyAttempts = 0;
  const value = fixture({
    query(query) {
      const text = sqlText(query);
      if (text.includes("revoke_intent_register_current195_v1")) {
        registerAttempts += 1;
        if (registerAttempts === 1) throw new Error("lost register response");
      }
      if (text.includes("revoke_intent_apply_current195_v1")) {
        applyAttempts += 1;
        if (applyAttempts === 1) throw new Error("lost apply response");
        return [
          {
            appliedAt: new Date("2026-08-13T09:31:00.000Z"),
            attestationId: "attestation-current193-prisma-195",
            expiredAt: null,
            intentId: "revoke-intent-current195-prisma",
            replayed: true,
            status: "APPLIED",
          },
        ];
      }
    },
  });
  const verified = intent();
  await assert.rejects(value.driver.registerCurrent195(verified));
  const persisted = await value.driver.registerCurrent195(verified);
  await assert.rejects(value.driver.applyCurrent195(persisted));
  const applied = await value.driver.applyCurrent195(persisted);
  assert.equal(applied.replayed, true);
  assert.equal(registerAttempts, 2);
  assert.equal(applyAttempts, 2);
  await value.driver.close();
});

test("CURRENT195 Prisma rejects cloned intent and persisted receipt", async () => {
  const clonedIntent = fixture();
  const verified = intent();
  await assert.rejects(
    clonedIntent.driver.registerCurrent195({ ...verified }),
    (error) => error.code === "CURRENT195_PRISMA_REGISTER_INTENT_INVALID",
  );
  assert.equal(clonedIntent.owner.observed.queries.length, 0);
  await clonedIntent.driver.close();

  const clonedReceipt = fixture();
  const persisted = await clonedReceipt.driver.registerCurrent195(verified);
  await assert.rejects(
    clonedReceipt.driver.applyCurrent195({ ...persisted }),
    (error) => error.code === "CURRENT195_PRISMA_APPLY_RECEIPT_INVALID",
  );
  assert.equal(
    clonedReceipt.owner.observed.queries.some((entry) =>
      entry.text.includes("revoke_intent_apply_current195_v1"),
    ),
    false,
  );
  await clonedReceipt.driver.close();
});

test("CURRENT195 Prisma fails before ledger RPC on owner identity drift", async () => {
  const value = fixture({
    query(query) {
      if (sqlText(query).includes("pg_catalog.current_database")) {
        return [
          {
            currentUser: "wrong_owner",
            databaseName: DATABASE,
            databaseOid: BigInt(DATABASE_OID),
            roleOid: BigInt(OWNER_OID),
            sessionUser: "wrong_owner",
          },
        ];
      }
    },
  });
  await assert.rejects(
    value.driver.registerCurrent195(intent()),
    (error) => error.code === "CURRENT195_PRISMA_SESSION_IDENTITY_INVALID",
  );
  assert.equal(value.owner.observed.queries.length, 1);
  await value.driver.close();
});

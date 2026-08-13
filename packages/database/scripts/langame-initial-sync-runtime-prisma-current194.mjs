import { Prisma, PrismaClient } from "@prisma/client";
import { types as utilTypes } from "node:util";

import { LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE } from "./langame-initial-sync-runtime-boundary-current193.mjs";

export const LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONTRACT =
  "LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION =
  "create-langame-current194-prisma-drivers-on-loopback-ci";
export const LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION =
  "inject-langame-current194-prisma-drivers-for-unit-test";

const CONFIG_KEYS = Object.freeze(
  [
    "expectedDatabase",
    "ownerDatabaseUrl",
    "ownerRoleName",
    "runtimeDatabaseUrl",
  ].sort(),
);
const CLIENT_KEYS = Object.freeze(["$disconnect", "$queryRaw"].sort());
const REGISTER_KEYS = Object.freeze(
  [
    "attestationId",
    "catalogReceiptDigest",
    "contract",
    "current192MigrationSha256",
    "databaseName",
    "databaseOid",
    "executorRoleName",
    "executorRoleOid",
    "issuedAt",
    "payloadDigest",
    "planDigest",
    "publicKeyFingerprint",
    "registerRequestDigest",
    "registerRequestId",
    "releaseSha",
    "schemaOwnerRoleName",
    "schemaOwnerRoleOid",
    "signingKeyId",
    "validUntil",
  ].sort(),
);
const CONSUME_KEYS = Object.freeze(
  [
    "attestationId",
    "consumeRequestDigest",
    "consumeRequestId",
    "contract",
    "expectedCatalogReceiptDigest",
    "expectedPayloadDigest",
    "expectedReleaseSha",
  ].sort(),
);
const REVOKE_KEYS = Object.freeze(
  [
    "attestationId",
    "contract",
    "expectedPayloadDigest",
    "revocationReasonDigest",
    "revokeRequestDigest",
    "revokeRequestId",
  ].sort(),
);
const CLAIM_KEYS = Object.freeze(
  [
    "actorUserId",
    "approvalId",
    "claimRequestDigest",
    "claimRequestId",
    "claimToken",
    "executionId",
    "planDigest",
    "tenantId",
  ].sort(),
);
const EXECUTE_KEYS = Object.freeze(
  [
    "actorUserId",
    "canonicalPlan",
    "claimToken",
    "executionId",
    "executionRequestDigest",
    "executionRequestId",
    "tenantId",
  ].sort(),
);
const RECONCILE_KEYS = Object.freeze(
  ["claimToken", "executionId", "planDigest", "tenantId"].sort(),
);
const SESSION_KEYS = Object.freeze(
  [
    "databaseName",
    "databaseOid",
    "currentUser",
    "roleOid",
    "sessionUser",
  ].sort(),
);
const ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const SIGNING_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);
const EXPECTED_SEARCH = "?schema=public&connect_timeout=5&socket_timeout=30";
const BRANDED_PAIRS = new WeakSet();

export class LangameInitialSyncRuntimePrismaCurrent194Error extends Error {
  constructor(code) {
    super("CURRENT194 Langame Prisma runtime rejected the operation.");
    this.name = "LangameInitialSyncRuntimePrismaCurrent194Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameInitialSyncRuntimePrismaCurrent194Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
  } catch {
    fail(code);
  }
  if (invalid) fail(code);
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(code);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(code);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return (
        !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true
      );
    })
  ) {
    fail(code);
  }
  const result = Object.create(null);
  for (const key of expectedKeys) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function exactClient(value) {
  const client = exactRecord(
    value,
    CLIENT_KEYS,
    "CURRENT194_PRISMA_CLIENT_INVALID",
  );
  if (
    typeof client.$queryRaw !== "function" ||
    typeof client.$disconnect !== "function"
  ) {
    fail("CURRENT194_PRISMA_CLIENT_INVALID");
  }
  return client;
}

function connection(value, expectedDatabase, expectedRole, code) {
  if (typeof value !== "string" || value.length > 4_096) fail(code);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(code);
  }
  let role;
  let password;
  let database;
  try {
    role = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    fail(code);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.hash ||
    parsed.search !== EXPECTED_SEARCH ||
    role !== expectedRole ||
    database !== expectedDatabase ||
    password.length < 16 ||
    value.includes("@localhost")
  ) {
    fail(code);
  }
  return Object.freeze({ database, password, role, value });
}

function configuration(value) {
  const config = exactRecord(
    value,
    CONFIG_KEYS,
    "CURRENT194_PRISMA_CONFIG_INVALID",
  );
  if (
    typeof config.expectedDatabase !== "string" ||
    !SAFE_DATABASE_PATTERN.test(config.expectedDatabase) ||
    !config.expectedDatabase.endsWith("_ci") ||
    typeof config.ownerRoleName !== "string" ||
    !SAFE_ROLE_PATTERN.test(config.ownerRoleName) ||
    config.ownerRoleName === LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE
  ) {
    fail("CURRENT194_PRISMA_CONFIG_INVALID");
  }
  const owner = connection(
    config.ownerDatabaseUrl,
    config.expectedDatabase,
    config.ownerRoleName,
    "CURRENT194_PRISMA_OWNER_URL_INVALID",
  );
  const runtime = connection(
    config.runtimeDatabaseUrl,
    config.expectedDatabase,
    LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE,
    "CURRENT194_PRISMA_RUNTIME_URL_INVALID",
  );
  if (
    owner.value === runtime.value ||
    owner.password === runtime.password ||
    owner.role === runtime.role
  ) {
    fail("CURRENT194_PRISMA_CREDENTIAL_SEPARATION_INVALID");
  }
  return Object.freeze({
    expectedDatabase: config.expectedDatabase,
    ownerRoleName: config.ownerRoleName,
    ownerUrl: owner.value,
    runtimeUrl: runtime.value,
  });
}

function defaultClient(url) {
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

function plainClient(client) {
  return Object.freeze({
    $disconnect: () => client.$disconnect(),
    $queryRaw: (query) => client.$queryRaw(query),
  });
}

function positiveOid(value) {
  return Number.isInteger(value) && value >= 1 && value <= 4_294_967_295;
}

function canonicalIso(value) {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function exactSingleRow(value, expectedKeys, code) {
  if (!Array.isArray(value) || value.length !== 1) fail(code);
  return exactRecord(value[0], expectedKeys, code);
}

function registration(value) {
  const input = exactRecord(
    value,
    REGISTER_KEYS,
    "CURRENT194_PRISMA_REGISTER_INPUT_INVALID",
  );
  if (
    input.contract !== "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1" ||
    !ID_PATTERN.test(input.attestationId) ||
    !ID_PATTERN.test(input.registerRequestId) ||
    !SHA256_PATTERN.test(input.registerRequestDigest) ||
    !SHA256_PATTERN.test(input.payloadDigest) ||
    !SHA256_PATTERN.test(input.catalogReceiptDigest) ||
    !SHA256_PATTERN.test(input.planDigest) ||
    !RELEASE_SHA_PATTERN.test(input.releaseSha) ||
    !SHA256_PATTERN.test(input.current192MigrationSha256) ||
    !SAFE_DATABASE_PATTERN.test(input.databaseName) ||
    !positiveOid(input.databaseOid) ||
    input.executorRoleName !== LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE ||
    !positiveOid(input.executorRoleOid) ||
    !SAFE_ROLE_PATTERN.test(input.schemaOwnerRoleName) ||
    !positiveOid(input.schemaOwnerRoleOid) ||
    typeof input.signingKeyId !== "string" ||
    !SIGNING_KEY_PATTERN.test(input.signingKeyId) ||
    !SHA256_PATTERN.test(input.publicKeyFingerprint) ||
    !canonicalIso(input.issuedAt) ||
    !canonicalIso(input.validUntil)
  ) {
    fail("CURRENT194_PRISMA_REGISTER_INPUT_INVALID");
  }
  return input;
}

function consumption(value) {
  const input = exactRecord(
    value,
    CONSUME_KEYS,
    "CURRENT194_PRISMA_CONSUME_INPUT_INVALID",
  );
  if (
    input.contract !== "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1" ||
    !ID_PATTERN.test(input.attestationId) ||
    !SHA256_PATTERN.test(input.expectedPayloadDigest) ||
    !SHA256_PATTERN.test(input.expectedCatalogReceiptDigest) ||
    !RELEASE_SHA_PATTERN.test(input.expectedReleaseSha) ||
    !ID_PATTERN.test(input.consumeRequestId) ||
    !SHA256_PATTERN.test(input.consumeRequestDigest)
  ) {
    fail("CURRENT194_PRISMA_CONSUME_INPUT_INVALID");
  }
  return input;
}

function revocation(value) {
  const input = exactRecord(
    value,
    REVOKE_KEYS,
    "CURRENT194_PRISMA_REVOKE_INPUT_INVALID",
  );
  if (
    input.contract !== "LANGAME_INITIAL_SYNC_RUNTIME_PROVIDER_CURRENT194_V1" ||
    !ID_PATTERN.test(input.attestationId) ||
    !SHA256_PATTERN.test(input.expectedPayloadDigest) ||
    !ID_PATTERN.test(input.revokeRequestId) ||
    !SHA256_PATTERN.test(input.revokeRequestDigest) ||
    !SHA256_PATTERN.test(input.revocationReasonDigest) ||
    input.revokeRequestDigest === input.revocationReasonDigest
  ) {
    fail("CURRENT194_PRISMA_REVOKE_INPUT_INVALID");
  }
  return input;
}

function current192Input(value, keys, code) {
  return exactRecord(value, keys, code);
}

function claimInput(value) {
  const input = current192Input(
    value,
    CLAIM_KEYS,
    "CURRENT194_PRISMA_CLAIM_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.executionId) ||
    !ID_PATTERN.test(input.tenantId) ||
    !ID_PATTERN.test(input.actorUserId) ||
    !ID_PATTERN.test(input.approvalId) ||
    !ID_PATTERN.test(input.claimRequestId) ||
    !SHA256_PATTERN.test(input.claimRequestDigest) ||
    !TOKEN_PATTERN.test(input.claimToken) ||
    !SHA256_PATTERN.test(input.planDigest)
  ) {
    fail("CURRENT194_PRISMA_CLAIM_INPUT_INVALID");
  }
  return input;
}

function executeInput(value) {
  const input = current192Input(
    value,
    EXECUTE_KEYS,
    "CURRENT194_PRISMA_EXECUTE_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.tenantId) ||
    !ID_PATTERN.test(input.actorUserId) ||
    !ID_PATTERN.test(input.executionId) ||
    !TOKEN_PATTERN.test(input.claimToken) ||
    !ID_PATTERN.test(input.executionRequestId) ||
    !SHA256_PATTERN.test(input.executionRequestDigest) ||
    typeof input.canonicalPlan !== "string" ||
    input.canonicalPlan.length < 2 ||
    input.canonicalPlan.length > 10_000_000
  ) {
    fail("CURRENT194_PRISMA_EXECUTE_INPUT_INVALID");
  }
  return input;
}

function reconcileInput(value) {
  const input = current192Input(
    value,
    RECONCILE_KEYS,
    "CURRENT194_PRISMA_RECONCILE_INPUT_INVALID",
  );
  if (
    !ID_PATTERN.test(input.tenantId) ||
    !ID_PATTERN.test(input.executionId) ||
    !TOKEN_PATTERN.test(input.claimToken) ||
    !SHA256_PATTERN.test(input.planDigest)
  ) {
    fail("CURRENT194_PRISMA_RECONCILE_INPUT_INVALID");
  }
  return input;
}

async function assertIdentity(
  client,
  expectedDatabase,
  expectedDatabaseOid,
  expectedRole,
  expectedRoleOid,
) {
  const rows = await client.$queryRaw(Prisma.sql`
    SELECT pg_catalog.current_database() AS "databaseName",
      database_object.oid::BIGINT AS "databaseOid",
      CURRENT_USER AS "currentUser", SESSION_USER AS "sessionUser",
      role_object.oid::BIGINT AS "roleOid"
    FROM pg_catalog.pg_database AS database_object
    INNER JOIN pg_catalog.pg_roles AS role_object
      ON role_object.rolname = CURRENT_USER
    WHERE database_object.datname = pg_catalog.current_database()
  `);
  const row = exactSingleRow(
    rows,
    SESSION_KEYS,
    "CURRENT194_PRISMA_SESSION_IDENTITY_INVALID",
  );
  if (
    row.databaseName !== expectedDatabase ||
    row.currentUser !== expectedRole ||
    row.sessionUser !== expectedRole ||
    typeof row.databaseOid !== "bigint" ||
    row.databaseOid !== BigInt(expectedDatabaseOid) ||
    typeof row.roleOid !== "bigint" ||
    row.roleOid !== BigInt(expectedRoleOid)
  ) {
    fail("CURRENT194_PRISMA_SESSION_IDENTITY_INVALID");
  }
  return row;
}

function createDrivers(config, ownerClientValue, runtimeClientValue) {
  const ownerClient = ownerClientValue;
  const runtimeClient = runtimeClientValue;
  let state = "NEW";
  let binding = null;
  let revokeBinding = null;
  let closePromise = null;

  const ownerDriver = Object.freeze({
    async registerCurrent194(value) {
      if (state !== "NEW" && state !== "REGISTERING") {
        fail("CURRENT194_PRISMA_REGISTER_STATE_INVALID");
      }
      const input = registration(value);
      if (
        input.databaseName !== config.expectedDatabase ||
        input.schemaOwnerRoleName !== config.ownerRoleName
      ) {
        fail("CURRENT194_PRISMA_REGISTER_BINDING_INVALID");
      }
      if (binding && canonicalBinding(binding) !== canonicalBinding(input)) {
        fail("CURRENT194_PRISMA_REGISTER_BINDING_INVALID");
      }
      state = "REGISTERING";
      binding = input;
      await assertIdentity(
        ownerClient,
        input.databaseName,
        input.databaseOid,
        input.schemaOwnerRoleName,
        input.schemaOwnerRoleOid,
      );
      await assertIdentity(
        runtimeClient,
        input.databaseName,
        input.databaseOid,
        input.executorRoleName,
        input.executorRoleOid,
      );
      const rows = await ownerClient.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_runtime_attestation_register_current194_v1(
          ${input.attestationId}, ${input.registerRequestId},
          ${input.registerRequestDigest}, ${input.payloadDigest},
          ${input.catalogReceiptDigest}, ${input.planDigest}, ${input.releaseSha},
          ${input.current192MigrationSha256}, ${input.databaseName},
          ${BigInt(input.databaseOid)}, ${input.executorRoleName},
          ${BigInt(input.executorRoleOid)}, ${input.schemaOwnerRoleName},
          ${BigInt(input.schemaOwnerRoleOid)}, ${input.signingKeyId},
          ${input.publicKeyFingerprint}, ${new Date(input.issuedAt)},
          ${new Date(input.validUntil)}
        )
      `);
      state = "REGISTERED";
      return rows;
    },
    async revokeCurrent194(value) {
      if (!binding || !["CONSUMED", "REVOKING"].includes(state)) {
        fail("CURRENT194_PRISMA_REVOKE_STATE_INVALID");
      }
      const input = revocation(value);
      if (
        input.attestationId !== binding.attestationId ||
        input.expectedPayloadDigest !== binding.payloadDigest
      ) {
        fail("CURRENT194_PRISMA_REVOKE_BINDING_INVALID");
      }
      if (
        revokeBinding &&
        canonicalRevocation(revokeBinding) !== canonicalRevocation(input)
      ) {
        fail("CURRENT194_PRISMA_REVOKE_BINDING_INVALID");
      }
      state = "REVOKING";
      revokeBinding = input;
      await assertIdentity(
        ownerClient,
        binding.databaseName,
        binding.databaseOid,
        binding.schemaOwnerRoleName,
        binding.schemaOwnerRoleOid,
      );
      const rows = await ownerClient.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_runtime_attestation_revoke_current194_v1(
          ${input.attestationId}, ${input.expectedPayloadDigest},
          ${input.revokeRequestId}, ${input.revokeRequestDigest},
          ${input.revocationReasonDigest}
        )
      `);
      if (
        Array.isArray(rows) &&
        rows.length === 1 &&
        rows[0] !== null &&
        typeof rows[0] === "object" &&
        rows[0].status === "REVOKED"
      ) {
        state = "REVOKED";
      }
      return rows;
    },
  });

  const runtimeDriver = Object.freeze({
    async claimCurrent192(value) {
      requireConsumed();
      const input = claimInput(value);
      return runtimeClient.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_initial_sync_claim_current192_v1(
          ${input.executionId}, ${input.tenantId}, ${input.actorUserId},
          ${input.approvalId}, ${input.claimRequestId},
          ${input.claimRequestDigest}, ${input.claimToken}, ${input.planDigest}
        )
      `);
    },
    async close() {
      if (closePromise) return closePromise;
      state = "CLOSING";
      binding = null;
      revokeBinding = null;
      closePromise = Promise.allSettled([
        Promise.resolve().then(() => ownerClient.$disconnect()),
        Promise.resolve().then(() => runtimeClient.$disconnect()),
      ]).then((results) => {
        state = "CLOSED";
        if (results.some((result) => result.status === "rejected")) {
          fail("CURRENT194_PRISMA_DISCONNECT_FAILED");
        }
      });
      return closePromise;
    },
    async consumeCurrent194(value) {
      if (!binding || !["REGISTERED", "CONSUMING"].includes(state)) {
        fail("CURRENT194_PRISMA_CONSUME_STATE_INVALID");
      }
      const input = consumption(value);
      if (
        input.attestationId !== binding.attestationId ||
        input.expectedPayloadDigest !== binding.payloadDigest ||
        input.expectedCatalogReceiptDigest !== binding.catalogReceiptDigest ||
        input.expectedReleaseSha !== binding.releaseSha
      ) {
        fail("CURRENT194_PRISMA_CONSUME_BINDING_INVALID");
      }
      state = "CONSUMING";
      await assertIdentity(
        runtimeClient,
        binding.databaseName,
        binding.databaseOid,
        binding.executorRoleName,
        binding.executorRoleOid,
      );
      const rows = await runtimeClient.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_runtime_attestation_consume_current194_v1(
          ${input.attestationId}, ${input.expectedPayloadDigest},
          ${input.expectedCatalogReceiptDigest}, ${input.expectedReleaseSha},
          ${input.consumeRequestId}, ${input.consumeRequestDigest}
        )
      `);
      if (
        Array.isArray(rows) &&
        rows.length === 1 &&
        rows[0] !== null &&
        typeof rows[0] === "object" &&
        rows[0].status === "CONSUMED"
      ) {
        state = "CONSUMED";
      }
      return rows;
    },
    async executeCurrent192(value) {
      requireConsumed();
      const input = executeInput(value);
      return runtimeClient.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_initial_sync_execute_current192_v1(
          ${input.tenantId}, ${input.actorUserId}, ${input.executionId},
          ${input.claimToken}, ${input.executionRequestId},
          ${input.executionRequestDigest}, ${input.canonicalPlan}
        )
      `);
    },
    async reconcileCurrent192(value) {
      requireConsumed();
      const input = reconcileInput(value);
      return runtimeClient.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_initial_sync_reconcile_current192_v1(
          ${input.tenantId}, ${input.executionId}, ${input.claimToken},
          ${input.planDigest}
        )
      `);
    },
  });

  function requireConsumed() {
    if (state !== "CONSUMED") fail("CURRENT194_PRISMA_RUNTIME_NOT_CONSUMED");
  }

  const pair = Object.freeze({ ownerDriver, runtimeDriver });
  BRANDED_PAIRS.add(pair);
  return pair;
}

function canonicalBinding(value) {
  return REGISTER_KEYS.map((key) => `${key}:${String(value[key])}`).join("\n");
}

function canonicalRevocation(value) {
  return REVOKE_KEYS.map((key) => `${key}:${String(value[key])}`).join("\n");
}

export function createLangameInitialSyncRuntimePrismaCurrent194() {
  fail("CURRENT194_PRISMA_PRODUCTION_DENIED");
}

export function createSyntheticLangameInitialSyncRuntimePrismaCurrent194(
  configValue,
  explicitConfirmation,
) {
  if (
    arguments.length !== 2 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_CONFIRMATION
  ) {
    fail("CURRENT194_PRISMA_SYNTHETIC_DENIED");
  }
  const config = configuration(configValue);
  return createDrivers(
    config,
    plainClient(defaultClient(config.ownerUrl)),
    plainClient(defaultClient(config.runtimeUrl)),
  );
}

export function createLangameInitialSyncRuntimePrismaCurrent194ForTestOnly(
  configValue,
  ownerClientValue,
  runtimeClientValue,
  explicitConfirmation,
) {
  if (
    arguments.length !== 4 ||
    explicitConfirmation !==
      LANGAME_INITIAL_SYNC_RUNTIME_PRISMA_CURRENT194_TEST_CONFIRMATION
  ) {
    fail("CURRENT194_PRISMA_TEST_INJECTION_DENIED");
  }
  return createDrivers(
    configuration(configValue),
    exactClient(ownerClientValue),
    exactClient(runtimeClientValue),
  );
}

export function isLangameInitialSyncRuntimePrismaCurrent194(value) {
  return (
    value !== null && typeof value === "object" && BRANDED_PAIRS.has(value)
  );
}

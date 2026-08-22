import { Prisma, PrismaClient } from "@prisma/client";
import { types as utilTypes } from "node:util";

import { isVerifiedLangameRuntimeRevokeIntentCurrent195 } from "./langame-runtime-revoke-intent-current195.mjs";

export const LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONTRACT =
  "LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_V1";
export const LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONFIRMATION =
  "create-langame-current195-owner-intent-ledger-on-loopback-ci";
export const LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_TEST_CONFIRMATION =
  "inject-langame-current195-owner-intent-ledger-for-unit-test";

const CONFIG_KEYS = Object.freeze(
  ["expectedDatabase", "ownerDatabaseUrl", "ownerRoleName"].sort(),
);
const CLIENT_KEYS = Object.freeze(["$disconnect", "$queryRaw"].sort());
const REGISTER_ROW_KEYS = Object.freeze(
  ["intentId", "replayed", "status", "validUntil"].sort(),
);
const APPLY_ROW_KEYS = Object.freeze(
  [
    "appliedAt",
    "attestationId",
    "expiredAt",
    "intentId",
    "replayed",
    "status",
  ].sort(),
);
const SESSION_KEYS = Object.freeze(
  [
    "currentUser",
    "databaseName",
    "databaseOid",
    "roleOid",
    "sessionUser",
  ].sort(),
);
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);
const EXPECTED_SEARCH = "?schema=public&connect_timeout=5&socket_timeout=30";
const BRANDED_DRIVERS = new WeakSet();
const PERSISTED_RECEIPTS = new WeakMap();

export class LangameRuntimeRevokeIntentPrismaCurrent195Error extends Error {
  constructor(code) {
    super(
      "CURRENT195 Langame revoke-intent Prisma adapter rejected the input.",
    );
    this.name = "LangameRuntimeRevokeIntentPrismaCurrent195Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeRevokeIntentPrismaCurrent195Error(code);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value, expectedKeys, code) {
  let invalid;
  let prototype;
  let descriptors;
  try {
    invalid =
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value);
    prototype = invalid ? null : Object.getPrototypeOf(value);
    descriptors = invalid ? null : Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(code);
  }
  if (invalid || (prototype !== Object.prototype && prototype !== null)) {
    fail(code);
  }
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
    "CURRENT195_PRISMA_CLIENT_INVALID",
  );
  if (
    typeof client.$queryRaw !== "function" ||
    typeof client.$disconnect !== "function"
  ) {
    fail("CURRENT195_PRISMA_CLIENT_INVALID");
  }
  return client;
}

function connection(value, expectedDatabase, expectedRole) {
  if (typeof value !== "string" || value.length > 4_096) {
    fail("CURRENT195_PRISMA_OWNER_URL_INVALID");
  }
  let parsed;
  let role;
  let password;
  let database;
  try {
    parsed = new URL(value);
    role = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    fail("CURRENT195_PRISMA_OWNER_URL_INVALID");
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
    fail("CURRENT195_PRISMA_OWNER_URL_INVALID");
  }
  return value;
}

function configuration(value) {
  const config = exactRecord(
    value,
    CONFIG_KEYS,
    "CURRENT195_PRISMA_CONFIG_INVALID",
  );
  if (
    typeof config.expectedDatabase !== "string" ||
    !SAFE_DATABASE_PATTERN.test(config.expectedDatabase) ||
    !config.expectedDatabase.endsWith("_ci") ||
    typeof config.ownerRoleName !== "string" ||
    !SAFE_ROLE_PATTERN.test(config.ownerRoleName)
  ) {
    fail("CURRENT195_PRISMA_CONFIG_INVALID");
  }
  return Object.freeze({
    expectedDatabase: config.expectedDatabase,
    ownerRoleName: config.ownerRoleName,
    ownerUrl: connection(
      config.ownerDatabaseUrl,
      config.expectedDatabase,
      config.ownerRoleName,
    ),
  });
}

function exactSingleRow(value, expectedKeys, code) {
  if (!Array.isArray(value) || value.length !== 1) fail(code);
  return exactRecord(value[0], expectedKeys, code);
}

function plainClient(client) {
  return Object.freeze({
    $disconnect: () => client.$disconnect(),
    $queryRaw: (query) => client.$queryRaw(query),
  });
}

function defaultClient(url) {
  return new PrismaClient({ datasourceUrl: url, log: [] });
}

async function assertIdentity(client, intent, config) {
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
    "CURRENT195_PRISMA_SESSION_IDENTITY_INVALID",
  );
  if (
    row.databaseName !== config.expectedDatabase ||
    row.databaseName !== intent.databaseName ||
    row.currentUser !== config.ownerRoleName ||
    row.currentUser !== intent.ownerRoleName ||
    row.sessionUser !== row.currentUser ||
    typeof row.databaseOid !== "bigint" ||
    row.databaseOid !== BigInt(intent.databaseOid) ||
    typeof row.roleOid !== "bigint" ||
    row.roleOid !== BigInt(intent.ownerRoleOid)
  ) {
    fail("CURRENT195_PRISMA_SESSION_IDENTITY_INVALID");
  }
}

function createDriver(config, client) {
  const token = Object.freeze({});
  let state = "NEW";
  let binding = null;
  let closePromise = null;

  const driver = Object.freeze({
    async applyCurrent195(receipt) {
      if (
        !["REGISTERED", "APPLYING"].includes(state) ||
        PERSISTED_RECEIPTS.get(receipt) !== token
      ) {
        fail("CURRENT195_PRISMA_APPLY_RECEIPT_INVALID");
      }
      state = "APPLYING";
      await assertIdentity(client, binding, config);
      const rows = await client.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_runtime_revoke_intent_apply_current195_v1(
          ${receipt.intentId}, ${receipt.intentPayloadDigest}
        )
      `);
      const row = exactSingleRow(
        rows,
        APPLY_ROW_KEYS,
        "CURRENT195_PRISMA_APPLY_RESULT_INVALID",
      );
      if (
        row.intentId !== receipt.intentId ||
        row.attestationId !== receipt.attestationId ||
        !["APPLIED", "EXPIRED"].includes(row.status) ||
        typeof row.replayed !== "boolean" ||
        (row.status === "APPLIED" &&
          (!(row.appliedAt instanceof Date) || row.expiredAt !== null)) ||
        (row.status === "EXPIRED" &&
          (row.appliedAt !== null || !(row.expiredAt instanceof Date)))
      ) {
        fail("CURRENT195_PRISMA_APPLY_RESULT_INVALID");
      }
      state = "TERMINAL";
      return Object.freeze({
        appliedAt: row.appliedAt?.toISOString() ?? null,
        attestationId: row.attestationId,
        authorization: false,
        contract: LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONTRACT,
        expiredAt: row.expiredAt?.toISOString() ?? null,
        intentId: row.intentId,
        replayed: row.replayed,
        status: row.status,
      });
    },
    async close() {
      if (!closePromise) {
        state = "CLOSED";
        closePromise = Promise.resolve().then(() => client.$disconnect());
      }
      return closePromise;
    },
    async registerCurrent195(intent) {
      if (!["NEW", "REGISTERING"].includes(state)) {
        fail("CURRENT195_PRISMA_REGISTER_STATE_INVALID");
      }
      if (
        !isVerifiedLangameRuntimeRevokeIntentCurrent195(intent) ||
        intent.databaseName !== config.expectedDatabase ||
        intent.ownerRoleName !== config.ownerRoleName ||
        (binding !== null && binding !== intent)
      ) {
        fail("CURRENT195_PRISMA_REGISTER_INTENT_INVALID");
      }
      state = "REGISTERING";
      binding = intent;
      await assertIdentity(client, intent, config);
      const rows = await client.$queryRaw(Prisma.sql`
        SELECT * FROM public.langame_runtime_revoke_intent_register_current195_v1(
          ${intent.intentId}, ${intent.intentPayloadDigest},
          ${intent.attestationId}, ${intent.expectedPayloadDigest},
          ${intent.attestationSigningKeyId},
          ${intent.attestationPublicKeyFingerprint},
          ${"LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1"},
          ${intent.releaseSha}, ${intent.databaseName},
          ${BigInt(intent.databaseOid)}, ${intent.ownerRoleName},
          ${BigInt(intent.ownerRoleOid)}, ${intent.revokeRequestId},
          ${intent.revokeRequestDigest}, ${intent.revocationReasonDigest},
          ${intent.signingKeyId}, ${intent.publicKeyFingerprint},
          ${intent.signature}, ${new Date(intent.issuedAt)},
          ${new Date(intent.validUntil)}
        )
      `);
      const row = exactSingleRow(
        rows,
        REGISTER_ROW_KEYS,
        "CURRENT195_PRISMA_REGISTER_RESULT_INVALID",
      );
      if (
        row.intentId !== intent.intentId ||
        !["PENDING", "APPLIED", "EXPIRED"].includes(row.status) ||
        !(row.validUntil instanceof Date) ||
        row.validUntil.toISOString() !== intent.validUntil ||
        typeof row.replayed !== "boolean"
      ) {
        fail("CURRENT195_PRISMA_REGISTER_RESULT_INVALID");
      }
      const receipt = Object.freeze({
        attestationId: intent.attestationId,
        authorization: false,
        contract: LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONTRACT,
        databaseName: intent.databaseName,
        databaseOid: intent.databaseOid,
        intentId: intent.intentId,
        intentPayloadDigest: intent.intentPayloadDigest,
        ownerRoleName: intent.ownerRoleName,
        ownerRoleOid: intent.ownerRoleOid,
        persistedStatus: row.status,
        replayed: row.replayed,
        validUntil: intent.validUntil,
      });
      PERSISTED_RECEIPTS.set(receipt, token);
      state = "REGISTERED";
      return receipt;
    },
  });
  BRANDED_DRIVERS.add(driver);
  return driver;
}

export function createLangameRuntimeRevokeIntentPrismaCurrent195() {
  fail("CURRENT195_PRISMA_PRODUCTION_DENIED");
}

export function createSyntheticLangameRuntimeRevokeIntentPrismaCurrent195(
  configValue,
  explicitConfirmation,
) {
  if (
    arguments.length !== 2 ||
    explicitConfirmation !==
      LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_CONFIRMATION
  ) {
    fail("CURRENT195_PRISMA_SYNTHETIC_DENIED");
  }
  const config = configuration(configValue);
  return createDriver(config, plainClient(defaultClient(config.ownerUrl)));
}

export function createLangameRuntimeRevokeIntentPrismaCurrent195ForTestOnly(
  configValue,
  clientValue,
  explicitConfirmation,
) {
  if (
    arguments.length !== 3 ||
    explicitConfirmation !==
      LANGAME_RUNTIME_REVOKE_INTENT_PRISMA_CURRENT195_TEST_CONFIRMATION
  ) {
    fail("CURRENT195_PRISMA_TEST_INJECTION_DENIED");
  }
  return createDriver(configuration(configValue), exactClient(clientValue));
}

export function isLangameRuntimeRevokeIntentPrismaCurrent195(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    BRANDED_DRIVERS.has(value)
  );
}

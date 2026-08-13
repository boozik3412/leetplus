import { Prisma } from "@prisma/client";
import { types as utilTypes } from "node:util";

import { isPreparedLangameRuntimeTrustRegistrationCurrent199 } from "./langame-runtime-trust-registration-current199.mjs";

export const LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_CONTRACT =
  "LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_V1";
export const LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_TEST_CONFIRMATION =
  "inject-langame-current199-owner-registration-ledger-for-unit-test";

const CONFIG_KEYS = Object.freeze(["expectedDatabase", "ownerRoleName"].sort());
const CLIENT_KEYS = Object.freeze(["$disconnect", "$queryRaw"].sort());
const REGISTER_ROW_KEYS = Object.freeze(
  ["registrationId", "replayed", "status", "validUntil"].sort(),
);
const EXPIRE_ROW_KEYS = Object.freeze(
  ["expiredAt", "registrationId", "replayed", "status"].sort(),
);
const SESSION_KEYS = Object.freeze(
  [
    "currentUser",
    "databaseName",
    "databaseOid",
    "databaseOwnerRoleOid",
    "ownerRoleOid",
    "runtimeBypassRls",
    "runtimeCanLogin",
    "runtimeCreateDatabase",
    "runtimeCreateRole",
    "runtimeInherit",
    "runtimeMembershipCount",
    "runtimeReplication",
    "runtimeRoleName",
    "runtimeRoleOid",
    "runtimeSuperuser",
    "sessionUser",
  ].sort(),
);
const SAFE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const BRANDED_DRIVERS = new WeakSet();
const PERSISTED_RECEIPTS = new WeakMap();

export class LangameRuntimeTrustRegistrationPrismaCurrent199Error extends Error {
  constructor(code) {
    super(
      "CURRENT199 Langame trust-registration Prisma adapter rejected the input.",
    );
    this.name = "LangameRuntimeTrustRegistrationPrismaCurrent199Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameRuntimeTrustRegistrationPrismaCurrent199Error(code);
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

function configuration(value) {
  const config = exactRecord(
    value,
    CONFIG_KEYS,
    "CURRENT199_PRISMA_CONFIG_INVALID",
  );
  if (
    typeof config.expectedDatabase !== "string" ||
    !SAFE_DATABASE_PATTERN.test(config.expectedDatabase) ||
    !config.expectedDatabase.endsWith("_ci") ||
    typeof config.ownerRoleName !== "string" ||
    !SAFE_ROLE_PATTERN.test(config.ownerRoleName)
  ) {
    fail("CURRENT199_PRISMA_CONFIG_INVALID");
  }
  return config;
}

function exactClient(value) {
  const client = exactRecord(
    value,
    CLIENT_KEYS,
    "CURRENT199_PRISMA_CLIENT_INVALID",
  );
  if (
    typeof client.$queryRaw !== "function" ||
    typeof client.$disconnect !== "function"
  ) {
    fail("CURRENT199_PRISMA_CLIENT_INVALID");
  }
  return client;
}

function exactSingleRow(value, expectedKeys, code) {
  if (!Array.isArray(value) || value.length !== 1) fail(code);
  return exactRecord(value[0], expectedKeys, code);
}

async function assertIdentity(client, registration, config) {
  const rows = await client.$queryRaw(Prisma.sql`
    SELECT pg_catalog.current_database() AS "databaseName",
      database_object.oid::BIGINT AS "databaseOid",
      database_object.datdba::BIGINT AS "databaseOwnerRoleOid",
      CURRENT_USER AS "currentUser", SESSION_USER AS "sessionUser",
      owner_role.oid::BIGINT AS "ownerRoleOid",
      runtime_role.rolname AS "runtimeRoleName",
      runtime_role.oid::BIGINT AS "runtimeRoleOid",
      runtime_role.rolcanlogin AS "runtimeCanLogin",
      runtime_role.rolinherit AS "runtimeInherit",
      runtime_role.rolsuper AS "runtimeSuperuser",
      runtime_role.rolcreatedb AS "runtimeCreateDatabase",
      runtime_role.rolcreaterole AS "runtimeCreateRole",
      runtime_role.rolreplication AS "runtimeReplication",
      runtime_role.rolbypassrls AS "runtimeBypassRls",
      (SELECT pg_catalog.count(*)::BIGINT
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = runtime_role.oid
          OR membership.roleid = runtime_role.oid) AS "runtimeMembershipCount"
    FROM pg_catalog.pg_database AS database_object
    INNER JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.rolname = CURRENT_USER
    INNER JOIN pg_catalog.pg_roles AS runtime_role
      ON runtime_role.rolname = ${registration.runtimeRoleName}
    WHERE database_object.datname = pg_catalog.current_database()
  `);
  const row = exactSingleRow(
    rows,
    SESSION_KEYS,
    "CURRENT199_PRISMA_SESSION_IDENTITY_INVALID",
  );
  if (
    row.databaseName !== config.expectedDatabase ||
    row.databaseName !== registration.databaseName ||
    row.currentUser !== config.ownerRoleName ||
    row.currentUser !== registration.ownerRoleName ||
    row.sessionUser !== row.currentUser ||
    typeof row.databaseOid !== "bigint" ||
    row.databaseOid !== BigInt(registration.databaseOid) ||
    typeof row.ownerRoleOid !== "bigint" ||
    row.ownerRoleOid !== BigInt(registration.ownerRoleOid) ||
    typeof row.databaseOwnerRoleOid !== "bigint" ||
    row.databaseOwnerRoleOid !== row.ownerRoleOid ||
    row.runtimeRoleName !== registration.runtimeRoleName ||
    typeof row.runtimeRoleOid !== "bigint" ||
    row.runtimeRoleOid !== BigInt(registration.runtimeRoleOid) ||
    row.runtimeCanLogin !== true ||
    row.runtimeInherit !== false ||
    row.runtimeSuperuser !== false ||
    row.runtimeCreateDatabase !== false ||
    row.runtimeCreateRole !== false ||
    row.runtimeReplication !== false ||
    row.runtimeBypassRls !== false ||
    typeof row.runtimeMembershipCount !== "bigint" ||
    row.runtimeMembershipCount !== 0n
  ) {
    fail("CURRENT199_PRISMA_SESSION_IDENTITY_INVALID");
  }
}

function createDriver(config, client) {
  const token = Object.freeze({});
  let state = "NEW";
  let binding = null;
  let registerAttempts = 0;
  let expireAttempts = 0;
  let closePromise = null;

  const driver = Object.freeze({
    async close() {
      if (!closePromise) {
        state = "CLOSED";
        closePromise = Promise.resolve().then(() => client.$disconnect());
      }
      return closePromise;
    },

    async expireCurrent199(receipt) {
      if (
        !["REGISTERED", "EXPIRING"].includes(state) ||
        PERSISTED_RECEIPTS.get(receipt) !== token ||
        binding === null
      ) {
        fail("CURRENT199_PRISMA_EXPIRE_RECEIPT_INVALID");
      }
      expireAttempts += 1;
      if (expireAttempts > 2) {
        state = "AMBIGUOUS";
        fail("CURRENT199_PRISMA_EXPIRE_RESPONSE_AMBIGUOUS");
      }
      state = "EXPIRING";
      await assertIdentity(client, binding, config);
      let rows;
      try {
        rows = await client.$queryRaw(Prisma.sql`
          SELECT *
          FROM public.langame_runtime_trust_registration_expire_current199_v1(
            ${receipt.registrationId}, ${receipt.registrationDigest}
          )
        `);
      } catch (error) {
        if (expireAttempts >= 2) {
          state = "AMBIGUOUS";
          fail("CURRENT199_PRISMA_EXPIRE_RESPONSE_AMBIGUOUS");
        }
        throw error;
      }
      const row = exactSingleRow(
        rows,
        EXPIRE_ROW_KEYS,
        "CURRENT199_PRISMA_EXPIRE_RESULT_INVALID",
      );
      if (
        row.registrationId !== receipt.registrationId ||
        row.status !== "EXPIRED" ||
        !(row.expiredAt instanceof Date) ||
        typeof row.replayed !== "boolean"
      ) {
        fail("CURRENT199_PRISMA_EXPIRE_RESULT_INVALID");
      }
      state = "TERMINAL";
      return Object.freeze({
        authorization: false,
        contract: LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_CONTRACT,
        expiredAt: row.expiredAt.toISOString(),
        registrationId: row.registrationId,
        replayed: row.replayed,
        status: row.status,
      });
    },

    async registerCurrent199(registration) {
      if (!["NEW", "REGISTERING"].includes(state)) {
        fail("CURRENT199_PRISMA_REGISTER_STATE_INVALID");
      }
      if (
        !isPreparedLangameRuntimeTrustRegistrationCurrent199(registration) ||
        registration.syntheticOnly !== true ||
        registration.databaseName !== config.expectedDatabase ||
        registration.ownerRoleName !== config.ownerRoleName ||
        (binding !== null && binding !== registration)
      ) {
        fail("CURRENT199_PRISMA_REGISTRATION_INVALID");
      }
      registerAttempts += 1;
      if (registerAttempts > 2) {
        state = "AMBIGUOUS";
        fail("CURRENT199_PRISMA_REGISTER_RESPONSE_AMBIGUOUS");
      }
      state = "REGISTERING";
      binding = registration;
      await assertIdentity(client, registration, config);
      let rows;
      try {
        rows = await client.$queryRaw(Prisma.sql`
          SELECT *
          FROM public.langame_runtime_trust_registration_register_current199_v1(
            ${registration.enrollmentId}, ${registration.contract},
            ${registration.registrationDigest},
            ${registration.enrollmentPayloadDigest},
            ${registration.protectedAcquisitionReceiptDigest},
            ${registration.bootstrapRegistryContract},
            ${registration.bootstrapRegistryDigest},
            ${registration.candidateBundleDigest},
            ${registration.clusterIdentityDigest}, ${registration.releaseSha},
            ${registration.releaseArtifactDigest},
            ${registration.runtimeConfigDigest},
            ${registration.verifierArtifactDigest},
            ${registration.databaseName}, ${BigInt(registration.databaseOid)},
            ${registration.ownerRoleName}, ${BigInt(registration.ownerRoleOid)},
            ${registration.runtimeRoleName},
            ${BigInt(registration.runtimeRoleOid)},
            ${registration.enrollmentGeneration},
            ${registration.bootstrapSigningKeyId},
            ${registration.bootstrapPublicKeyFingerprint},
            ${registration.runtimeAttestationKeyId},
            ${registration.runtimeAttestationPublicKeyFingerprint},
            ${registration.runtimeAttestationPublicKeyBytesSha256},
            ${registration.runtimeRevokeIntentKeyId},
            ${registration.runtimeRevokeIntentPublicKeyFingerprint},
            ${registration.runtimeRevokeIntentPublicKeyBytesSha256},
            ${registration.tlsCaCertificateSha256},
            ${registration.tlsEndpointHost}, ${registration.tlsEndpointPort},
            ${registration.tlsServerName},
            ${registration.tlsLeafCertificateSha256},
            ${registration.tlsLeafSpkiSha256},
            ${new Date(registration.tlsLeafNotBefore)},
            ${new Date(registration.tlsLeafNotAfter)},
            ${registration.tlsMinimumProtocol},
            ${registration.resolvedAddressSetDigest},
            ${registration.tlsObservationDigest},
            ${new Date(registration.issuedAt)},
            ${new Date(registration.collectedAt)},
            ${new Date(registration.preparedAt)},
            ${new Date(registration.validUntil)},
            ${registration.syntheticOnly}
          )
        `);
      } catch (error) {
        if (registerAttempts >= 2) {
          state = "AMBIGUOUS";
          fail("CURRENT199_PRISMA_REGISTER_RESPONSE_AMBIGUOUS");
        }
        throw error;
      }
      const row = exactSingleRow(
        rows,
        REGISTER_ROW_KEYS,
        "CURRENT199_PRISMA_REGISTER_RESULT_INVALID",
      );
      if (
        row.registrationId !== registration.enrollmentId ||
        !["PENDING", "EXPIRED"].includes(row.status) ||
        !(row.validUntil instanceof Date) ||
        row.validUntil.toISOString() !== registration.validUntil ||
        typeof row.replayed !== "boolean"
      ) {
        fail("CURRENT199_PRISMA_REGISTER_RESULT_INVALID");
      }
      const receipt = Object.freeze({
        authorization: false,
        contract: LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_CONTRACT,
        databaseName: registration.databaseName,
        databaseOid: registration.databaseOid,
        ownerRoleName: registration.ownerRoleName,
        ownerRoleOid: registration.ownerRoleOid,
        persistedStatus: row.status,
        registrationDigest: registration.registrationDigest,
        registrationId: registration.enrollmentId,
        replayed: row.replayed,
        runtimeRoleName: registration.runtimeRoleName,
        runtimeRoleOid: registration.runtimeRoleOid,
        validUntil: registration.validUntil,
      });
      PERSISTED_RECEIPTS.set(receipt, token);
      state = row.status === "EXPIRED" ? "TERMINAL" : "REGISTERED";
      return receipt;
    },
  });
  BRANDED_DRIVERS.add(driver);
  return driver;
}

export function createLangameRuntimeTrustRegistrationPrismaCurrent199() {
  fail("CURRENT199_PRISMA_PRODUCTION_DENIED");
}

export function createLangameRuntimeTrustRegistrationPrismaCurrent199ForTestOnly(
  configValue,
  clientValue,
  explicitConfirmation,
) {
  if (
    arguments.length !== 3 ||
    explicitConfirmation !==
      LANGAME_RUNTIME_TRUST_REGISTRATION_PRISMA_CURRENT199_TEST_CONFIRMATION
  ) {
    fail("CURRENT199_PRISMA_TEST_INJECTION_DENIED");
  }
  return createDriver(configuration(configValue), exactClient(clientValue));
}

export function isLangameRuntimeTrustRegistrationPrismaCurrent199(value) {
  return (
    arguments.length === 1 &&
    value !== null &&
    typeof value === "object" &&
    BRANDED_DRIVERS.has(value)
  );
}

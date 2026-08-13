import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export const LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT =
  "LANGAME_INITIAL_SYNC_RUNTIME_BOUNDARY_CURRENT193_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE =
  "LANGAME_INITIAL_SYNC_EXECUTE_ONLY_PG16_V1";
export const LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE =
  "leetplus_langame_initial_sync_current192";
export const LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256 =
  "cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3";

// Production trust is deliberately absent until an independent root ceremony,
// persisted consumption/revocation ledger and production-like rehearsal exist.
export const PINNED_LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROOTS =
  Object.freeze({});

export const LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES = Object.freeze([
  Object.freeze({
    callable: true,
    identity:
      "public.langame_initial_sync_claim_current192_v1(text,text,text,text,text,text,text,text)",
    securityDefiner: true,
    searchPath: "pg_catalog, public",
  }),
  Object.freeze({
    callable: true,
    identity:
      "public.langame_initial_sync_execute_current192_v1(text,text,text,text,text,text,text)",
    securityDefiner: true,
    searchPath: "pg_catalog, public",
  }),
  Object.freeze({
    callable: true,
    identity:
      "public.langame_initial_sync_reconcile_current192_v1(text,text,text,text)",
    securityDefiner: true,
    searchPath: "pg_catalog, public",
  }),
  Object.freeze({
    callable: false,
    identity: "public.langame_initial_sync_execution_guard_current192_v1()",
    securityDefiner: false,
    searchPath: null,
  }),
  Object.freeze({
    callable: false,
    identity:
      "public.langame_initial_sync_execution_event_guard_current192_v1()",
    securityDefiner: false,
    searchPath: null,
  }),
]);

const PLAN_KEYS = Object.freeze(
  [
    "databaseName",
    "databaseOid",
    "environment",
    "executorRoleName",
    "executorRoleOid",
    "releaseSha",
    "schemaOwnerRoleName",
    "schemaOwnerRoleOid",
  ].sort(),
);
const SNAPSHOT_KEYS = Object.freeze(
  [
    "databaseAcl",
    "databaseName",
    "databaseOid",
    "currentUser",
    "defaultPrivilegeCount",
    "directSequencePrivilegeCount",
    "directTablePrivilegeCount",
    "executorRole",
    "functionOwnerRoleName",
    "functionOwnerRoleOid",
    "membershipCount",
    "ownedObjectCount",
    "routines",
    "schemaAcl",
    "sessionUser",
    "unexpectedExecutableRoutineCount",
  ].sort(),
);
const ROLE_KEYS = Object.freeze(
  [
    "bypassRls",
    "canCreateDatabase",
    "canCreateRole",
    "canLogin",
    "inherit",
    "name",
    "oid",
    "replication",
    "superuser",
  ].sort(),
);
const DATABASE_ACL_KEYS = Object.freeze(
  ["connect", "create", "temporary"].sort(),
);
const SCHEMA_ACL_KEYS = Object.freeze(["create", "usage"].sort());
const ROUTINE_KEYS = Object.freeze(
  [
    "executorCanExecute",
    "identity",
    "ownerRoleName",
    "ownerRoleOid",
    "publicCanExecute",
    "searchPath",
    "securityDefiner",
  ].sort(),
);
const DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const ROLE_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const MAX_OID = 4_294_967_295;
const BRANDED_PLANS = new WeakSet();
const BRANDED_RECEIPTS = new WeakSet();

export class LangameInitialSyncRuntimeCurrent193Error extends Error {
  constructor(code) {
    super("CURRENT193 Langame runtime boundary rejected the input.");
    this.name = "LangameInitialSyncRuntimeCurrent193Error";
    this.code = code;
    this.safeContractError = true;
  }
}

function fail(code) {
  throw new LangameInitialSyncRuntimeCurrent193Error(code);
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
    keys.some(
      (key) =>
        !Object.hasOwn(descriptors[key], "value") ||
        descriptors[key].enumerable !== true,
    )
  ) {
    fail(code);
  }
  const result = Object.create(null);
  for (const key of expectedKeys) result[key] = descriptors[key].value;
  return Object.freeze(result);
}

function exactArray(value, expectedLength, code) {
  let invalid;
  try {
    invalid = !Array.isArray(value) || utilTypes.isProxy(value);
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
  if (prototype !== Array.prototype || value.length !== expectedLength) {
    fail(code);
  }
  const keys = Reflect.ownKeys(descriptors);
  const expectedKeys = [
    ...Array.from({ length: expectedLength }, (_, index) => String(index)),
    "length",
  ];
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(descriptors, key)) ||
    expectedKeys.slice(0, -1).some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(code);
  }
  return Object.freeze(
    expectedKeys.slice(0, -1).map((key) => descriptors[key].value),
  );
}

function positiveOid(value, code) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_OID) fail(code);
  return value;
}

function zeroCount(value, code) {
  if (value !== 0) fail(code);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function digestDocument(value) {
  return sha256(JSON.stringify(value));
}

function freezeRoutineExpectation(routine) {
  return Object.freeze({
    callable: routine.callable,
    identity: routine.identity,
    searchPath: routine.searchPath,
    securityDefiner: routine.securityDefiner,
  });
}

export function planLangameInitialSyncRuntimeCurrent193(input) {
  const data = exactRecord(input, PLAN_KEYS, "CURRENT193_PLAN_SHAPE_INVALID");
  if (
    !DATABASE_PATTERN.test(data.databaseName) ||
    !ROLE_PATTERN.test(data.schemaOwnerRoleName) ||
    data.executorRoleName !== LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROLE ||
    !RELEASE_SHA_PATTERN.test(data.releaseSha) ||
    data.environment !== "ci"
  ) {
    fail("CURRENT193_PLAN_VALUE_INVALID");
  }
  positiveOid(data.databaseOid, "CURRENT193_DATABASE_OID_INVALID");
  positiveOid(data.executorRoleOid, "CURRENT193_EXECUTOR_OID_INVALID");
  positiveOid(data.schemaOwnerRoleOid, "CURRENT193_OWNER_OID_INVALID");
  if (data.executorRoleOid === data.schemaOwnerRoleOid) {
    fail("CURRENT193_ROLE_SEPARATION_INVALID");
  }

  const document = {
    contract: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
    profile: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
    releaseSha: data.releaseSha,
    environment: data.environment,
    database: Object.freeze({ name: data.databaseName, oid: data.databaseOid }),
    executorRole: Object.freeze({
      name: data.executorRoleName,
      oid: data.executorRoleOid,
    }),
    schemaOwnerRole: Object.freeze({
      name: data.schemaOwnerRoleName,
      oid: data.schemaOwnerRoleOid,
    }),
    current192MigrationSha256:
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_MIGRATION_SHA256,
    routines: Object.freeze(
      LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_ROUTINES.map(
        freezeRoutineExpectation,
      ),
    ),
    authorization: false,
    productionApplyAllowed: false,
    applicationRouteAllowed: false,
  };
  const plan = Object.freeze({ ...document, planDigest: digestDocument(document) });
  BRANDED_PLANS.add(plan);
  return plan;
}

function assertAcl(value, keys, expected, code) {
  const acl = exactRecord(value, keys, code);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (acl[key] !== expectedValue) fail(code);
  }
}

function assertRoutineSnapshot(value, expected, plan) {
  const row = exactRecord(value, ROUTINE_KEYS, "CURRENT193_ROUTINE_INVALID");
  if (
    row.identity !== expected.identity ||
    row.ownerRoleName !== plan.schemaOwnerRole.name ||
    row.ownerRoleOid !== plan.schemaOwnerRole.oid ||
    row.executorCanExecute !== expected.callable ||
    row.publicCanExecute !== false ||
    row.securityDefiner !== expected.securityDefiner ||
    row.searchPath !== expected.searchPath
  ) {
    fail("CURRENT193_ROUTINE_INVALID");
  }
  return Object.freeze({
    executorCanExecute: row.executorCanExecute,
    identity: row.identity,
    ownerRoleName: row.ownerRoleName,
    ownerRoleOid: row.ownerRoleOid,
    publicCanExecute: row.publicCanExecute,
    searchPath: row.searchPath,
    securityDefiner: row.securityDefiner,
  });
}

export function attestLangameInitialSyncRuntimeCurrent193(plan, snapshot) {
  if (!BRANDED_PLANS.has(plan)) fail("CURRENT193_PLAN_UNTRUSTED");
  const data = exactRecord(
    snapshot,
    SNAPSHOT_KEYS,
    "CURRENT193_SNAPSHOT_SHAPE_INVALID",
  );
  const role = exactRecord(
    data.executorRole,
    ROLE_KEYS,
    "CURRENT193_EXECUTOR_ROLE_INVALID",
  );
  if (
    data.databaseName !== plan.database.name ||
    data.databaseOid !== plan.database.oid ||
    data.currentUser !== plan.executorRole.name ||
    data.sessionUser !== plan.executorRole.name ||
    role.name !== plan.executorRole.name ||
    role.oid !== plan.executorRole.oid ||
    role.canLogin !== true ||
    role.inherit !== false ||
    role.superuser !== false ||
    role.canCreateDatabase !== false ||
    role.canCreateRole !== false ||
    role.replication !== false ||
    role.bypassRls !== false
  ) {
    fail("CURRENT193_EXECUTOR_ROLE_INVALID");
  }
  if (
    data.functionOwnerRoleName !== plan.schemaOwnerRole.name ||
    data.functionOwnerRoleOid !== plan.schemaOwnerRole.oid
  ) {
    fail("CURRENT193_FUNCTION_OWNER_INVALID");
  }
  zeroCount(data.membershipCount, "CURRENT193_MEMBERSHIP_PRESENT");
  zeroCount(data.ownedObjectCount, "CURRENT193_OWNERSHIP_PRESENT");
  zeroCount(
    data.directTablePrivilegeCount,
    "CURRENT193_TABLE_PRIVILEGE_PRESENT",
  );
  zeroCount(
    data.directSequencePrivilegeCount,
    "CURRENT193_SEQUENCE_PRIVILEGE_PRESENT",
  );
  zeroCount(
    data.defaultPrivilegeCount,
    "CURRENT193_DEFAULT_PRIVILEGE_PRESENT",
  );
  zeroCount(
    data.unexpectedExecutableRoutineCount,
    "CURRENT193_UNEXPECTED_EXECUTE_PRESENT",
  );
  assertAcl(
    data.databaseAcl,
    DATABASE_ACL_KEYS,
    { connect: true, create: false, temporary: false },
    "CURRENT193_DATABASE_ACL_INVALID",
  );
  assertAcl(
    data.schemaAcl,
    SCHEMA_ACL_KEYS,
    { create: false, usage: true },
    "CURRENT193_SCHEMA_ACL_INVALID",
  );
  const routineInput = exactArray(
    data.routines,
    plan.routines.length,
    "CURRENT193_ROUTINE_SET_INVALID",
  );
  const routines = Object.freeze(
    routineInput.map((row, index) =>
      assertRoutineSnapshot(row, plan.routines[index], plan),
    ),
  );

  const document = {
    contract: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_CONTRACT,
    profile: LANGAME_INITIAL_SYNC_RUNTIME_CURRENT193_PROFILE,
    planDigest: plan.planDigest,
    releaseSha: plan.releaseSha,
    database: plan.database,
    executorRole: plan.executorRole,
    schemaOwnerRole: plan.schemaOwnerRole,
    routines,
    catalogMatched: true,
    productionExecutionAllowed: false,
  };
  const receipt = Object.freeze({
    ...document,
    receiptDigest: digestDocument(document),
  });
  BRANDED_RECEIPTS.add(receipt);
  return receipt;
}

export function assertLangameInitialSyncRuntimeReceiptCurrent193(receipt) {
  if (!BRANDED_RECEIPTS.has(receipt)) fail("CURRENT193_RECEIPT_UNTRUSTED");
  return receipt;
}

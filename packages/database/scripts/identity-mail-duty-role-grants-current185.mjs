import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { canonicalStringify } from "./staff-task-integrity-canonical-json.mjs";

export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_VERSION = 1;
export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT =
  "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1";
export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE =
  "IDENTITY_MAIL_DUTY_GRANTS_PG16_V1";
export const IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1";

export const IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE =
  'public."identity_mail_tenant_enrollment_drive_command_v2"(text,text,text,text)';

export const IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES = Object.freeze(
  [
    'public."identity_mail_delivery_worker_assert_v2"(text,text)',
    'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
    'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
    'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
    'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
  ].sort(),
);

export const IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES = Object.freeze(
  [
    IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
    ...IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES,
  ].sort(),
);

const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const ROLE_NAME_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/u;
const MAX_POSTGRES_OID = 4_294_967_295;
const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const SYSTEM_ROLES = new Set([
  "current_role",
  "current_user",
  "none",
  "postgres",
  "public",
]);
const SYSTEM_ROLE_PREFIXES = Object.freeze(["azure_", "cloudsql", "pg_", "rds_"]);

const SNAPSHOT_KEYS = Object.freeze(
  [
    "contract",
    "database",
    "databaseRoleSettings",
    "defaultAcls",
    "effectivePrivileges",
    "memberships",
    "nonOwnerRoutineAcls",
    "profile",
    "roles",
    "roleSettings",
    "routines",
    "schema",
    "schemaVersion",
    "supportAcls",
    "unexpectedDutyRoleOwnerships",
  ].sort(),
);
const DATABASE_KEYS = Object.freeze(
  ["identityDigest", "name", "oid", "ownerName", "ownerOid"].sort(),
);
const SCHEMA_KEYS = Object.freeze(["name", "oid", "ownerName", "ownerOid"].sort());
const ROLES_KEYS = Object.freeze(["coordinator", "schemaOwner", "worker"].sort());
const ROLE_KEYS = Object.freeze(
  [
    "bypassRls",
    "canLogin",
    "connectionLimit",
    "createDatabase",
    "createRole",
    "inherit",
    "name",
    "oid",
    "replication",
    "superuser",
    "validUntil",
  ].sort(),
);
const ROUTINE_KEYS = Object.freeze(
  [
    "language",
    "oid",
    "ownerName",
    "ownerOid",
    "parallelSafety",
    "returnType",
    "searchPath",
    "securityDefiner",
    "signature",
    "volatility",
  ].sort(),
);
const ACL_KEYS = Object.freeze(
  [
    "grantorName",
    "grantorOid",
    "granteeName",
    "granteeOid",
    "isGrantable",
    "objectIdentity",
    "objectKind",
    "privilege",
  ].sort(),
);
const EFFECTIVE_PRIVILEGE_KEYS = Object.freeze(
  ["objectIdentity", "objectKind", "privilege", "roleName", "roleOid"].sort(),
);

export class IdentityMailDutyRoleGrantsCurrent185Error extends Error {
  constructor(reasonCode) {
    super("The CURRENT185 identity-mail duty-role grant catalog is invalid.");
    this.name = "IdentityMailDutyRoleGrantsCurrent185Error";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.exitCode = 3;
    this.safeContractError = true;
  }
}

function fail(reasonCode) {
  throw new IdentityMailDutyRoleGrantsCurrent185Error(reasonCode);
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactDataRecord(value, expectedKeys, reasonCode) {
  let invalidShape;
  try {
    invalidShape =
      value === null ||
      typeof value !== "object" ||
      utilTypes.isProxy(value) ||
      Array.isArray(value);
  } catch {
    fail(reasonCode);
  }
  if (invalidShape) {
    fail(reasonCode);
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode);
  }
  if (prototype !== Object.prototype && prototype !== null) fail(reasonCode);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(reasonCode);
  keys.sort(compareStrings);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(reasonCode);
  }
  const snapshot = Object.create(null);
  for (const key of expectedKeys) snapshot[key] = descriptors[key].value;
  return Object.freeze(snapshot);
}

function exactDataArray(value, reasonCode, expectedLength) {
  let invalidShape;
  try {
    invalidShape = utilTypes.isProxy(value) || !Array.isArray(value);
  } catch {
    fail(reasonCode);
  }
  if (invalidShape) fail(reasonCode);
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail(reasonCode);
  }
  if (prototype !== Array.prototype) fail(reasonCode);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) fail(reasonCode);
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    !Object.hasOwn(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value !== expectedLength
  ) {
    fail(reasonCode);
  }
  const length = lengthDescriptor.value;
  const expectedIndexes = Array.from({ length }, (_, index) => String(index)).sort(
    compareStrings,
  );
  const actualIndexes = keys.filter((key) => key !== "length").sort(compareStrings);
  if (
    actualIndexes.length !== expectedIndexes.length ||
    actualIndexes.some((key, index) => key !== expectedIndexes[index]) ||
    actualIndexes.some((key) => {
      const descriptor = descriptors[key];
      return !Object.hasOwn(descriptor, "value") || descriptor.enumerable !== true;
    })
  ) {
    fail(reasonCode);
  }
  return Object.freeze(actualIndexes.map((key) => descriptors[key].value));
}

function validOid(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_POSTGRES_OID;
}

function validRoleName(value, allowSystem = false) {
  return (
    typeof value === "string" &&
    ROLE_NAME_PATTERN.test(value) &&
    (allowSystem ||
      (!SYSTEM_ROLES.has(value) &&
        !SYSTEM_ROLE_PREFIXES.some((prefix) => value.startsWith(prefix))))
  );
}

function normalizeDatabase(value) {
  const database = exactDataRecord(
    value,
    DATABASE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DATABASE_INVALID",
  );
  if (
    typeof database.name !== "string" ||
    !DATABASE_NAME_PATTERN.test(database.name) ||
    SYSTEM_DATABASES.has(database.name) ||
    !validOid(database.oid) ||
    typeof database.identityDigest !== "string" ||
    !SHA_256_PATTERN.test(database.identityDigest) ||
    !validRoleName(database.ownerName) ||
    !validOid(database.ownerOid)
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DATABASE_INVALID");
  }
  return Object.freeze({ ...database });
}

function normalizeRole(value, expectedLogin) {
  const role = exactDataRecord(
    value,
    ROLE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID",
  );
  if (
    !validRoleName(role.name) ||
    !validOid(role.oid) ||
    role.canLogin !== expectedLogin ||
    role.inherit !== false ||
    role.superuser !== false ||
    role.createRole !== false ||
    role.createDatabase !== false ||
    role.replication !== false ||
    role.bypassRls !== false ||
    role.connectionLimit !== -1 ||
    role.validUntil !== null
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID");
  }
  return Object.freeze({ ...role });
}

function normalizeRoles(value, database) {
  const roles = exactDataRecord(
    value,
    ROLES_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID",
  );
  const normalized = Object.freeze({
    coordinator: normalizeRole(roles.coordinator, true),
    schemaOwner: normalizeRole(roles.schemaOwner, false),
    worker: normalizeRole(roles.worker, true),
  });
  const roleValues = Object.values(normalized);
  const names = roleValues.map((role) => role.name);
  const oids = roleValues.map((role) => role.oid);
  if (
    new Set(names).size !== names.length ||
    new Set(oids).size !== oids.length ||
    roleValues.some(
      (role) =>
        role.name === database.ownerName || role.oid === database.ownerOid,
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_TOPOLOGY_INVALID");
  }
  return normalized;
}

function normalizeSchema(value, roles) {
  const schema = exactDataRecord(
    value,
    SCHEMA_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_INVALID",
  );
  if (
    schema.name !== "public" ||
    !validOid(schema.oid) ||
    schema.ownerName !== roles.schemaOwner.name ||
    schema.ownerOid !== roles.schemaOwner.oid
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_INVALID");
  }
  return Object.freeze({ ...schema });
}

function normalizeRows(
  value,
  expectedKeys,
  reasonCode,
  expectedLength,
  validate,
) {
  const rows = exactDataArray(value, reasonCode, expectedLength).map((candidate) => {
    const row = exactDataRecord(candidate, expectedKeys, reasonCode);
    validate(row, reasonCode);
    return Object.freeze({ ...row });
  });
  const ordered = rows.sort((left, right) =>
    compareStrings(canonicalStringify(left), canonicalStringify(right)),
  );
  const encodings = ordered.map((row) => canonicalStringify(row));
  if (new Set(encodings).size !== encodings.length) fail(reasonCode);
  return Object.freeze(ordered);
}

function validateRoutine(row, reasonCode) {
  if (
    typeof row.signature !== "string" ||
    !IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.includes(row.signature) ||
    !validOid(row.oid) ||
    !validRoleName(row.ownerName) ||
    !validOid(row.ownerOid) ||
    row.securityDefiner !== true ||
    row.volatility !== "v" ||
    row.parallelSafety !== "u" ||
    row.language !== "plpgsql" ||
    row.returnType !== "jsonb" ||
    row.searchPath !== "pg_catalog"
  ) {
    fail(reasonCode);
  }
}

function validateAcl(row, reasonCode) {
  if (
    !["DATABASE", "ROUTINE", "SCHEMA"].includes(row.objectKind) ||
    typeof row.objectIdentity !== "string" ||
    row.objectIdentity.length === 0 ||
    !validRoleName(row.grantorName, true) ||
    !validOid(row.grantorOid) ||
    !validRoleName(row.granteeName, true) ||
    (!validOid(row.granteeOid) && row.granteeOid !== 0) ||
    typeof row.privilege !== "string" ||
    !["CONNECT", "EXECUTE", "USAGE"].includes(row.privilege) ||
    typeof row.isGrantable !== "boolean"
  ) {
    fail(reasonCode);
  }
}

function validateEffectivePrivilege(row, reasonCode) {
  if (
    !validRoleName(row.roleName) ||
    !validOid(row.roleOid) ||
    ![
      "COLUMN",
      "DATABASE",
      "RELATION",
      "ROUTINE",
      "SCHEMA",
      "SEQUENCE",
      "TYPE",
    ].includes(row.objectKind) ||
    typeof row.objectIdentity !== "string" ||
    row.objectIdentity.length === 0 ||
    typeof row.privilege !== "string" ||
    row.privilege.length === 0
  ) {
    fail(reasonCode);
  }
}

function expectedRoutines(roles, routines) {
  const oidBySignature = new Map(
    routines.map((routine) => [routine.signature, routine.oid]),
  );
  return IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.map((signature) =>
    Object.freeze({
      language: "plpgsql",
      oid: oidBySignature.get(signature),
      ownerName: roles.schemaOwner.name,
      ownerOid: roles.schemaOwner.oid,
      parallelSafety: "u",
      returnType: "jsonb",
      searchPath: "pg_catalog",
      securityDefiner: true,
      signature,
      volatility: "v",
    }),
  ).sort((left, right) =>
    compareStrings(canonicalStringify(left), canonicalStringify(right)),
  );
}

function expectedRoutineAcls(roles) {
  return IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.map((signature) => {
    const grantee =
      signature === IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE
        ? roles.coordinator
        : roles.worker;
    return Object.freeze({
      grantorName: roles.schemaOwner.name,
      grantorOid: roles.schemaOwner.oid,
      granteeName: grantee.name,
      granteeOid: grantee.oid,
      isGrantable: false,
      objectIdentity: signature,
      objectKind: "ROUTINE",
      privilege: "EXECUTE",
    });
  }).sort((left, right) =>
    compareStrings(canonicalStringify(left), canonicalStringify(right)),
  );
}

function expectedSupportAcls(database, roles) {
  return [
    Object.freeze({
      grantorName: database.ownerName,
      grantorOid: database.ownerOid,
      granteeName: roles.coordinator.name,
      granteeOid: roles.coordinator.oid,
      isGrantable: false,
      objectIdentity: database.name,
      objectKind: "DATABASE",
      privilege: "CONNECT",
    }),
    Object.freeze({
      grantorName: database.ownerName,
      grantorOid: database.ownerOid,
      granteeName: roles.worker.name,
      granteeOid: roles.worker.oid,
      isGrantable: false,
      objectIdentity: database.name,
      objectKind: "DATABASE",
      privilege: "CONNECT",
    }),
    Object.freeze({
      grantorName: roles.schemaOwner.name,
      grantorOid: roles.schemaOwner.oid,
      granteeName: "public",
      granteeOid: 0,
      isGrantable: false,
      objectIdentity: "public",
      objectKind: "SCHEMA",
      privilege: "USAGE",
    }),
  ].sort((left, right) =>
    compareStrings(canonicalStringify(left), canonicalStringify(right)),
  );
}

function expectedEffectivePrivileges(database, roles) {
  const entries = [];
  for (const role of [roles.coordinator, roles.worker]) {
    entries.push(
      Object.freeze({
        objectIdentity: database.name,
        objectKind: "DATABASE",
        privilege: "CONNECT",
        roleName: role.name,
        roleOid: role.oid,
      }),
      Object.freeze({
        objectIdentity: "public",
        objectKind: "SCHEMA",
        privilege: "USAGE",
        roleName: role.name,
        roleOid: role.oid,
      }),
    );
  }
  entries.push(
    Object.freeze({
      objectIdentity: IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
      objectKind: "ROUTINE",
      privilege: "EXECUTE",
      roleName: roles.coordinator.name,
      roleOid: roles.coordinator.oid,
    }),
  );
  for (const signature of IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES) {
    entries.push(
      Object.freeze({
        objectIdentity: signature,
        objectKind: "ROUTINE",
        privilege: "EXECUTE",
        roleName: roles.worker.name,
        roleOid: roles.worker.oid,
      }),
    );
  }
  return entries.sort((left, right) =>
    compareStrings(canonicalStringify(left), canonicalStringify(right)),
  );
}

function sameRows(actual, expected) {
  return canonicalStringify(actual) === canonicalStringify(expected);
}

function requireEmpty(value, reasonCode) {
  if (exactDataArray(value, reasonCode, 0).length !== 0) fail(reasonCode);
  return Object.freeze([]);
}

export function identityMailDutyRoleGrantsCurrent185Projection(value) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ARGUMENTS_INVALID");
  }
  const snapshot = exactDataRecord(
    value,
    SNAPSHOT_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SNAPSHOT_INVALID",
  );
  if (
    snapshot.schemaVersion !==
      IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_VERSION ||
    snapshot.contract !== IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT ||
    snapshot.profile !== IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT_INVALID");
  }
  const database = normalizeDatabase(snapshot.database);
  const roles = normalizeRoles(snapshot.roles, database);
  const schema = normalizeSchema(snapshot.schema, roles);
  const routines = normalizeRows(
    snapshot.routines,
    ROUTINE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
    IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.length,
    validateRoutine,
  );
  if (
    new Set(routines.map((routine) => routine.signature)).size !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.length ||
    new Set(routines.map((routine) => routine.oid)).size !== routines.length
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_SURFACE_MISMATCH");
  }
  const nonOwnerRoutineAcls = normalizeRows(
    snapshot.nonOwnerRoutineAcls,
    ACL_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_ACL_INVALID",
    IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.length,
    validateAcl,
  );
  const supportAcls = normalizeRows(
    snapshot.supportAcls,
    ACL_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SUPPORT_ACL_INVALID",
    3,
    validateAcl,
  );
  const effectivePrivileges = normalizeRows(
    snapshot.effectivePrivileges,
    EFFECTIVE_PRIVILEGE_KEYS,
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_EFFECTIVE_PRIVILEGE_INVALID",
    10,
    validateEffectivePrivilege,
  );
  if (!sameRows(routines, expectedRoutines(roles, routines))) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_SURFACE_MISMATCH");
  }
  if (!sameRows(nonOwnerRoutineAcls, expectedRoutineAcls(roles))) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_ACL_MISMATCH");
  }
  if (!sameRows(supportAcls, expectedSupportAcls(database, roles))) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SUPPORT_ACL_MISMATCH");
  }
  if (
    !sameRows(
      effectivePrivileges,
      expectedEffectivePrivileges(database, roles),
    )
  ) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_EFFECTIVE_PRIVILEGE_MISMATCH");
  }
  return Object.freeze({
    contract: snapshot.contract,
    database,
    databaseRoleSettings: requireEmpty(
      snapshot.databaseRoleSettings,
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DATABASE_ROLE_SETTING_FORBIDDEN",
    ),
    defaultAcls: requireEmpty(
      snapshot.defaultAcls,
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DEFAULT_ACL_FORBIDDEN",
    ),
    unexpectedDutyRoleOwnerships: requireEmpty(
      snapshot.unexpectedDutyRoleOwnerships,
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_OWNERSHIP_FORBIDDEN",
    ),
    effectivePrivileges,
    memberships: requireEmpty(
      snapshot.memberships,
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_MEMBERSHIP_FORBIDDEN",
    ),
    nonOwnerRoutineAcls,
    profile: snapshot.profile,
    roles,
    roleSettings: requireEmpty(
      snapshot.roleSettings,
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_SETTING_FORBIDDEN",
    ),
    routines,
    schema,
    schemaVersion: snapshot.schemaVersion,
    supportAcls,
  });
}

export function identityMailDutyRoleGrantsCurrent185Digest(value) {
  if (arguments.length !== 1) {
    fail("IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ARGUMENTS_INVALID");
  }
  const projection = identityMailDutyRoleGrantsCurrent185Projection(value);
  return createHash("sha256")
    .update(
      `${IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN}\n${canonicalStringify(projection)}\n`,
      "utf8",
    )
    .digest("hex");
}

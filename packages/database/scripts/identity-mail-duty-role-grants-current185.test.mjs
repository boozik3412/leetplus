import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
  IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
  IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES,
  IdentityMailDutyRoleGrantsCurrent185Error,
  identityMailDutyRoleGrantsCurrent185Digest,
  identityMailDutyRoleGrantsCurrent185Projection,
} from "./identity-mail-duty-role-grants-current185.mjs";

const DATABASE_IDENTITY_DIGEST = "1".repeat(64);
const DATABASE = Object.freeze({
  identityDigest: DATABASE_IDENTITY_DIGEST,
  name: "leetplus_duty_roles_ci",
  oid: 16_384,
  ownerName: "leetplus_database_owner",
  ownerOid: 16_385,
});
const SCHEMA_OID = 16_389;
const BASE_ROLE_ATTRIBUTES = Object.freeze({
  bypassRls: false,
  connectionLimit: -1,
  createDatabase: false,
  createRole: false,
  inherit: false,
  replication: false,
  superuser: false,
  validUntil: null,
});

function roles(overrides = {}) {
  return {
    coordinator: {
      ...BASE_ROLE_ATTRIBUTES,
      canLogin: true,
      name: "identity_mail_enrollment_coordinator",
      oid: 16_387,
      ...overrides.coordinator,
    },
    schemaOwner: {
      ...BASE_ROLE_ATTRIBUTES,
      canLogin: false,
      name: "identity_mail_schema_owner",
      oid: 16_386,
      ...overrides.schemaOwner,
    },
    worker: {
      ...BASE_ROLE_ATTRIBUTES,
      canLogin: true,
      name: "identity_mail_worker_v2",
      oid: 16_388,
      ...overrides.worker,
    },
  };
}

function routine(signature, schemaOwner, oid) {
  return {
    language: "plpgsql",
    oid,
    ownerName: schemaOwner.name,
    ownerOid: schemaOwner.oid,
    parallelSafety: "u",
    returnType: "jsonb",
    searchPath: "pg_catalog",
    securityDefiner: true,
    signature,
    volatility: "v",
  };
}

function acl({
  grantor,
  grantee,
  objectIdentity,
  objectKind,
  privilege,
}) {
  return {
    grantorName: grantor.name,
    grantorOid: grantor.oid,
    granteeName: grantee.name,
    granteeOid: grantee.oid,
    isGrantable: false,
    objectIdentity,
    objectKind,
    privilege,
  };
}

function effective(role, objectKind, objectIdentity, privilege) {
  return {
    objectIdentity,
    objectKind,
    privilege,
    roleName: role.name,
    roleOid: role.oid,
  };
}

function snapshot({ database = DATABASE, roleOverrides = {}, top = {} } = {}) {
  const dutyRoles = roles(roleOverrides);
  const routines = IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.map(
    (signature, index) => routine(signature, dutyRoles.schemaOwner, 16_400 + index),
  );
  const nonOwnerRoutineAcls =
    IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.map((signature) =>
      acl({
        grantor: dutyRoles.schemaOwner,
        grantee:
          signature ===
          IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE
            ? dutyRoles.coordinator
            : dutyRoles.worker,
        objectIdentity: signature,
        objectKind: "ROUTINE",
        privilege: "EXECUTE",
      }),
    );
  const supportAcls = [
    acl({
      grantor: { name: database.ownerName, oid: database.ownerOid },
      grantee: dutyRoles.coordinator,
      objectIdentity: database.name,
      objectKind: "DATABASE",
      privilege: "CONNECT",
    }),
    acl({
      grantor: { name: database.ownerName, oid: database.ownerOid },
      grantee: dutyRoles.worker,
      objectIdentity: database.name,
      objectKind: "DATABASE",
      privilege: "CONNECT",
    }),
    acl({
      grantor: dutyRoles.schemaOwner,
      grantee: { name: "public", oid: 0 },
      objectIdentity: "public",
      objectKind: "SCHEMA",
      privilege: "USAGE",
    }),
  ];
  const effectivePrivileges = [
    effective(dutyRoles.coordinator, "DATABASE", database.name, "CONNECT"),
    effective(dutyRoles.coordinator, "SCHEMA", "public", "USAGE"),
    effective(
      dutyRoles.coordinator,
      "ROUTINE",
      IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
      "EXECUTE",
    ),
    effective(dutyRoles.worker, "DATABASE", database.name, "CONNECT"),
    effective(dutyRoles.worker, "SCHEMA", "public", "USAGE"),
    ...IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES.map((signature) =>
      effective(dutyRoles.worker, "ROUTINE", signature, "EXECUTE"),
    ),
  ];
  return {
    contract: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_CONTRACT,
    database: { ...database },
    databaseRoleSettings: [],
    defaultAcls: [],
    effectivePrivileges,
    memberships: [],
    nonOwnerRoutineAcls,
    profile: IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
    roles: dutyRoles,
    roleSettings: [],
    routines,
    schema: {
      name: "public",
      oid: SCHEMA_OID,
      ownerName: dutyRoles.schemaOwner.name,
      ownerOid: dutyRoles.schemaOwner.oid,
    },
    schemaVersion: 1,
    supportAcls,
    unexpectedDutyRoleOwnerships: [],
    ...top,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectCode(action, reasonCode) {
  assert.throws(
    action,
    (error) =>
      error instanceof IdentityMailDutyRoleGrantsCurrent185Error &&
      error.code === reasonCode &&
      error.reasonCode === reasonCode &&
      error.exitCode === 3 &&
      error.safeContractError === true,
  );
}

test("normalizes and freezes the exact two-duty-role CURRENT185 catalog", () => {
  const projection = identityMailDutyRoleGrantsCurrent185Projection(snapshot());
  assert(Object.isFrozen(projection));
  assert(Object.isFrozen(projection.roles));
  assert(Object.isFrozen(projection.roles.schemaOwner));
  assert(Object.isFrozen(projection.schema));
  assert(Object.isFrozen(projection.routines));
  assert(Object.isFrozen(projection.routines[0]));
  assert.equal(projection.routines.length, 6);
  assert.equal(projection.nonOwnerRoutineAcls.length, 6);
  assert.equal(projection.effectivePrivileges.length, 10);
  assert.equal(projection.memberships.length, 0);
  assert.match(identityMailDutyRoleGrantsCurrent185Digest(snapshot()), /^[0-9a-f]{64}$/u);
});

test("the canonical catalog digest is golden and row-order independent", () => {
  const value = snapshot();
  const digest = identityMailDutyRoleGrantsCurrent185Digest(value);
  assert.equal(
    digest,
    "c187b912e5618dcc46b384c91356f0ac8553cbfba7d7269bd1a4719cb9944484",
  );
  for (const key of [
    "effectivePrivileges",
    "nonOwnerRoutineAcls",
    "routines",
    "supportAcls",
  ]) {
    const reordered = clone(value);
    reordered[key].reverse();
    assert.equal(identityMailDutyRoleGrantsCurrent185Digest(reordered), digest);
  }
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DIGEST_DOMAIN,
    "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_V1",
  );
});

test("database identity and role/OID recreation change the signed digest", () => {
  const baseline = identityMailDutyRoleGrantsCurrent185Digest(snapshot());
  const otherDatabase = {
    ...DATABASE,
    identityDigest: "2".repeat(64),
    oid: DATABASE.oid + 100,
  };
  assert.notEqual(
    identityMailDutyRoleGrantsCurrent185Digest(
      snapshot({ database: otherDatabase }),
    ),
    baseline,
  );
  assert.notEqual(
    identityMailDutyRoleGrantsCurrent185Digest(
      snapshot({ roleOverrides: { worker: { oid: 20_000 } } }),
    ),
    baseline,
  );
  const recreatedRoutine = snapshot();
  recreatedRoutine.routines[0].oid += 1_000;
  assert.notEqual(
    identityMailDutyRoleGrantsCurrent185Digest(recreatedRoutine),
    baseline,
  );
  const recreatedSchema = snapshot();
  recreatedSchema.schema.oid += 1_000;
  assert.notEqual(
    identityMailDutyRoleGrantsCurrent185Digest(recreatedSchema),
    baseline,
  );
});

test("role attributes and topology fail closed", () => {
  for (const roleOverrides of [
    { coordinator: { superuser: true } },
    { coordinator: { inherit: true } },
    { coordinator: { canLogin: false } },
    { coordinator: { validUntil: "2026-08-03T00:00:00.000Z" } },
    { schemaOwner: { canLogin: true } },
    { worker: { bypassRls: true } },
    { worker: { createRole: true } },
    { worker: { connectionLimit: 4 } },
  ]) {
    expectCode(
      () =>
        identityMailDutyRoleGrantsCurrent185Projection(
          snapshot({ roleOverrides }),
        ),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID",
    );
  }
  for (const roleOverrides of [
    { worker: { name: "identity_mail_enrollment_coordinator" } },
    { worker: { oid: 16_387 } },
    { coordinator: { name: DATABASE.ownerName } },
    { coordinator: { oid: DATABASE.ownerOid } },
    { schemaOwner: { name: DATABASE.ownerName } },
    { schemaOwner: { oid: DATABASE.ownerOid } },
  ]) {
    expectCode(
      () =>
        identityMailDutyRoleGrantsCurrent185Projection(
          snapshot({ roleOverrides }),
        ),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_TOPOLOGY_INVALID",
    );
  }

  for (const ownerName of ["public", "none", "postgres", "current_user"]) {
    expectCode(
      () =>
        identityMailDutyRoleGrantsCurrent185Projection(
          snapshot({ database: { ...DATABASE, ownerName } }),
        ),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DATABASE_INVALID",
    );
  }
});

test("public schema identity and schema-owner pair are exact", () => {
  for (const schemaMutation of [
    { name: "identity_mail" },
    { oid: 0 },
    { ownerName: "other_owner" },
    { ownerOid: 30_000 },
  ]) {
    const value = snapshot();
    Object.assign(value.schema, schemaMutation);
    expectCode(
      () => identityMailDutyRoleGrantsCurrent185Projection(value),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SCHEMA_INVALID",
    );
  }
});

test("membership, settings, duty ownership and default ACL are all forbidden", () => {
  for (const [key, code] of [
    [
      "memberships",
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_MEMBERSHIP_FORBIDDEN",
    ],
    [
      "roleSettings",
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_SETTING_FORBIDDEN",
    ],
    [
      "databaseRoleSettings",
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DATABASE_ROLE_SETTING_FORBIDDEN",
    ],
    [
      "unexpectedDutyRoleOwnerships",
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_OWNERSHIP_FORBIDDEN",
    ],
    [
      "defaultAcls",
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DEFAULT_ACL_FORBIDDEN",
    ],
  ]) {
    expectCode(
      () =>
        identityMailDutyRoleGrantsCurrent185Projection(
          snapshot({ top: { [key]: [{ drift: true }] } }),
        ),
      code,
    );
  }
});

test("routine identity and security properties are exact", () => {
  for (const [field, value] of [
    ["ownerOid", 99_999],
    ["ownerName", "other_owner"],
    ["securityDefiner", false],
    ["volatility", "s"],
    ["parallelSafety", "s"],
    ["language", "sql"],
    ["returnType", "text"],
    ["searchPath", "public"],
    ["oid", 0],
  ]) {
    const valueSnapshot = snapshot();
    valueSnapshot.routines[0][field] = value;
    expectCode(
      () => identityMailDutyRoleGrantsCurrent185Projection(valueSnapshot),
      field === "ownerOid" || field === "ownerName"
        ? "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_SURFACE_MISMATCH"
        : "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
    );
  }
  const missing = snapshot();
  missing.routines.pop();
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(missing),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );
  const extra = snapshot();
  extra.routines.push({ ...extra.routines[0] });
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(extra),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );

  const duplicateSignature = snapshot();
  duplicateSignature.routines[1].signature =
    duplicateSignature.routines[0].signature;
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(duplicateSignature),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_SURFACE_MISMATCH",
  );
  const duplicateOid = snapshot();
  duplicateOid.routines[1].oid = duplicateOid.routines[0].oid;
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(duplicateOid),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_SURFACE_MISMATCH",
  );
});

test("routine ACL rejects PUBLIC, extra grantee, wrong grantor and grant option", () => {
  for (const mutate of [
    (row) => Object.assign(row, { granteeName: "public", granteeOid: 0 }),
    (row) => Object.assign(row, { granteeName: "other_role", granteeOid: 30_000 }),
    (row) => Object.assign(row, { grantorName: "other_owner", grantorOid: 30_001 }),
    (row) => Object.assign(row, { isGrantable: true }),
  ]) {
    const value = snapshot();
    mutate(value.nonOwnerRoutineAcls[0]);
    expectCode(
      () => identityMailDutyRoleGrantsCurrent185Projection(value),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_ACL_MISMATCH",
    );
  }
  const extra = snapshot();
  extra.nonOwnerRoutineAcls.push({
    ...extra.nonOwnerRoutineAcls[0],
    granteeName: "other_role",
    granteeOid: 30_000,
  });
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(extra),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_ACL_INVALID",
  );
});

test("database/schema support ACL and effective least privilege are exact", () => {
  const supportDrift = snapshot();
  supportDrift.supportAcls[0].isGrantable = true;
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(supportDrift),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SUPPORT_ACL_MISMATCH",
  );
  const missingSupport = snapshot();
  missingSupport.supportAcls.pop();
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(missingSupport),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SUPPORT_ACL_INVALID",
  );
  for (const extraPrivilege of [
    effective(roles().worker, "DATABASE", DATABASE.name, "TEMPORARY"),
    effective(roles().worker, "RELATION", 'public."User"', "SELECT"),
    effective(roles().worker, "COLUMN", 'public."User"."email"', "SELECT"),
    effective(roles().worker, "SEQUENCE", 'public."User_id_seq"', "USAGE"),
    effective(roles().worker, "TYPE", 'public."UserRole"', "USAGE"),
    effective(
      roles().coordinator,
      "ROUTINE",
      IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES[0],
      "EXECUTE",
    ),
  ]) {
    const value = snapshot();
    value.effectivePrivileges.push(extraPrivilege);
    expectCode(
      () => identityMailDutyRoleGrantsCurrent185Projection(value),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_EFFECTIVE_PRIVILEGE_INVALID",
    );
  }
});

test("worker and coordinator RPC allowlists are mutually exclusive and exact", () => {
  assert.equal(IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES.length, 5);
  assert.equal(IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.length, 6);
  assert.equal(
    IDENTITY_MAIL_WORKER_V2_CURRENT184_RPC_SIGNATURES.includes(
      IDENTITY_MAIL_ENROLLMENT_COORDINATOR_CURRENT185_RPC_SIGNATURE,
    ),
    false,
  );
  for (const forbidden of [
    "reconcile_v2",
    "current183",
    "_v1",
    "accept_command_v2",
    "import",
  ]) {
    assert.equal(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT185_RPC_SIGNATURES.some((signature) =>
        signature.includes(forbidden),
      ),
      false,
    );
  }

  for (const forbiddenSignature of [
    'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
    'public."identity_initial_owner_mail_provider_mark_current183"(text,text,integer,text,text,text,text,text)',
    'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
    'public."identity_mail_tenant_enrollment_import"(jsonb)',
  ]) {
    const value = snapshot();
    value.routines[0].signature = forbiddenSignature;
    expectCode(
      () => identityMailDutyRoleGrantsCurrent185Projection(value),
      "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
    );
  }
});

test("extra, inherited, accessor, symbol, proxy, sparse and duplicate shapes fail", () => {
  const extra = snapshot();
  extra.extra = true;
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(extra),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SNAPSHOT_INVALID",
  );
  const inherited = snapshot();
  Object.setPrototypeOf(inherited.database, { inherited: true });
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(inherited),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_DATABASE_INVALID",
  );
  const accessor = snapshot();
  let accessorObserved = false;
  Object.defineProperty(accessor.roles.worker, "oid", {
    enumerable: true,
    get() {
      accessorObserved = true;
      return 16_388;
    },
  });
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(accessor),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID",
  );
  assert.equal(accessorObserved, false);
  const symbol = snapshot();
  symbol.roles[Symbol("extra")] = true;
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(symbol),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID",
  );
  const proxied = snapshot();
  proxied.routines = new Proxy(proxied.routines, {
    ownKeys() {
      throw new Error("hostile ownKeys");
    },
  });
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(proxied),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );
  const transparentRootProxy = new Proxy(snapshot(), {});
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(transparentRootProxy),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_SNAPSHOT_INVALID",
  );
  const transparentNestedProxy = snapshot();
  transparentNestedProxy.roles.worker = new Proxy(
    transparentNestedProxy.roles.worker,
    {},
  );
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(transparentNestedProxy),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROLE_INVALID",
  );
  const transparentArrayProxy = snapshot();
  transparentArrayProxy.routines = new Proxy(transparentArrayProxy.routines, {});
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(transparentArrayProxy),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );
  const revokedArrayProxy = snapshot();
  const revocable = Proxy.revocable(revokedArrayProxy.routines, {});
  revokedArrayProxy.routines = revocable.proxy;
  revocable.revoke();
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(revokedArrayProxy),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );
  const oversized = snapshot();
  oversized.routines.length = 1_000_000;
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(oversized),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );
  const sparse = snapshot();
  delete sparse.effectivePrivileges[0];
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(sparse),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_EFFECTIVE_PRIVILEGE_INVALID",
  );
  const duplicate = snapshot();
  duplicate.routines.push({ ...duplicate.routines[0] });
  expectCode(
    () => identityMailDutyRoleGrantsCurrent185Projection(duplicate),
    "IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_ROUTINE_INVALID",
  );
});

test("the grants catalog is pure and has no database, env, signing-root or runtime wiring", async () => {
  const source = await readFile(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "identity-mail-duty-role-grants-current185.mjs",
    ),
    "utf8",
  );
  assert.equal([...source.matchAll(/^\s*import\b/gmu)].length, 3);
  assert.match(source, /from "node:crypto";/u);
  assert.match(source, /from "node:util";/u);
  assert.match(
    source,
    /from "\.\/staff-task-integrity-canonical-json\.mjs";/u,
  );
  assert.doesNotMatch(
    source,
    /@prisma|PrismaClient|@nestjs|process\.|DATABASE_URL|\$queryRaw|\$executeRaw|fetch\s*\(|node:https?|PINNED_.*ROOT/iu,
  );
  assert.doesNotMatch(source, /^\s*(?:GRANT|REVOKE)\s/imu);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
  IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_DIGEST_DOMAIN,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_DEFINITION_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_RELATION_PRIVILEGES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMNS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_USER_ROUTINE_DEFINITION_CURRENT186_DIGEST_DOMAIN,
  buildIdentityMailDutyRoleCatalogCurrent186ReadRequest,
  identityMailDutyRoleCatalogCurrent186Digest,
  identityMailDutyRoleDefinitionManifestCurrent186Digest,
  identityMailDutyRoleCatalogCurrent186GrantsProjection,
  identityMailDutyRoleCatalogCurrent186Target,
  identityMailDutyRoleCatalogCurrent186TargetDigests,
  inspectIdentityMailDutyRoleCatalogCurrent186,
  inspectIdentityMailDutyRoleCatalogCurrent186Safety,
  inspectIdentityMailDutyRoleContainmentCurrent186,
  normalizeIdentityMailDutyRoleCatalogCurrent186,
  readIdentityMailDutyRoleCatalogCurrent186FromPostgres,
} from "./identity-mail-duty-role-catalog-current186.mjs";
import {
  IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
  identityMailDutyRoleGrantsCurrent185Digest,
  identityMailDutyRoleGrantsCurrent185Projection,
} from "./identity-mail-duty-role-grants-current185.mjs";
import {
  identityMailDutyRoleCatalogCurrent186Fixture,
  identityMailDutyRoleCatalogCurrent186TargetFixture,
} from "./identity-mail-duty-role-current186-fixture.mjs";

const DIGEST = "a".repeat(64);
const DIRECT_DUTY_ACL_DIGEST_DOMAIN =
  "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_DIRECT_DUTY_ACL_CURRENT186_V1";
const SUPPORT_ROUTINE_IDENTITY = 'public."identity_email_claim_lock_v1"(text)';
const QUOTED_BYSTANDER_NAME = 'Outside "QA" Operator';
const QUOTED_BYSTANDER_OID = 8_888;
const EXPECTED_SUPPORT_SELECT_COLUMN_IDENTITIES = Object.freeze([
  'public."SharedBetaRuntimeReleaseMarker"."id"',
  'public."SharedBetaRuntimeReleaseMarker"."payloadDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."databaseIdentityDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."actualContextDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."schemaHead"',
  'public."SharedBetaRuntimeReleaseMarker"."migrationCount"',
  'public."SharedBetaRuntimeReleaseMarker"."migrationManifestDigest"',
  'public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleName"',
  'public."SharedBetaRuntimeReleaseMarker"."coordinatorRoleOid"',
  'public."SharedBetaRuntimeReleaseMarker"."stateRevision"',
  'public."SharedBetaRuntimeReleaseMarker"."revokedAt"',
  'public."SharedBetaRuntimeReleaseMarker"."validUntil"',
  'public."Tenant"."id"',
  'public."Tenant"."status"',
  'public."Tenant"."customerStage"',
  'public."Tenant"."onboardingStatus"',
  'public."Tenant"."trialStartsAt"',
  'public."Tenant"."trialEndsAt"',
  'public."UserInvite"."id"',
  'public."UserInvite"."tenantId"',
  'public."UserInvite"."email"',
  'public."UserInvite"."identityClaimRevision"',
  'public."UserInvite"."tokenHash"',
  'public."UserInvite"."acceptedAt"',
  'public."UserInvite"."revokedAt"',
  'public."UserInvite"."expiresAt"',
  'public."UserInvite"."role"',
  'public."UserInvite"."accessScope"',
  'public."UserInvite"."customRoleId"',
  'public."UserInvite"."storeIds"',
  'public."IdentityEmailClaim"."emailCanonical"',
  'public."IdentityEmailClaim"."tenantId"',
  'public."IdentityEmailClaim"."claimType"',
  'public."IdentityEmailClaim"."subjectId"',
  'public."IdentityEmailClaim"."revision"',
]);
const EXPECTED_SUPPORT_UPDATE_COLUMN_IDENTITIES = Object.freeze([
  'public."Tenant"."id"',
  'public."UserInvite"."id"',
  'public."IdentityEmailClaim"."emailCanonical"',
  'public."IdentityMailDeliveryEvent"."id"',
]);
const EXPECTED_SUPPORT_COLUMN_PRIVILEGES = Object.freeze([
  ...EXPECTED_SUPPORT_SELECT_COLUMN_IDENTITIES.map((objectIdentity) => ({
    objectIdentity,
    privilege: "SELECT",
  })),
  ...EXPECTED_SUPPORT_UPDATE_COLUMN_IDENTITIES.map((objectIdentity) => ({
    objectIdentity,
    privilege: "UPDATE",
  })),
]);
const EXPECTED_SUPPORT_RELATION_IDENTITIES = Object.freeze([
  'public."IdentityEmailClaim"',
  'public."IdentityMailDeliveryEvent"',
  'public."SharedBetaRuntimeReleaseMarker"',
  'public."Tenant"',
  'public."UserInvite"',
]);
const EXPECTED_SUPPORT_ONLY_RELATION_IDENTITIES = Object.freeze([
  'public."IdentityEmailClaim"',
  'public."SharedBetaRuntimeReleaseMarker"',
  'public."Tenant"',
  'public."UserInvite"',
]);
const EXPECTED_DEFINITION_RELATION_IDENTITIES = Object.freeze(
  [
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CONTROL_RELATIONS,
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_UNDERLYING_RELATIONS,
  ].sort(compareTextC),
);
const EXPECTED_PROTECTED_RELATION_IDENTITIES = Object.freeze(
  [
    ...EXPECTED_DEFINITION_RELATION_IDENTITIES,
    ...EXPECTED_SUPPORT_ONLY_RELATION_IDENTITIES,
  ].sort(compareTextC),
);
const EXPECTED_SUPPORT_RELATION_PRIVILEGES = new Set(
  EXPECTED_SUPPORT_COLUMN_PRIVILEGES.map(
    (entry) =>
      `${entry.objectIdentity.slice(0, entry.objectIdentity.lastIndexOf("."))}\n${entry.privilege}`,
  ),
);

function isSupportRelationPrivilege(objectIdentity, privilege) {
  return EXPECTED_SUPPORT_RELATION_PRIVILEGES.has(
    `${objectIdentity}\n${privilege}`,
  );
}

function compareTextC(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function aclRichSupportBeforeImage() {
  const catalog = identityMailDutyRoleCatalogCurrent186Fixture();
  const relationGrants = [
    {
      granteeName: "public",
      granteeOid: 0,
      grantorName: catalog.database.ownerName,
      grantorOid: catalog.database.ownerOid,
      identity: 'public."SharedBetaRuntimeReleaseMarker"',
      isGrantable: false,
      privilege: "SELECT",
    },
    {
      granteeName: QUOTED_BYSTANDER_NAME,
      granteeOid: QUOTED_BYSTANDER_OID,
      grantorName: catalog.database.ownerName,
      grantorOid: catalog.database.ownerOid,
      identity: 'public."IdentityEmailClaim"',
      isGrantable: false,
      privilege: "UPDATE",
    },
  ];
  for (const { identity, ...entry } of relationGrants) {
    const relation = catalog.objects.find(
      (object) => object.kind === "RELATION" && object.identity === identity,
    );
    assert.ok(relation, identity);
    relation.acls.push(structuredClone(entry));
  }
  const columnGrants = [
    {
      granteeName: "public",
      granteeOid: 0,
      grantorName: catalog.database.ownerName,
      grantorOid: catalog.database.ownerOid,
      isGrantable: false,
      objectIdentity: 'public."Tenant"."id"',
      objectKind: "COLUMN",
      privilege: "SELECT",
      source: "ACL",
    },
    {
      granteeName: QUOTED_BYSTANDER_NAME,
      granteeOid: QUOTED_BYSTANDER_OID,
      grantorName: catalog.database.ownerName,
      grantorOid: catalog.database.ownerOid,
      isGrantable: true,
      objectIdentity: 'public."UserInvite"."id"',
      objectKind: "COLUMN",
      privilege: "UPDATE",
      source: "ACL",
    },
  ];
  catalog.directAuthorities.push(...columnGrants);
  return { catalog, columnGrants, relationGrants };
}

function directDutyAclDigestModel(rows) {
  const body = rows
    .map((entry) => ({
      grantable: entry.isGrantable,
      granteeOid: entry.granteeOid,
      grantorOid: entry.grantorOid,
      identity: entry.objectIdentity,
      kind: entry.objectKind,
      privilege: entry.privilege,
    }))
    .sort(
      (left, right) =>
        compareTextC(left.kind, right.kind) ||
        compareTextC(left.identity, right.identity) ||
        left.grantorOid - right.grantorOid ||
        left.granteeOid - right.granteeOid ||
        compareTextC(left.privilege, right.privilege) ||
        Number(left.grantable) - Number(right.grantable),
    )
    .map(
      (entry) =>
        `${entry.kind}|${entry.identity}|${entry.grantorOid}|${entry.granteeOid}|${entry.privilege}|${String(entry.grantable)}`,
    )
    .join("\n");
  return createHash("sha256")
    .update(`${DIRECT_DUTY_ACL_DIGEST_DOMAIN}\n${body}\n`, "utf8")
    .digest("hex");
}

test("CURRENT186 definition digest uses the PostgreSQL kind/identity order", () => {
  const rows = [
    {
      definitionSha256: "0".repeat(64),
      identity: "trigger_z",
      kind: "TRIGGER",
    },
    {
      definitionSha256: "f".repeat(64),
      identity: "routine_a",
      kind: "ROUTINE",
    },
  ];
  const body = [rows[1], rows[0]]
    .map((entry) => `${entry.kind}|${entry.identity}|${entry.definitionSha256}`)
    .join("\n");
  const expected = createHash("sha256")
    .update(
      `${IDENTITY_MAIL_DUTY_ROLE_DEFINITION_MANIFEST_CURRENT186_DIGEST_DOMAIN}\n${body}\n`,
      "utf8",
    )
    .digest("hex");
  assert.equal(
    identityMailDutyRoleDefinitionManifestCurrent186Digest(rows),
    expected,
  );
  assert.equal(
    identityMailDutyRoleDefinitionManifestCurrent186Digest([...rows].reverse()),
    expected,
  );
});

test("CURRENT186 target is an exact 38-object, 52-effective-privilege boundary", () => {
  const before = identityMailDutyRoleCatalogCurrent186Fixture();
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  const inspection = inspectIdentityMailDutyRoleCatalogCurrent186(target);
  assert.equal(target.objects.length, 38);
  assert.equal(target.dutyRoutines.length, 6);
  assert.equal(target.effectivePrivileges.length, 52);
  assert.equal(inspection.compliant, true);
  assert.deepEqual(inspection.findings, []);
  assert.equal(target.publicRoutineAcls.length, 0);
  assert.equal(
    target.userRoutineDefinitionCount,
    before.userRoutineDefinitionCount,
  );
  assert.equal(
    target.userRoutineDefinitionDigest,
    before.userRoutineDefinitionDigest,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS,
    EXPECTED_DEFINITION_RELATION_IDENTITIES,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS,
    EXPECTED_PROTECTED_RELATION_IDENTITIES,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES,
    EXPECTED_SUPPORT_RELATION_IDENTITIES,
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.length,
    36,
  );
  assert.equal(target.supportColumnBindings.length, 36);
  assert.deepEqual(
    target.objects
      .filter((entry) => entry.kind === "RELATION")
      .map((entry) => entry.identity)
      .sort(compareTextC),
    EXPECTED_PROTECTED_RELATION_IDENTITIES,
  );
  assert.equal(EXPECTED_PROTECTED_RELATION_IDENTITIES.length, 13);
  assert.equal(EXPECTED_DEFINITION_RELATION_IDENTITIES.length, 9);
  for (const identity of EXPECTED_SUPPORT_ONLY_RELATION_IDENTITIES) {
    const relation = target.objects.find(
      (entry) => entry.kind === "RELATION" && entry.identity === identity,
    );
    assert.ok(relation, identity);
    assert.equal(relation.ownerName, target.database.ownerName, identity);
    assert.equal(relation.ownerOid, target.database.ownerOid, identity);
    assert.deepEqual(relation.acls, [], identity);
    assert.equal(
      target.definitionManifest.some((entry) =>
        entry.identity.startsWith(`${identity}::`),
      ),
      false,
      identity,
    );
  }
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES.length,
    22,
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_DEFINITION_IDENTITIES.length,
    22,
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES.length,
    23,
  );
  assert.ok(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES.includes(
      SUPPORT_ROUTINE_IDENTITY,
    ),
  );
  assert.ok(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES.includes(
      'public."identity_mail_duty_role_acl_epoch_append_v1"(text,text,text)',
    ),
  );
  assert.ok(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_DEFINITION_IDENTITIES.includes(
      "public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)",
    ),
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_ROUTINE_SIGNATURES.some(
      (signature) =>
        signature ===
        'public."identity_mail_duty_role_acl_epoch_append_v1"(text,text)',
    ),
    false,
  );
  assert.equal(
    target.objects.filter(
      (entry) =>
        entry.kind === "ROUTINE" &&
        entry.identity ===
          'public."identity_mail_duty_role_acl_epoch_append_v1"(text,text,text)',
    ).length,
    1,
  );
  assert.equal(
    target.definitionManifest.filter(
      (entry) =>
        entry.kind === "ROUTINE" &&
        entry.identity ===
          "public.identity_mail_duty_role_acl_epoch_append_v1(text,text,text)",
    ).length,
    1,
  );
  assert.equal(
    target.objects
      .flatMap((entry) =>
        entry.acls.map((acl) => ({ identity: entry.identity, ...acl })),
      )
      .filter((entry) => entry.granteeOid === target.roles.schemaOwner.oid)
      .length,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_OWNER_RELATION_PRIVILEGES.length + 1,
  );
  const database = target.objects.find((entry) => entry.kind === "DATABASE");
  const schema = target.objects.find((entry) => entry.kind === "SCHEMA");
  assert.deepEqual(
    database.acls.map((entry) => entry.granteeName).sort(),
    [
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator,
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker,
    ].sort(),
  );
  assert.deepEqual(
    schema.acls.map((entry) => entry.granteeName),
    ["public"],
  );
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY,
    'public."SharedBetaRuntimeReleaseMarker"',
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMNS,
    [
      "id",
      "payloadDigest",
      "databaseIdentityDigest",
      "actualContextDigest",
      "schemaHead",
      "migrationCount",
      "migrationManifestDigest",
      "coordinatorRoleName",
      "coordinatorRoleOid",
    ],
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMN_IDENTITIES,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMNS.map(
      (column) =>
        `${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY}."${column}"`,
    ),
  );
  assert.equal(
    Object.isFrozen(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMNS,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_SELECT_COLUMN_IDENTITIES,
    ),
    true,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES,
    EXPECTED_SUPPORT_SELECT_COLUMN_IDENTITIES,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES,
    EXPECTED_SUPPORT_UPDATE_COLUMN_IDENTITIES,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES,
    EXPECTED_SUPPORT_COLUMN_PRIVILEGES,
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES,
    [{ objectIdentity: SUPPORT_ROUTINE_IDENTITY, privilege: "EXECUTE" }],
  );
  assert.equal(
    Object.isFrozen(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES,
    ),
    true,
  );
  assert.equal(
    Object.isFrozen(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_ROUTINE_PRIVILEGES,
    ),
    true,
  );

  const supportRoutine = target.objects.find(
    (entry) =>
      entry.kind === "ROUTINE" && entry.identity === SUPPORT_ROUTINE_IDENTITY,
  );
  assert.ok(supportRoutine);
  assert.equal(supportRoutine.ownerName, target.database.ownerName);
  assert.equal(supportRoutine.ownerOid, target.database.ownerOid);
  assert.deepEqual(supportRoutine.acls, [
    {
      granteeName: target.roles.schemaOwner.name,
      granteeOid: target.roles.schemaOwner.oid,
      grantorName: target.database.ownerName,
      grantorOid: target.database.ownerOid,
      isGrantable: false,
      privilege: "EXECUTE",
    },
  ]);
  assert.equal(
    target.publicRoutineAcls.some(
      (entry) => entry.signature === SUPPORT_ROUTINE_IDENTITY,
    ),
    false,
  );
  assert.deepEqual(
    target.effectivePrivileges.filter(
      (entry) =>
        entry.roleOid === target.roles.schemaOwner.oid &&
        entry.objectKind === "RELATION" &&
        entry.objectIdentity === 'public."IdentityMailDeliveryEvent"',
    ),
    [
      {
        objectIdentity: 'public."IdentityMailDeliveryEvent"',
        objectKind: "RELATION",
        privilege: "INSERT",
        roleName: target.roles.schemaOwner.name,
        roleOid: target.roles.schemaOwner.oid,
      },
      {
        objectIdentity: 'public."IdentityMailDeliveryEvent"',
        objectKind: "RELATION",
        privilege: "SELECT",
        roleName: target.roles.schemaOwner.name,
        roleOid: target.roles.schemaOwner.oid,
      },
    ],
  );
});

test("CURRENT186 binds the complete non-system routine definition inventory outside the ACL surface", () => {
  const catalog = identityMailDutyRoleCatalogCurrent186Fixture();
  const normalized = normalizeIdentityMailDutyRoleCatalogCurrent186(catalog);
  assert.equal(normalized.userRoutineDefinitionCount, 97);
  assert.equal(normalized.userRoutineDefinitionDigest, "9".repeat(64));

  for (const mutation of [
    { userRoutineDefinitionCount: -1 },
    { userRoutineDefinitionCount: 1.5 },
    { userRoutineDefinitionCount: Number.MAX_SAFE_INTEGER + 1 },
    { userRoutineDefinitionDigest: "z".repeat(64) },
  ]) {
    assert.throws(
      () =>
        normalizeIdentityMailDutyRoleCatalogCurrent186({
          ...structuredClone(catalog),
          ...mutation,
        }),
      /catalog is invalid/u,
    );
  }

  const drift = structuredClone(catalog);
  drift.userRoutineDefinitionDigest = "8".repeat(64);
  assert.notEqual(
    identityMailDutyRoleCatalogCurrent186Digest(drift),
    identityMailDutyRoleCatalogCurrent186Digest(catalog),
  );
});

test("CURRENT186 binds all 36 physical support columns to stable relation OIDs and attribute numbers", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  assert.deepEqual(
    target.supportColumnBindings
      .map((entry) => entry.objectIdentity)
      .sort(compareTextC),
    [...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES].sort(
      compareTextC,
    ),
  );
  assert.equal(
    new Set(target.supportColumnBindings.map((entry) => entry.objectIdentity))
      .size,
    36,
  );
  for (const binding of target.supportColumnBindings) {
    const relationIdentity =
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.find(
        (identity) => binding.objectIdentity.startsWith(`${identity}.`),
      );
    const relation = target.objects.find(
      (entry) =>
        entry.kind === "RELATION" && entry.identity === relationIdentity,
    );
    assert.ok(relation, binding.objectIdentity);
    assert.equal(binding.relationOid, relation.oid, binding.objectIdentity);
    assert.ok(binding.attributeNumber > 0, binding.objectIdentity);
  }

  const attnumDrift = structuredClone(target);
  attnumDrift.supportColumnBindings[0].attributeNumber += 100;
  const normalizedAttnumDrift =
    normalizeIdentityMailDutyRoleCatalogCurrent186(attnumDrift);
  assert.notEqual(
    identityMailDutyRoleCatalogCurrent186Digest(normalizedAttnumDrift),
    identityMailDutyRoleCatalogCurrent186Digest(target),
  );
  assert.deepEqual(
    identityMailDutyRoleCatalogCurrent186Target(normalizedAttnumDrift)
      .supportColumnBindings,
    normalizedAttnumDrift.supportColumnBindings,
  );

  const relationOidDrift = structuredClone(target);
  relationOidDrift.supportColumnBindings[0].relationOid += 1;
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(relationOidDrift),
    /catalog is invalid/u,
  );

  const identityDrift = structuredClone(target);
  identityDrift.supportColumnBindings[0].objectIdentity += "_renamed";
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(identityDrift),
    /catalog is invalid/u,
  );
});

test("CURRENT186 catalog requires the superuser database owner as session_user and current_user", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  assert.deepEqual(target.database, {
    currentUserName: target.database.ownerName,
    currentUserOid: target.database.ownerOid,
    identityDigest: "a".repeat(64),
    name: "leetplus_beta",
    oid: 91,
    ownerName: "leetplus_owner",
    ownerOid: 92,
    ownerSuperuser: true,
    sessionUserName: target.database.ownerName,
    sessionUserOid: target.database.ownerOid,
  });
  for (const mutation of [
    (catalog) => {
      catalog.database.ownerSuperuser = false;
    },
    (catalog) => {
      catalog.database.sessionUserName = catalog.roles.schemaOwner.name;
      catalog.database.sessionUserOid = catalog.roles.schemaOwner.oid;
    },
    (catalog) => {
      catalog.database.currentUserName = catalog.roles.schemaOwner.name;
      catalog.database.currentUserOid = catalog.roles.schemaOwner.oid;
    },
  ]) {
    const drift = structuredClone(target);
    mutation(drift);
    assert.throws(
      () => normalizeIdentityMailDutyRoleCatalogCurrent186(drift),
      /catalog is invalid/u,
    );
  }
});

test("CURRENT186 captures all protected table ACLs and exact support-column ACLs but target drops non-duty principals", () => {
  const fixture = aclRichSupportBeforeImage();
  const before = normalizeIdentityMailDutyRoleCatalogCurrent186(
    fixture.catalog,
  );
  for (const expected of fixture.relationGrants) {
    const relation = before.objects.find(
      (entry) =>
        entry.kind === "RELATION" && entry.identity === expected.identity,
    );
    assert.ok(relation, expected.identity);
    assert.deepEqual(
      relation.acls.find(
        (entry) =>
          entry.granteeOid === expected.granteeOid &&
          entry.privilege === expected.privilege,
      ),
      {
        granteeName: expected.granteeName,
        granteeOid: expected.granteeOid,
        grantorName: expected.grantorName,
        grantorOid: expected.grantorOid,
        isGrantable: expected.isGrantable,
        privilege: expected.privilege,
      },
    );
  }
  for (const expected of fixture.columnGrants) {
    assert.deepEqual(
      before.directAuthorities.find(
        (entry) =>
          entry.objectKind === "COLUMN" &&
          entry.objectIdentity === expected.objectIdentity &&
          entry.granteeOid === expected.granteeOid &&
          entry.privilege === expected.privilege,
      ),
      expected,
    );
  }

  const target = identityMailDutyRoleCatalogCurrent186Target(before);
  const nonDutyOids = new Set([0, QUOTED_BYSTANDER_OID]);
  assert.equal(
    target.objects.some(
      (object) =>
        object.kind === "RELATION" &&
        EXPECTED_SUPPORT_ONLY_RELATION_IDENTITIES.includes(object.identity) &&
        object.acls.some((entry) => nonDutyOids.has(entry.granteeOid)),
    ),
    false,
  );
  assert.equal(
    target.directAuthorities.some(
      (entry) =>
        nonDutyOids.has(entry.granteeOid) &&
        (EXPECTED_SUPPORT_ONLY_RELATION_IDENTITIES.includes(
          entry.objectIdentity,
        ) ||
          (entry.objectKind === "COLUMN" &&
            IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.some(
              (expected) =>
                expected.objectIdentity === entry.objectIdentity &&
                expected.privilege === entry.privilege,
            ))),
    ),
    false,
  );
  assert.equal(
    inspectIdentityMailDutyRoleCatalogCurrent186(target).compliant,
    true,
  );
});

test("CURRENT186 exact grants are byte-compatible with frozen CURRENT185 V1", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  const projection =
    identityMailDutyRoleCatalogCurrent186GrantsProjection(target);
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT186_PROFILE,
    IDENTITY_MAIL_DUTY_ROLE_GRANTS_CURRENT185_PROFILE,
  );
  assert.equal(projection.effectivePrivileges.length, 10);
  assert.equal(
    projection.effectivePrivileges.some(
      (entry) => entry.roleOid === target.roles.schemaOwner.oid,
    ),
    false,
  );
  assert.deepEqual(
    identityMailDutyRoleGrantsCurrent185Projection(projection),
    projection,
  );
  assert.equal(
    identityMailDutyRoleCatalogCurrent186TargetDigests(target)
      .exactGrantsDigest,
    identityMailDutyRoleGrantsCurrent185Digest(projection),
  );
  assert.equal(
    identityMailDutyRoleCatalogCurrent186TargetDigests(target)
      .exactGrantsDigest,
    "807a5ad636f3fc277c95e49b982ef86e4e7b40ac6fc6d921061e6ecc3ce6887d",
  );
});

test("CURRENT186 schemaOwner has exactly 35 SELECT, four UPDATE and one support EXECUTE authority", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  const expectedColumnPrivileges = [...EXPECTED_SUPPORT_COLUMN_PRIVILEGES].sort(
    (left, right) =>
      compareTextC(left.objectIdentity, right.objectIdentity) ||
      compareTextC(left.privilege, right.privilege),
  );
  const directColumns = target.directAuthorities.filter(
    (entry) =>
      entry.granteeOid === target.roles.schemaOwner.oid &&
      entry.objectKind === "COLUMN",
  );
  const effectiveColumns = target.effectivePrivileges.filter(
    (entry) =>
      entry.roleOid === target.roles.schemaOwner.oid &&
      entry.objectKind === "COLUMN",
  );
  assert.equal(directColumns.length, 39);
  assert.equal(effectiveColumns.length, 39);
  assert.equal(
    directColumns.filter((entry) => entry.privilege === "SELECT").length,
    35,
  );
  assert.equal(
    directColumns.filter((entry) => entry.privilege === "UPDATE").length,
    4,
  );
  assert.deepEqual(
    directColumns
      .map(({ objectIdentity, privilege }) => ({ objectIdentity, privilege }))
      .sort(
        (left, right) =>
          compareTextC(left.objectIdentity, right.objectIdentity) ||
          compareTextC(left.privilege, right.privilege),
      ),
    expectedColumnPrivileges,
  );
  assert.deepEqual(
    effectiveColumns
      .map(({ objectIdentity, privilege }) => ({ objectIdentity, privilege }))
      .sort(
        (left, right) =>
          compareTextC(left.objectIdentity, right.objectIdentity) ||
          compareTextC(left.privilege, right.privilege),
      ),
    expectedColumnPrivileges,
  );
  assert.equal(
    directColumns.every(
      (entry) =>
        entry.grantorName === target.database.ownerName &&
        entry.grantorOid === target.database.ownerOid &&
        entry.granteeName === target.roles.schemaOwner.name &&
        entry.granteeOid === target.roles.schemaOwner.oid &&
        ["SELECT", "UPDATE"].includes(entry.privilege) &&
        entry.isGrantable === false &&
        entry.source === "ACL",
    ),
    true,
  );
  assert.equal(
    effectiveColumns.every(
      (entry) =>
        entry.roleName === target.roles.schemaOwner.name &&
        ["SELECT", "UPDATE"].includes(entry.privilege),
    ),
    true,
  );
  const supportRelations = new Set(EXPECTED_SUPPORT_RELATION_IDENTITIES);
  assert.equal(
    target.directAuthorities.some(
      (entry) =>
        entry.granteeOid === target.roles.schemaOwner.oid &&
        entry.objectKind === "RELATION" &&
        supportRelations.has(entry.objectIdentity) &&
        isSupportRelationPrivilege(entry.objectIdentity, entry.privilege),
    ),
    false,
  );
  assert.equal(
    target.effectivePrivileges.some(
      (entry) =>
        entry.roleOid === target.roles.schemaOwner.oid &&
        entry.objectKind === "RELATION" &&
        supportRelations.has(entry.objectIdentity) &&
        isSupportRelationPrivilege(entry.objectIdentity, entry.privilege),
    ),
    false,
  );

  const directSupportRoutine = target.directAuthorities.filter(
    (entry) =>
      entry.granteeOid === target.roles.schemaOwner.oid &&
      entry.objectKind === "ROUTINE" &&
      entry.objectIdentity === SUPPORT_ROUTINE_IDENTITY,
  );
  const effectiveSupportRoutine = target.effectivePrivileges.filter(
    (entry) =>
      entry.roleOid === target.roles.schemaOwner.oid &&
      entry.objectKind === "ROUTINE" &&
      entry.objectIdentity === SUPPORT_ROUTINE_IDENTITY,
  );
  assert.deepEqual(directSupportRoutine, [
    {
      granteeName: target.roles.schemaOwner.name,
      granteeOid: target.roles.schemaOwner.oid,
      grantorName: target.database.ownerName,
      grantorOid: target.database.ownerOid,
      isGrantable: false,
      objectIdentity: SUPPORT_ROUTINE_IDENTITY,
      objectKind: "ROUTINE",
      privilege: "EXECUTE",
      source: "ACL",
    },
  ]);
  assert.deepEqual(effectiveSupportRoutine, [
    {
      objectIdentity: SUPPORT_ROUTINE_IDENTITY,
      objectKind: "ROUTINE",
      privilege: "EXECUTE",
      roleName: target.roles.schemaOwner.name,
      roleOid: target.roles.schemaOwner.oid,
    },
  ]);
});

test("CURRENT186 rejects missing, widened and incorrectly granted support access", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();

  const missingDirect = structuredClone(target);
  missingDirect.directAuthorities = missingDirect.directAuthorities.filter(
    (entry) =>
      entry.objectIdentity !==
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES.at(
        -1,
      ),
  );
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186(
      missingDirect,
    ).findings.includes("DIRECT_AUTHORITY_DRIFT"),
  );

  const missingEffective = structuredClone(target);
  missingEffective.effectivePrivileges =
    missingEffective.effectivePrivileges.filter(
      (entry) =>
        entry.objectIdentity !==
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES[9],
    );
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186(
      missingEffective,
    ).findings.includes("EFFECTIVE_PRIVILEGE_DRIFT"),
  );

  const missingUpdate = structuredClone(target);
  missingUpdate.directAuthorities = missingUpdate.directAuthorities.filter(
    (entry) =>
      !(
        entry.objectIdentity ===
          IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES[2] &&
        entry.privilege === "UPDATE"
      ),
  );
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186(
      missingUpdate,
    ).findings.includes("DIRECT_AUTHORITY_DRIFT"),
  );

  const wrongGrantor = structuredClone(target);
  const wrongGrantorEntry = wrongGrantor.directAuthorities.find(
    (entry) =>
      entry.objectIdentity ===
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES[10],
  );
  wrongGrantorEntry.grantorName = wrongGrantor.roles.worker.name;
  wrongGrantorEntry.grantorOid = wrongGrantor.roles.worker.oid;
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186(
      wrongGrantor,
    ).findings.includes("DIRECT_AUTHORITY_DRIFT"),
  );

  const extraColumnIdentity = `${IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RELEASE_MARKER_RELATION_IDENTITY}."payload"`;
  const extraColumn = structuredClone(target);
  extraColumn.directAuthorities.push({
    granteeName: extraColumn.roles.schemaOwner.name,
    granteeOid: extraColumn.roles.schemaOwner.oid,
    grantorName: extraColumn.database.ownerName,
    grantorOid: extraColumn.database.ownerOid,
    isGrantable: false,
    objectIdentity: extraColumnIdentity,
    objectKind: "COLUMN",
    privilege: "SELECT",
    source: "ACL",
  });
  extraColumn.effectivePrivileges.push({
    objectIdentity: extraColumnIdentity,
    objectKind: "COLUMN",
    privilege: "SELECT",
    roleName: extraColumn.roles.schemaOwner.name,
    roleOid: extraColumn.roles.schemaOwner.oid,
  });
  const extraColumnFindings =
    inspectIdentityMailDutyRoleCatalogCurrent186(extraColumn).findings;
  assert.ok(extraColumnFindings.includes("DIRECT_AUTHORITY_DRIFT"));
  assert.ok(extraColumnFindings.includes("EFFECTIVE_PRIVILEGE_DRIFT"));

  const supportRelations = new Set(EXPECTED_SUPPORT_RELATION_IDENTITIES);
  for (const relationIdentity of supportRelations) {
    for (const privilege of ["SELECT", "UPDATE"]) {
      if (!isSupportRelationPrivilege(relationIdentity, privilege)) continue;
      const tablePrivilege = structuredClone(target);
      tablePrivilege.directAuthorities.push({
        granteeName: tablePrivilege.roles.schemaOwner.name,
        granteeOid: tablePrivilege.roles.schemaOwner.oid,
        grantorName: tablePrivilege.database.ownerName,
        grantorOid: tablePrivilege.database.ownerOid,
        isGrantable: false,
        objectIdentity: relationIdentity,
        objectKind: "RELATION",
        privilege,
        source: "ACL",
      });
      tablePrivilege.effectivePrivileges.push({
        objectIdentity: relationIdentity,
        objectKind: "RELATION",
        privilege,
        roleName: tablePrivilege.roles.schemaOwner.name,
        roleOid: tablePrivilege.roles.schemaOwner.oid,
      });
      const tableFindings =
        inspectIdentityMailDutyRoleCatalogCurrent186(tablePrivilege).findings;
      assert.ok(
        tableFindings.includes("DIRECT_AUTHORITY_DRIFT"),
        `${relationIdentity} ${privilege}`,
      );
      assert.ok(
        tableFindings.includes("EFFECTIVE_PRIVILEGE_DRIFT"),
        `${relationIdentity} ${privilege}`,
      );
    }
  }

  const missingRoutineAcl = structuredClone(target);
  const supportRoutine = missingRoutineAcl.objects.find(
    (entry) =>
      entry.kind === "ROUTINE" && entry.identity === SUPPORT_ROUTINE_IDENTITY,
  );
  supportRoutine.acls = [];
  missingRoutineAcl.directAuthorities =
    missingRoutineAcl.directAuthorities.filter(
      (entry) => entry.objectIdentity !== SUPPORT_ROUTINE_IDENTITY,
    );
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186(
      missingRoutineAcl,
    ).findings.includes("OBJECT_OR_ACL_DRIFT"),
  );

  const grantableRoutine = structuredClone(target);
  const grantableRoutineObject = grantableRoutine.objects.find(
    (entry) =>
      entry.kind === "ROUTINE" && entry.identity === SUPPORT_ROUTINE_IDENTITY,
  );
  grantableRoutineObject.acls[0].isGrantable = true;
  grantableRoutine.directAuthorities.find(
    (entry) => entry.objectIdentity === SUPPORT_ROUTINE_IDENTITY,
  ).isGrantable = true;
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186(
      grantableRoutine,
    ).findings.includes("OBJECT_OR_ACL_DRIFT"),
  );

  for (const bystander of [
    { name: "public", oid: 0 },
    { name: "Outside QA Operator", oid: 8_888 },
  ]) {
    const bystanderRoutine = structuredClone(target);
    const routine = bystanderRoutine.objects.find(
      (entry) =>
        entry.kind === "ROUTINE" && entry.identity === SUPPORT_ROUTINE_IDENTITY,
    );
    routine.acls.push({
      granteeName: bystander.name,
      granteeOid: bystander.oid,
      grantorName: bystanderRoutine.database.ownerName,
      grantorOid: bystanderRoutine.database.ownerOid,
      isGrantable: false,
      privilege: "EXECUTE",
    });
    if (bystander.oid === 0) {
      bystanderRoutine.publicRoutineAcls.push({
        grantorName: bystanderRoutine.database.ownerName,
        grantorOid: bystanderRoutine.database.ownerOid,
        isGrantable: false,
        oid: routine.oid,
        ownerName: bystanderRoutine.database.ownerName,
        ownerOid: bystanderRoutine.database.ownerOid,
        routineKind: "f",
        signature: SUPPORT_ROUTINE_IDENTITY,
      });
    } else {
      bystanderRoutine.directAuthorities.push({
        granteeName: bystander.name,
        granteeOid: bystander.oid,
        grantorName: bystanderRoutine.database.ownerName,
        grantorOid: bystanderRoutine.database.ownerOid,
        isGrantable: false,
        objectIdentity: SUPPORT_ROUTINE_IDENTITY,
        objectKind: "ROUTINE",
        privilege: "EXECUTE",
        source: "ACL",
      });
    }
    const findings =
      inspectIdentityMailDutyRoleCatalogCurrent186(bystanderRoutine).findings;
    assert.ok(findings.includes("OBJECT_OR_ACL_DRIFT"), bystander.name);
    assert.ok(
      findings.includes(
        bystander.oid === 0
          ? "PUBLIC_ROUTINE_EXECUTE_DRIFT"
          : "DIRECT_AUTHORITY_DRIFT",
      ),
      bystander.name,
    );
  }
});

test("CURRENT186 catalog digests are order-independent and drift-sensitive", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  const reordered = structuredClone(target);
  reordered.objects.reverse();
  reordered.dutyRoutines.reverse();
  reordered.effectivePrivileges.reverse();
  assert.equal(
    identityMailDutyRoleCatalogCurrent186TargetDigests(reordered).catalogDigest,
    identityMailDutyRoleCatalogCurrent186TargetDigests(target).catalogDigest,
  );

  const roleDrift = structuredClone(target);
  roleDrift.roles.worker.canLogin = false;
  assert.deepEqual(
    inspectIdentityMailDutyRoleCatalogCurrent186(roleDrift).findings,
    ["ROLE_ATTRIBUTE_DRIFT"],
  );

  const membershipDrift = structuredClone(target);
  membershipDrift.memberships.push({ memberOid: 95, roleOid: 999 });
  assert.deepEqual(
    inspectIdentityMailDutyRoleCatalogCurrent186(membershipDrift).findings,
    ["MEMBERSHIP_DRIFT"],
  );

  const publicRoutineDrift = structuredClone(target);
  publicRoutineDrift.publicRoutineAcls.push({
    grantorName: "leetplus_owner",
    grantorOid: 92,
    isGrantable: false,
    oid: 8_000,
    ownerName: "leetplus_owner",
    ownerOid: 92,
    routineKind: "f",
    signature: 'public."unrelated_helper"(text)',
  });
  assert.deepEqual(
    inspectIdentityMailDutyRoleCatalogCurrent186(publicRoutineDrift).findings,
    ["PUBLIC_ROUTINE_EXECUTE_DRIFT"],
  );

  for (const [index, routineKind] of ["f", "p", "a", "w"].entries()) {
    const allKindDrift = structuredClone(target);
    allKindDrift.publicRoutineAcls.push({
      grantorName: "leetplus_owner",
      grantorOid: 92,
      isGrantable: false,
      oid: 8_100 + index,
      ownerName: "leetplus_owner",
      ownerOid: 92,
      routineKind,
      signature: `app_schema."unexpected_${routineKind}"(text)`,
    });
    assert.deepEqual(
      inspectIdentityMailDutyRoleCatalogCurrent186(allKindDrift).findings,
      ["PUBLIC_ROUTINE_EXECUTE_DRIFT"],
    );
  }
  const missingKind = structuredClone(publicRoutineDrift);
  delete missingKind.publicRoutineAcls[0].routineKind;
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(missingKind),
    /catalog is invalid/u,
  );
});

test("CURRENT186 canonicalizes non-empty membership, setting and default-ACL rows", () => {
  const observed = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  observed.memberships = [
    {
      adminOption: true,
      memberName: observed.roles.worker.name,
      memberOid: observed.roles.worker.oid,
      roleName: "zeta_parent",
      roleOid: 8_902,
    },
    {
      adminOption: false,
      memberName: observed.roles.coordinator.name,
      memberOid: observed.roles.coordinator.oid,
      roleName: "alpha_parent",
      roleOid: 8_901,
    },
  ];
  observed.roleSettings = [
    { databaseOid: 0, roleOid: observed.roles.worker.oid, settings: ["z=2"] },
    {
      databaseOid: 0,
      roleOid: observed.roles.coordinator.oid,
      settings: ["a=1"],
    },
  ];
  observed.databaseRoleSettings = [
    {
      databaseOid: observed.database.oid,
      roleOid: observed.roles.worker.oid,
      settings: ["z=2"],
    },
    {
      databaseOid: observed.database.oid,
      roleOid: observed.roles.coordinator.oid,
      settings: ["a=1"],
    },
  ];
  observed.defaultAcls = [
    {
      acl: `{${observed.roles.worker.name}=r/${observed.database.ownerName}}`,
      namespaceOid: 2_202,
      objectKind: "r",
      ownerOid: observed.roles.schemaOwner.oid,
    },
    {
      acl: `{${observed.roles.coordinator.name}=X/${observed.database.ownerName}}`,
      namespaceOid: 2_201,
      objectKind: "f",
      ownerOid: observed.database.ownerOid,
    },
  ];
  const reversed = structuredClone(observed);
  for (const key of [
    "memberships",
    "roleSettings",
    "databaseRoleSettings",
    "defaultAcls",
  ]) {
    reversed[key].reverse();
  }

  assert.deepEqual(
    normalizeIdentityMailDutyRoleCatalogCurrent186(reversed),
    normalizeIdentityMailDutyRoleCatalogCurrent186(observed),
  );
  assert.equal(
    identityMailDutyRoleCatalogCurrent186Digest(reversed),
    identityMailDutyRoleCatalogCurrent186Digest(observed),
  );
  for (const key of [
    "memberships",
    "roleSettings",
    "databaseRoleSettings",
    "defaultAcls",
  ]) {
    const normalized = normalizeIdentityMailDutyRoleCatalogCurrent186(observed);
    assert.deepEqual(
      normalized[key],
      [...normalized[key]].sort((left, right) =>
        compareTextC(JSON.stringify(left), JSON.stringify(right)),
      ),
    );
  }
});

test("CURRENT186 direct-duty digest uses exact forced-quoted identities", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  const dutyRoleOids = new Set(
    Object.values(target.roles).map((role) => role.oid),
  );
  const directRows = target.directAuthorities.filter((entry) =>
    dutyRoleOids.has(entry.granteeOid),
  );
  const objectRows = target.objects.flatMap((object) =>
    object.acls
      .filter((entry) => dutyRoleOids.has(entry.granteeOid))
      .map((entry) => ({
        ...entry,
        objectIdentity: object.identity,
        objectKind: object.kind,
      })),
  );
  const expectedColumnRows =
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES.map(
      ({ objectIdentity, privilege }) => ({
        granteeName: target.roles.schemaOwner.name,
        granteeOid: target.roles.schemaOwner.oid,
        grantorName: target.database.ownerName,
        grantorOid: target.database.ownerOid,
        isGrantable: false,
        objectIdentity,
        objectKind: "COLUMN",
        privilege,
      }),
    );
  assert.equal(directRows.length, 56);
  assert.ok(
    directRows.some(
      (entry) => entry.objectIdentity === 'public."_prisma_migrations"',
    ),
  );
  assert.equal(
    directRows.some(
      (entry) => entry.objectIdentity === "public._prisma_migrations",
    ),
    false,
  );
  assert.equal(
    directRows
      .filter((entry) => entry.objectKind === "ROUTINE")
      .every((entry) => /^public\."[a-z0-9_]+"\(/u.test(entry.objectIdentity)),
    true,
  );
  assert.equal(
    directDutyAclDigestModel(directRows),
    directDutyAclDigestModel([...objectRows, ...expectedColumnRows]),
  );
  assert.equal(
    directDutyAclDigestModel(directRows),
    "4bf25cf6abd5ca084abfe1dcf8c75b5b0be75e3050c32163b2f0e9c584eb931a",
  );
  assert.equal(
    directDutyAclDigestModel([...directRows].reverse()),
    directDutyAclDigestModel(directRows),
  );

  const overloaded = structuredClone(target);
  const longRoutineName = "x".repeat(63);
  const longRoutinePrefix = `pg_catalog."${longRoutineName}"`;
  for (const [index, objectIdentity] of [
    `${longRoutinePrefix}(text)`,
    `${longRoutinePrefix}(text,boolean)`,
  ].entries()) {
    overloaded.directAuthorities.push({
      granteeName: overloaded.roles.worker.name,
      granteeOid: overloaded.roles.worker.oid,
      grantorName: overloaded.database.ownerName,
      grantorOid: overloaded.database.ownerOid,
      isGrantable: false,
      objectIdentity,
      objectKind: "ROUTINE",
      privilege: "EXECUTE",
      source: "ACL",
    });
    assert.ok(objectIdentity.length > 63, String(index));
  }
  const normalizedLongRows = normalizeIdentityMailDutyRoleCatalogCurrent186(
    overloaded,
  ).directAuthorities.filter((entry) =>
    entry.objectIdentity.startsWith(longRoutinePrefix),
  );
  assert.equal(normalizedLongRows.length, 2);
  assert.equal(
    new Set(normalizedLongRows.map((entry) => entry.objectIdentity)).size,
    2,
  );
});

test("CURRENT186 containment requires NOLOGIN and exact residual authority", () => {
  const target = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  target.roles.coordinator.canLogin = false;
  target.roles.worker.canLogin = false;
  const dutyRoleOids = new Set(
    Object.values(target.roles).map((role) => role.oid),
  );
  for (const object of target.objects) {
    object.acls = object.acls.filter(
      (entry) => !dutyRoleOids.has(entry.granteeOid),
    );
  }
  target.directAuthorities = target.directAuthorities.filter(
    (entry) => !dutyRoleOids.has(entry.granteeOid),
  );
  target.effectivePrivileges = target.effectivePrivileges.filter(
    (entry) => entry.objectKind === "SCHEMA",
  );
  const inspection = inspectIdentityMailDutyRoleContainmentCurrent186(target);
  assert.equal(inspection.compliant, true);
  assert.deepEqual(inspection.findings, []);

  const routineDrift = structuredClone(target);
  routineDrift.publicRoutineAcls.push({
    grantorName: "leetplus_owner",
    grantorOid: 92,
    isGrantable: false,
    oid: 8_200,
    ownerName: "leetplus_owner",
    ownerOid: 92,
    routineKind: "p",
    signature: 'other_schema."unexpected_proc"(text)',
  });
  assert.ok(
    inspectIdentityMailDutyRoleContainmentCurrent186(
      routineDrift,
    ).findings.includes("PUBLIC_ROUTINE_EXECUTE_REMAINS"),
  );

  const schemaDrift = structuredClone(target);
  schemaDrift.objects
    .find((entry) => entry.kind === "SCHEMA")
    .acls.push({
      granteeName: "public",
      granteeOid: 0,
      grantorName: schemaDrift.roles.schemaOwner.name,
      grantorOid: schemaDrift.roles.schemaOwner.oid,
      isGrantable: false,
      privilege: "CREATE",
    });
  assert.ok(
    inspectIdentityMailDutyRoleContainmentCurrent186(
      schemaDrift,
    ).findings.includes("PUBLIC_SCHEMA_AUTHORITY_DRIFT"),
  );

  const effectiveDrift = structuredClone(target);
  effectiveDrift.effectivePrivileges.push({
    objectIdentity: "custom_schema",
    objectKind: "SCHEMA",
    privilege: "USAGE",
    roleName: effectiveDrift.roles.worker.name,
    roleOid: effectiveDrift.roles.worker.oid,
  });
  assert.ok(
    inspectIdentityMailDutyRoleContainmentCurrent186(
      effectiveDrift,
    ).findings.includes("EFFECTIVE_RUNTIME_AUTHORITY_REMAINS"),
  );

  const grantorDrift = structuredClone(target);
  const publicSchema = grantorDrift.objects.find(
    (entry) => entry.kind === "SCHEMA" && entry.identity === "public",
  );
  const publicUsage = publicSchema.acls.find(
    (entry) => entry.granteeOid === 0 && entry.privilege === "USAGE",
  );
  publicUsage.grantorName = grantorDrift.roles.worker.name;
  publicUsage.grantorOid = grantorDrift.roles.worker.oid;
  assert.ok(
    inspectIdentityMailDutyRoleContainmentCurrent186(
      grantorDrift,
    ).findings.includes("PUBLIC_SCHEMA_AUTHORITY_DRIFT"),
  );
});

test("CURRENT186 read request fixes names, OIDs and exact object identities", () => {
  const request = buildIdentityMailDutyRoleCatalogCurrent186ReadRequest({
    coordinatorRoleOid: 94,
    databaseIdentityDigest: DIGEST,
    databaseName: "leetplus_beta",
    schemaOwnerRoleOid: 93,
    workerRoleOid: 95,
  });
  assert.equal(request.expectedObjects.length, 38);
  const config = JSON.parse(request.parameters[0]);
  assert.deepEqual(
    config.roles.map((entry) => entry.name).sort(),
    Object.values(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES).sort(),
  );
  assert.equal(JSON.parse(request.parameters[1]).length, 38);
  assert.deepEqual(
    request.expectedObjects
      .filter((entry) => entry.kind === "RELATION")
      .map((entry) => entry.identity)
      .sort(compareTextC),
    EXPECTED_PROTECTED_RELATION_IDENTITIES,
  );
  assert.equal(
    request.expectedObjects.filter(
      (entry) =>
        entry.kind === "ROUTINE" &&
        entry.identity ===
          'public."identity_mail_duty_role_acl_epoch_append_v1"(text,text,text)',
    ).length,
    1,
  );
  assert.equal(
    request.expectedObjects.filter(
      (entry) =>
        entry.kind === "ROUTINE" && entry.identity === SUPPORT_ROUTINE_IDENTITY,
    ).length,
    1,
  );
});

test("CURRENT186 PostgreSQL reader executes one bounded catalog query", async () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  const calls = [];
  const result = await readIdentityMailDutyRoleCatalogCurrent186FromPostgres(
    {
      async query(sql, parameters) {
        calls.push({ parameters, sql });
        return [{ catalog: structuredClone(target) }];
      },
    },
    {
      coordinatorRoleOid: 94,
      databaseIdentityDigest: DIGEST,
      databaseName: "leetplus_beta",
      schemaOwnerRoleOid: 93,
      workerRoleOid: 95,
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].sql,
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
  );
  assert.equal(calls[0].parameters.length, 2);
  assert.deepEqual(result, target);
});

test("CURRENT186 catalog SQL and live assertion share forced-quoted ACL identities", async () => {
  const sourceStart =
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
      "direct_authority_acl_sources AS (",
    );
  const sourceEnd = IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
    "direct_authority AS (",
    sourceStart,
  );
  assert.ok(sourceStart >= 0 && sourceEnd > sourceStart);
  const catalogDirectSource =
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.slice(
      sourceStart,
      sourceEnd,
    );
  assert.match(
    catalogDirectSource,
    /database_entry\.datname::TEXT AS object_identity/u,
  );
  assert.match(
    catalogDirectSource,
    /pg_catalog\.format\('%I\."%s"', namespace_entry\.nspname,\s+pg_catalog\.replace\(relation_entry\.relname, '"', '""'\)\)/u,
  );
  assert.match(
    catalogDirectSource,
    /pg_catalog\.format\('%I\."%s"\."%s"', namespace_entry\.nspname,\s+pg_catalog\.replace\(relation_entry\.relname, '"', '""'\),\s+pg_catalog\.replace\(attribute_entry\.attname, '"', '""'\)\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /system_public_rows AS \(\s+SELECT 'SCHEMA'::TEXT AS kind, namespace_entry\.nspname::TEXT AS identity/u,
  );
  assert.match(
    catalogDirectSource,
    /pg_catalog\.format\('%I\."%s"\(%s\)', namespace_entry\.nspname,\s+pg_catalog\.replace\(routine_entry\.proname, '"', '""'\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /schema_owner_role AS \([\s\S]*WHERE expected\."roleKey" = 'schemaOwner'[\s\S]*support_relations AS \([\s\S]*\('public\."IdentityEmailClaim"'::TEXT\)[\s\S]*\('public\."IdentityMailDeliveryEvent"'::TEXT\)[\s\S]*\('public\."SharedBetaRuntimeReleaseMarker"'::TEXT\)[\s\S]*\('public\."Tenant"'::TEXT\)[\s\S]*\('public\."UserInvite"'::TEXT\)[\s\S]*to_regclass\(\s*expected\.relation_identity\s*\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /FROM schema_owner_role AS role_entry\s+CROSS JOIN support_relations AS relation_entry\s+INNER JOIN pg_catalog\.pg_attribute AS attribute_entry[\s\S]*pg_catalog\.has_column_privilege\([\s\S]*AND NOT pg_catalog\.has_table_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /support_routines AS \([\s\S]*\('public\."identity_email_claim_lock_v1"\(text\)'::TEXT, 'EXECUTE'::TEXT\)[\s\S]*routine_entry\.oid = pg_catalog\.to_regprocedure\(\s*expected\.routine_identity\s*\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /FROM schema_owner_role AS role_entry\s+CROSS JOIN support_routines AS routine_entry\s+WHERE pg_catalog\.has_function_privilege\(\s*role_entry\.oid, routine_entry\.oid, routine_entry\.privilege\s*\)/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /FROM schema_owner_role AS role_entry\s+CROSS JOIN support_relations AS relation_entry\s+CROSS JOIN \(VALUES\s+\('SELECT'\), \('INSERT'\), \('UPDATE'\), \('DELETE'\), \('TRUNCATE'\),\s+\('REFERENCES'\), \('TRIGGER'\)\s+\) AS candidate\(privilege\)\s+WHERE pg_catalog\.has_table_privilege/u,
  );
  assert.ok(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.includes(
      `('public."IdentityMailDeliveryEvent"'::TEXT)`,
    ),
  );

  const migration = await readFile(
    new URL(
      "../migration-candidates/20260803010000_identity_mail_duty_role_runtime_boundary_v2/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    migration,
    /public\.identity_mail_duty_role_acl_epoch_append_v1\(text,text,text\)/u,
  );
  assert.doesNotMatch(
    migration,
    /public\.identity_mail_duty_role_acl_epoch_append_v1\(text,text\)(?!,text)/u,
  );
  const liveAssertStart = migration.indexOf(
    "actual(kind, identity, grantor_oid, grantee_oid, privilege, grantable) AS (",
  );
  const liveAssertEnd = migration.indexOf(
    "INTO direct_acl_drift, observed_direct_duty_acl_digest;",
    liveAssertStart,
  );
  assert.ok(liveAssertStart >= 0 && liveAssertEnd > liveAssertStart);
  const directAclAssertion = migration.slice(liveAssertStart, liveAssertEnd);
  assert.match(
    directAclAssertion,
    /'DATABASE', database_entry\.datname::TEXT, acl\.grantor/u,
  );
  assert.match(
    directAclAssertion,
    /pg_catalog\.format\(\s+'%I\."%s"', namespace\.nspname,\s+pg_catalog\.replace\(relation\.relname, '"', '""'\)\s+\)/u,
  );
  assert.match(
    directAclAssertion,
    /pg_catalog\.format\(\s+'%I\."%s"\(%s\)', namespace\.nspname,\s+pg_catalog\.replace\(routine\.proname, '"', '""'\)/u,
  );
  assert.match(
    directAclAssertion,
    /\('public\."_prisma_migrations"'::TEXT, 'SELECT'::TEXT\)/u,
  );
  assert.doesNotMatch(
    directAclAssertion,
    /\('public\._prisma_migrations'::TEXT, 'SELECT'::TEXT\)/u,
  );
  for (const {
    objectIdentity,
    privilege,
  } of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_PRIVILEGES) {
    assert.ok(
      directAclAssertion.includes(
        `('${objectIdentity}'::TEXT, '${privilege}'::TEXT)`,
      ),
      `${objectIdentity} ${privilege}`,
    );
  }
  for (const relationIdentity of EXPECTED_SUPPORT_RELATION_IDENTITIES) {
    for (const privilege of ["SELECT", "UPDATE"]) {
      if (!isSupportRelationPrivilege(relationIdentity, privilege)) continue;
      assert.equal(
        directAclAssertion.includes(
          `('${relationIdentity}'::TEXT, '${privilege}'::TEXT)`,
        ),
        false,
        `${relationIdentity} ${privilege}`,
      );
    }
  }
  for (const signature of identityMailDutyRoleCatalogCurrent186TargetFixture().dutyRoutines.map(
    (entry) => entry.signature,
  )) {
    assert.ok(directAclAssertion.includes(`('${signature}'::TEXT`), signature);
  }
  assert.match(
    directAclAssertion,
    /'ROUTINE',\s+'public\."identity_email_claim_lock_v1"\(text\)'::TEXT,\s+p_deployment_role_oid::OID, p_schema_owner_role_oid::OID,\s+'EXECUTE', false/u,
  );
  assert.doesNotMatch(
    directAclAssertion,
    /identity_email_claim_lock_v1"\(text\)'::TEXT[^\n]*(?:0::OID|p_coordinator_role_oid|p_worker_role_oid|true)/u,
  );

  const protectedSurfaceStart = migration.indexOf(
    "-- The duty-role scan above proves that none of the three bounded roles has",
  );
  const protectedSurfaceEnd = migration.indexOf(
    "-- The exact PG16 system PUBLIC baseline is version-pinned below.",
    protectedSurfaceStart,
  );
  assert.ok(
    protectedSurfaceStart >= 0 && protectedSurfaceEnd > protectedSurfaceStart,
  );
  const protectedSurface = migration.slice(
    protectedSurfaceStart,
    protectedSurfaceEnd,
  );
  for (const relationIdentity of EXPECTED_SUPPORT_RELATION_IDENTITIES) {
    const relationName = relationIdentity.match(/\."([^"]+)"$/u)?.[1];
    assert.ok(relationName);
    assert.ok(
      protectedSurface.includes(`('${relationName}'::TEXT)`),
      relationIdentity,
    );
  }
  assert.ok(
    protectedSurface.includes(
      "('public.identity_email_claim_lock_v1(text)'::TEXT)",
    ),
  );
  assert.match(
    protectedSurface,
    /FROM protected_routines AS expected\s+INNER JOIN pg_catalog\.pg_proc AS routine\s+ON routine\.oid = pg_catalog\.to_regprocedure\(expected\.signature\)[\s\S]*acl\.grantee <> routine\.proowner/u,
  );
  assert.equal(
    (
      migration.match(
        /'DATABASE'(?:::\s*TEXT AS object_kind)?,\s+database_entry\.datname::TEXT/gu,
      ) ?? []
    ).length,
    3,
  );
  assert.match(
    migration,
    /system_public_rows\(kind, identity, grantor_name, privilege, grantable\) AS \(\s+SELECT\s+'SCHEMA', namespace\.nspname::TEXT/u,
  );
});

test("CURRENT186 pins both CURRENT183 rewrites and narrows IdentityEmailClaim to five SELECT plus one UPDATE carrier", async () => {
  const migration = await readFile(
    new URL(
      "../migration-candidates/20260803010000_identity_mail_duty_role_runtime_boundary_v2/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const narrowingStart = migration.indexOf(
    "DO $worker_v2_projection_narrowing$",
  );
  const narrowingEnd = migration.indexOf(
    "$worker_v2_projection_narrowing$;",
    narrowingStart + 1,
  );
  assert.ok(narrowingStart >= 0 && narrowingEnd > narrowingStart);
  const narrowing = migration.slice(narrowingStart, narrowingEnd);

  const expectedCurrent183Pins = [
    {
      predecessor:
        "2037007f96e0626f46d3f6cfe7504383ac453e12e405c2d2b7ad4fd777cc52fb",
      signature:
        "public.identity_initial_owner_mail_complete_current183(text,text,integer,text,text,text,text,text,text)",
      successor:
        "02f349d30854af22c2f6dfacdb3322ad52c03f19fb9a36fc40f2ac3bb5d942ec",
    },
    {
      predecessor:
        "190bb0100186f233cd33f1b4bb4065dd4c401e5156e5b0e9ecb8c7ba190c5754",
      signature:
        "public.identity_initial_owner_mail_provider_mark_current183(text,text,integer,text,text,text,text,text)",
      successor:
        "d6f6194029f390f8d9712b2d1dc25c821df0982f2e22a73660379d427e0a7db3",
    },
  ];
  for (const { predecessor, signature, successor } of expectedCurrent183Pins) {
    const signatureIndex = narrowing.indexOf(`'${signature}'::TEXT`);
    assert.ok(signatureIndex >= 0, signature);
    const tuple = narrowing.slice(signatureIndex, signatureIndex + 420);
    assert.ok(tuple.includes(`'${predecessor}'::TEXT`), `${signature} before`);
    assert.ok(tuple.includes(`'${successor}'::TEXT`), `${signature} after`);
    assert.match(tuple, /false,\s+4,\s+0,\s+0\s+\)/u);
  }
  assert.equal(
    (
      narrowing.match(
        /'public\.identity_(?:initial_owner_mail_(?:claim_v2|complete_current183|provider_mark_current183|reap_v2|reconcile_v2))\([^']+\)'::TEXT,/gu,
      ) ?? []
    ).length,
    5,
  );

  assert.match(
    narrowing,
    /claim_declaration CONSTANT TEXT :=\s+'claim_record public\."IdentityEmailClaim"%ROWTYPE;';[\s\S]*claim_record_declaration CONSTANT TEXT := 'claim_record RECORD;';/u,
  );
  for (const [name, indent] of [
    ["top", 4],
    ["nested", 6],
    ["deep", 8],
  ]) {
    const start = narrowing.indexOf(
      `claim_select_${name}_narrow CONSTANT TEXT :=`,
    );
    const end = narrowing.indexOf("INTO claim_record';", start);
    assert.ok(start >= 0 && end > start, name);
    const projection = narrowing.slice(start, end);
    const columns = [...projection.matchAll(/identity_claim\."([^"]+)"/gu)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      columns,
      ["emailCanonical", "tenantId", "claimType", "subjectId", "revision"],
      `${name}:${indent}`,
    );
  }
  assert.match(
    narrowing,
    /patched_prosrc LIKE '%identity_claim\.\*%'[\s\S]*patched_prosrc LIKE '%public\."IdentityEmailClaim"%ROWTYPE%'/u,
  );
  assert.match(
    narrowing,
    /claim_record_typed_null CONSTANT TEXT :=[\s\S]*NULL::VARCHAR\(320\) AS "emailCanonical"[\s\S]*NULL::public\."IdentityEmailClaimType" AS "claimType"[\s\S]*INTO claim_record;'/u,
  );
  assert.match(
    narrowing,
    /reap_email_order_expression CONSTANT TEXT :=\s*'    ORDER BY "emailCanonical"';/u,
  );
  assert.match(
    narrowing,
    /worker_assert_predecessor_digest CONSTANT TEXT :=\s*'56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c';/u,
  );
  assert.match(
    narrowing,
    /worker_assert_successor_digest CONSTANT TEXT :=\s*'6baacb6fe11a7bbe0633986422f98d13c045e4038d5c1136ed94df080ae7af2e';/u,
  );
  assert.match(
    narrowing,
    /current184_receipt_guard CONSTANT TEXT :=[\s\S]*migration_count IS DISTINCT FROM 184[\s\S]*current186_receipt_guard CONSTANT TEXT :=[\s\S]*migration_count IS DISTINCT FROM 186/u,
  );
  assert.match(
    migration,
    /COMMENT ON FUNCTION public\."identity_mail_delivery_worker_assert_v2"\([\s\S]*CURRENT_186 NOT_DEPLOYABLE ACTIVE worker-v2 readiness pinned to exact CURRENT_186/u,
  );
  assert.match(
    narrowing,
    /expected\.claim_record_reset_count = 1[\s\S]*expected\.reap_email_order_alias_count = 1/u,
  );
  assert.match(
    narrowing,
    /metadata_after IS NULL\s+OR metadata_after IS DISTINCT FROM metadata_before/u,
  );

  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_SELECT_COLUMN_IDENTITIES.filter(
      (identity) => identity.startsWith('public."IdentityEmailClaim".'),
    ),
    [
      'public."IdentityEmailClaim"."emailCanonical"',
      'public."IdentityEmailClaim"."tenantId"',
      'public."IdentityEmailClaim"."claimType"',
      'public."IdentityEmailClaim"."subjectId"',
      'public."IdentityEmailClaim"."revision"',
    ],
  );
  assert.deepEqual(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_UPDATE_COLUMN_IDENTITIES.filter(
      (identity) => identity.startsWith('public."IdentityEmailClaim".'),
    ),
    ['public."IdentityEmailClaim"."emailCanonical"'],
  );
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:SELECT|UPDATE)\s+ON\s+TABLE\s+public\."IdentityEmailClaim"/iu,
  );
});

test("CURRENT186 rejects proxies, accessors and extra mutable objects", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(new Proxy(target, {})),
    /catalog is invalid/u,
  );
  const accessor = structuredClone(target);
  Object.defineProperty(accessor.roles.worker, "name", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(accessor),
    /catalog is invalid/u,
  );
  const extra = structuredClone(target);
  extra.objects.push({
    ...extra.objects[0],
    identity: "other_database",
    oid: 9_999,
  });
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(extra),
    /catalog is invalid/u,
  );
});

test("CURRENT186 pg_catalog reader is exhaustive for authority and reads no business rows", async () => {
  assert.ok(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.includes(
      IDENTITY_MAIL_DUTY_ROLE_USER_ROUTINE_DEFINITION_CURRENT186_DIGEST_DOMAIN,
    ),
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /user_routine_inventory_rows AS MATERIALIZED \([\s\S]*pg_catalog\.to_jsonb\(routine_entry\) - 'proacl' - 'proowner'[\s\S]*'ownerBinding',[\s\S]*expected\."kind" = 'ROUTINE'[\s\S]*ELSE routine_entry\.proowner::BIGINT[\s\S]*pg_catalog\.pg_aggregate[\s\S]*namespace_entry\.nspname !~ '\^pg_'/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /'userRoutineDefinitionCount',[\s\S]*'userRoutineDefinitionDigest'/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_auth_members/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_db_role_setting/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_default_acl/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /has_database_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /has_schema_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /has_table_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /has_sequence_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /has_function_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /has_column_privilege/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_init_privs/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_parameter_acl/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_largeobject_metadata/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_extension/u,
  );
  for (const catalogName of [
    "pg_collation",
    "pg_conversion",
    "pg_operator",
    "pg_opclass",
    "pg_opfamily",
    "pg_ts_config",
    "pg_ts_dict",
    "pg_statistic_ext",
    "pg_event_trigger",
    "pg_publication",
    "pg_subscription",
    "pg_user_mappings",
    "pg_prepared_xacts",
  ]) {
    assert.match(
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
      new RegExp(`\\b${catalogName}\\b`, "u"),
    );
  }
  assert.doesNotMatch(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /\bpg_user_mapping\b/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /'oid:' \|\| (?:collation_entry|conversion_entry|operator_entry)\.oid::TEXT/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /routine_entry\.prokind IN \('f', 'p', 'a', 'w'\)/u,
  );
  assert.ok(
    (
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.match(
        /COALESCE\(\s+expected\."identity"/gu,
      ) ?? []
    ).length >= 2,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_get_functiondef/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_get_triggerdef/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_get_constraintdef/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /pg_get_indexdef/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /ambient_context AS MATERIALIZED \(\s+SELECT pg_catalog\.current_setting\('search_path'\) AS ambient_search_path/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /deparse_context AS MATERIALIZED \(\s+SELECT ambient_context\.ambient_search_path,\s+pg_catalog\.set_config\('search_path', 'pg_catalog', true\)\s+AS fixed_search_path\s+FROM ambient_context/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /catalog_payload AS MATERIALIZED \(/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /'ownerSuperuser', owner_role\.rolsuper/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /session_role\.rolname = SESSION_USER/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /current_role_entry\.rolname = CURRENT_USER/u,
  );
  const supportBindingSource =
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.slice(
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
        "support_column_bindings AS (",
      ),
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
        "effective AS (",
      ),
    );
  assert.match(supportBindingSource, /'attributeNumber'/u);
  assert.match(supportBindingSource, /'relationOid'/u);
  for (const identity of IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES) {
    assert.ok(supportBindingSource.includes(`('${identity}'::TEXT)`), identity);
  }
  const directAuthoritySource =
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.slice(
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
        "direct_authority AS (",
      ),
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
        "direct_authorities AS (",
      ),
    );
  assert.match(
    directAuthoritySource,
    /source\.object_kind = 'COLUMN'[\s\S]*FROM expected_objects AS protected_relation[\s\S]*protected_relation\."kind" = 'RELATION'/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /restore_context AS MATERIALIZED \(\s+SELECT pg_catalog\.set_config\(\s+'search_path', ambient_context\.ambient_search_path, true\s+\) AS restored_search_path\s+FROM ambient_context\s+CROSS JOIN catalog_payload/u,
  );
  const definitionSource =
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.slice(
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
        "definition_source AS MATERIALIZED",
      ),
      IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL.indexOf(
        "definition_rows AS",
      ),
    );
  assert.equal(
    (definitionSource.match(/CROSS JOIN deparse_context/gu) ?? []).length,
    4,
  );
  assert.equal(
    (
      definitionSource.match(
        /deparse_context\.fixed_search_path = 'pg_catalog'/gu,
      ) ?? []
    ).length,
    4,
  );
  assert.doesNotMatch(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /FROM\s+public\."IdentityMail/iu,
  );

  const source = await readFile(
    new URL(
      "./identity-mail-duty-role-catalog-current186.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /password|credential|console\.|fetch\(|https?:\/\//iu,
  );
});

test("CURRENT186 blocks unbacked custom-schema authority before DDL", () => {
  const target = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  target.effectivePrivileges.push({
    objectIdentity: "custom_schema",
    objectKind: "SCHEMA",
    privilege: "USAGE",
    roleName: target.roles.worker.name,
    roleOid: target.roles.worker.oid,
  });
  assert.ok(
    inspectIdentityMailDutyRoleCatalogCurrent186Safety(
      target,
      target.definitionManifestDigest,
    ).blockers.includes("UNRESTORABLE_CUSTOM_SCHEMA_AUTHORITY"),
  );
});

test("CURRENT186 records arbitrary quoted ACL principals and blocks them explicitly", () => {
  const target = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  const relation = target.objects.find((entry) => entry.kind === "RELATION");
  relation.acls.push({
    granteeName: 'Outside "QA" Operator',
    granteeOid: 8_888,
    grantorName: target.database.ownerName,
    grantorOid: target.database.ownerOid,
    isGrantable: false,
    privilege: "SELECT",
  });
  const normalized = normalizeIdentityMailDutyRoleCatalogCurrent186(target);
  const inspection = inspectIdentityMailDutyRoleCatalogCurrent186(normalized);
  assert.ok(inspection.findings.includes("UNEXPECTED_ACL_PRINCIPAL"));
  assert.deepEqual(inspection.unexpectedAclPrincipals, [
    {
      granteeName: 'Outside "QA" Operator',
      granteeOid: 8_888,
      grantorName: target.database.ownerName,
      grantorOid: target.database.ownerOid,
      objectIdentity: relation.identity,
      objectKind: relation.kind,
    },
  ]);

  const oidAlias = structuredClone(target);
  oidAlias.objects[1].acls.push({
    granteeName: "different_name",
    granteeOid: 8_888,
    grantorName: target.database.ownerName,
    grantorOid: target.database.ownerOid,
    isGrantable: false,
    privilege: "USAGE",
  });
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(oidAlias),
    /catalog is invalid/u,
  );
});

test("CURRENT186 allows only exact pg_database_owner on the public schema", () => {
  const target = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  const schema = target.objects.find(
    (entry) => entry.kind === "SCHEMA" && entry.identity === "public",
  );
  schema.ownerName = "pg_database_owner";
  schema.ownerOid = 6_171;
  schema.acls = [
    {
      granteeName: "public",
      granteeOid: 0,
      grantorName: "pg_database_owner",
      grantorOid: 6_171,
      isGrantable: false,
      privilege: "USAGE",
    },
  ];
  const inspection = inspectIdentityMailDutyRoleCatalogCurrent186(target);
  assert.equal(inspection.findings.includes("UNEXPECTED_ACL_PRINCIPAL"), false);
  assert.deepEqual(inspection.unexpectedAclPrincipals, []);

  const spoofed = structuredClone(target);
  spoofed.objects.find((entry) => entry.kind === "SCHEMA").ownerOid = 6_172;
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(spoofed),
    /catalog is invalid/u,
  );

  const arbitraryObject = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  arbitraryObject.objects
    .find((entry) => entry.kind === "RELATION")
    .acls.push({
      granteeName: "public",
      granteeOid: 0,
      grantorName: "pg_database_owner",
      grantorOid: 6_171,
      isGrantable: false,
      privilege: "SELECT",
    });
  const arbitraryInspection =
    inspectIdentityMailDutyRoleCatalogCurrent186(arbitraryObject);
  assert.ok(arbitraryInspection.findings.includes("UNEXPECTED_ACL_PRINCIPAL"));
});

test("CURRENT186 rejects every unexpected duty-role ownership class", () => {
  const kinds = [
    "CLASS",
    "COLLATION",
    "CONVERSION",
    "DATABASE",
    "EVENT_TRIGGER",
    "EXTENSION",
    "FOREIGN_DATA_WRAPPER",
    "FOREIGN_SERVER",
    "LANGUAGE",
    "LARGE_OBJECT",
    "OPERATOR",
    "OPERATOR_CLASS",
    "OPERATOR_FAMILY",
    "PUBLICATION",
    "ROUTINE",
    "SCHEMA",
    "STATISTICS",
    "SUBSCRIPTION",
    "TABLESPACE",
    "TEXT_SEARCH_CONFIGURATION",
    "TEXT_SEARCH_DICTIONARY",
    "TYPE",
    "USER_MAPPING",
  ];
  for (const [index, kind] of kinds.entries()) {
    const target = structuredClone(
      identityMailDutyRoleCatalogCurrent186TargetFixture(),
    );
    target.unexpectedOwnedObjects.push({
      identity: `${kind.toLowerCase()}_${index}`,
      kind,
      oid: 9_000 + index,
      ownerName: target.roles.schemaOwner.name,
      ownerOid: target.roles.schemaOwner.oid,
    });
    const inspection = inspectIdentityMailDutyRoleCatalogCurrent186(target);
    assert.ok(inspection.findings.includes("UNEXPECTED_OWNERSHIP"));
    assert.ok(
      inspectIdentityMailDutyRoleCatalogCurrent186Safety(
        target,
        target.definitionManifestDigest,
      ).blockers.includes("UNEXPECTED_OWNERSHIP"),
    );
  }

  const prepared = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  prepared.unexpectedOwnedObjects.push({
    identity: "gid_hex:63757272656e74313836",
    kind: "PREPARED_TRANSACTION",
    oid: null,
    ownerName: prepared.roles.worker.name,
    ownerOid: prepared.roles.worker.oid,
  });
  const preparedInspection =
    inspectIdentityMailDutyRoleCatalogCurrent186(prepared);
  assert.ok(preparedInspection.findings.includes("UNEXPECTED_OWNERSHIP"));
  const malformedPrepared = structuredClone(prepared);
  malformedPrepared.unexpectedOwnedObjects[0].oid = 9_999;
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(malformedPrepared),
    /catalog is invalid/u,
  );

  const spoofedOwner = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  spoofedOwner.unexpectedOwnedObjects.push({
    identity: "spoofed_owner_type",
    kind: "TYPE",
    oid: 9_100,
    ownerName: spoofedOwner.roles.worker.name,
    ownerOid: spoofedOwner.roles.schemaOwner.oid,
  });
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(spoofedOwner),
    /catalog is invalid/u,
  );

  const duplicate = structuredClone(
    identityMailDutyRoleCatalogCurrent186TargetFixture(),
  );
  const duplicateEntry = {
    identity: "duplicate_type",
    kind: "TYPE",
    oid: 9_101,
    ownerName: duplicate.roles.schemaOwner.name,
    ownerOid: duplicate.roles.schemaOwner.oid,
  };
  duplicate.unexpectedOwnedObjects.push(duplicateEntry, {
    ...duplicateEntry,
    identity: "same_oid_alias",
  });
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(duplicate),
    /catalog is invalid/u,
  );
});

test("CURRENT186 binds live definitions and exhaustive direct system authority", () => {
  const target = identityMailDutyRoleCatalogCurrent186TargetFixture();
  assert.equal(
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_IDENTITIES.length,
    21,
  );
  assert.equal(
    target.definitionManifest.filter((entry) => entry.kind === "TRIGGER")
      .length,
    21,
  );
  const expectedDefinition = target.definitionManifestDigest;
  const definitionDrift = structuredClone(target);
  definitionDrift.definitionManifest[0].definitionSha256 = "f".repeat(64);
  definitionDrift.definitionManifestDigest =
    identityMailDutyRoleDefinitionManifestCurrent186Digest(
      definitionDrift.definitionManifest,
    );
  assert.deepEqual(
    inspectIdentityMailDutyRoleCatalogCurrent186Safety(
      definitionDrift,
      expectedDefinition,
    ).blockers,
    ["DEFINITION_MANIFEST_DRIFT"],
  );

  const systemDrift = structuredClone(target);
  systemDrift.directAuthorities.push({
    granteeName: "public",
    granteeOid: 0,
    grantorName: target.database.ownerName,
    grantorOid: target.database.ownerOid,
    isGrantable: false,
    objectIdentity: "pg_catalog.pg_authid",
    objectKind: "RELATION",
    privilege: "SELECT",
    source: "ACL",
  });
  systemDrift.systemPublicAclBaselineDigest = "f".repeat(64);
  assert.deepEqual(
    inspectIdentityMailDutyRoleCatalogCurrent186Safety(
      systemDrift,
      expectedDefinition,
    ).blockers,
    ["SYSTEM_PUBLIC_ACL_BASELINE_DRIFT"],
  );

  const implicitBaseline = structuredClone(target);
  implicitBaseline.directAuthorities.push({
    granteeName: "public",
    granteeOid: 0,
    grantorName: target.database.ownerName,
    grantorOid: target.database.ownerOid,
    isGrantable: false,
    objectIdentity: "pg_catalog.abs(integer)",
    objectKind: "ROUTINE",
    privilege: "EXECUTE",
    source: "ACL_DEFAULT",
  });
  const implicitTarget =
    identityMailDutyRoleCatalogCurrent186Target(implicitBaseline);
  assert.equal(
    inspectIdentityMailDutyRoleCatalogCurrent186Safety(
      implicitTarget,
      expectedDefinition,
    ).compliant,
    true,
  );

  const extraTrigger = structuredClone(target);
  extraTrigger.definitionManifest.push({
    definitionSha256: "e".repeat(64),
    identity: 'public."IdentityMailOutbox"::"hostile_unexpected_trigger"',
    kind: "TRIGGER",
  });
  extraTrigger.definitionManifestDigest =
    identityMailDutyRoleDefinitionManifestCurrent186Digest(
      extraTrigger.definitionManifest,
    );
  assert.throws(
    () => normalizeIdentityMailDutyRoleCatalogCurrent186(extraTrigger),
    /catalog is invalid/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /AND NOT trigger_entry\.tgisinternal\s+UNION ALL/u,
  );
  assert.match(
    IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_READ_SQL,
    /definition_source AS MATERIALIZED \(\s+SELECT 'ROUTINE'::TEXT AS kind,\s+pg_catalog\.replace\(expected\."identity", '"', ''\) AS identity,\s+pg_catalog\.pg_get_functiondef\(routine_entry\.oid\) AS definition/u,
  );
  const namedIdentityArguments =
    "p_tenant_id text, p_command_id text, p_authorization_envelope_digest text, p_manifest_payload_digest text";
  assert.notEqual(
    `public.identity_mail_tenant_enrollment_drive_command_v2(${namedIdentityArguments})`,
    "public.identity_mail_tenant_enrollment_drive_command_v2(text,text,text,text)",
  );
  assert.equal(
    target.definitionManifest.some(
      (entry) =>
        entry.kind === "ROUTINE" && entry.identity.includes("p_tenant_id"),
    ),
    false,
  );
});

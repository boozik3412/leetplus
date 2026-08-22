import {
  IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE,
  IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SCHEMA_VERSION,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_DEFINITION_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES,
  IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST,
  identityMailDutyRoleDefinitionManifestCurrent186Digest,
  identityMailDutyRoleCatalogCurrent186Target,
} from "./identity-mail-duty-role-catalog-current186.mjs";

function role(name, oid, canLogin) {
  return {
    bypassRls: false,
    canLogin,
    connectionLimit: -1,
    createDatabase: false,
    createRole: false,
    inherit: false,
    name,
    oid,
    replication: false,
    superuser: false,
    validUntil: null,
  };
}

export function identityMailDutyRoleCatalogCurrent186Fixture() {
  const database = {
    currentUserName: "leetplus_owner",
    currentUserOid: 92,
    identityDigest: "a".repeat(64),
    name: "leetplus_beta",
    oid: 91,
    ownerName: "leetplus_owner",
    ownerOid: 92,
    ownerSuperuser: true,
    sessionUserName: "leetplus_owner",
    sessionUserOid: 92,
  };
  const roles = {
    coordinator: role(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.coordinator,
      94,
      true,
    ),
    schemaOwner: role(
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.schemaOwner,
      93,
      false,
    ),
    worker: role(IDENTITY_MAIL_DUTY_ROLE_CURRENT186_NAMES.worker, 95, true),
  };
  let oid = 1_000;
  const object = (kind, identity) => ({
    acls: [],
    identity,
    kind,
    oid: oid++,
    ownerName: database.ownerName,
    ownerOid: database.ownerOid,
  });
  const objects = [
    object("DATABASE", database.name),
    object("SCHEMA", "public"),
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_RELATIONS.map((identity) =>
      object("RELATION", identity),
    ),
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_SIGNATURES.map(
      (identity) => object("ROUTINE", identity),
    ),
  ];
  const oidByIdentity = new Map(
    objects.map((entry) => [entry.identity, entry.oid]),
  );
  const definitionManifest = [
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_ROUTINE_DEFINITION_IDENTITIES.map(
      (identity, index) => ({
        definitionSha256: (index + 1).toString(16).padStart(64, "0"),
        identity,
        kind: "ROUTINE",
      }),
    ),
    ...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_PROTECTED_TRIGGER_IDENTITIES.map(
      (identity, index) => ({
        definitionSha256: (index + 101).toString(16).padStart(64, "0"),
        identity,
        kind: "TRIGGER",
      }),
    ),
    ...[...IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_RELATIONS].flatMap(
      (identity, index) => {
        const relationName = identity.match(/\."([^"]+)"$/u)?.[1];
        if (relationName === undefined) {
          throw new Error("CURRENT186 fixture relation identity is invalid.");
        }
        const objectIdentity = `${identity}::"${relationName}_pkey"`;
        return [
          {
            definitionSha256: (index + 201).toString(16).padStart(64, "0"),
            identity: objectIdentity,
            kind: "CONSTRAINT",
          },
          {
            definitionSha256: (index + 301).toString(16).padStart(64, "0"),
            identity: objectIdentity,
            kind: "INDEX",
          },
        ];
      },
    ),
  ];
  return {
    database,
    databaseRoleSettings: [],
    defaultAcls: [],
    definitionManifest,
    definitionManifestDigest:
      identityMailDutyRoleDefinitionManifestCurrent186Digest(
        definitionManifest,
      ),
    directAuthorities: [],
    dutyRoutines: IDENTITY_MAIL_DUTY_ROLE_CURRENT186_RPC_SIGNATURES.map(
      (signature) => ({
        language: "plpgsql",
        oid: oidByIdentity.get(signature),
        ownerName: database.ownerName,
        ownerOid: database.ownerOid,
        parallelSafety: "u",
        returnType: "jsonb",
        searchPath: "pg_catalog",
        securityDefiner: true,
        signature,
        volatility: "v",
      }),
    ),
    effectivePrivileges: [],
    memberships: [],
    objects,
    profile: IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_PROFILE,
    publicRoutineAcls: [],
    roles,
    roleSettings: [],
    schemaVersion: IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_SCHEMA_VERSION,
    supportColumnBindings:
      IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_COLUMN_IDENTITIES.map(
        (objectIdentity, index) => {
          const relationIdentity =
            IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SUPPORT_RELATION_IDENTITIES.find(
              (identity) => objectIdentity.startsWith(`${identity}.`),
            );
          const relationOid = oidByIdentity.get(relationIdentity);
          if (relationIdentity === undefined || relationOid === undefined) {
            throw new Error(
              "CURRENT186 fixture support-column relation is invalid.",
            );
          }
          return {
            attributeNumber: index + 1,
            objectIdentity,
            relationOid,
          };
        },
      ),
    systemPublicAclBaselineDigest:
      IDENTITY_MAIL_DUTY_ROLE_SYSTEM_PUBLIC_ACL_CURRENT186_EXPECTED_DIGEST,
    unexpectedOwnedObjects: [],
    userRoutineDefinitionCount: 97,
    userRoutineDefinitionDigest: "9".repeat(64),
  };
}

export function identityMailDutyRoleCatalogCurrent186TargetFixture() {
  return identityMailDutyRoleCatalogCurrent186Target(
    identityMailDutyRoleCatalogCurrent186Fixture(),
  );
}

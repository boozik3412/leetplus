import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  CURRENT187_ADMISSION_CONTRACT,
  CURRENT187_ADMISSION_SCHEMA_VERSION,
  current187AdmissionCanonicalJson,
  current187AdmissionDeepFreeze,
  current187AdmissionExactDataRecord,
  current187AdmissionFail,
} from "./identity-mail-cluster-application-admission-current187-contract.mjs";

export const CURRENT187_SEMANTIC_RISK_SLICE =
  "CURRENT187_G_SECRET_FREE_SEMANTIC_RISK_FACTS_DENY_ONLY";
export const CURRENT187_SEMANTIC_RISK_RECEIPT_KIND =
  "CURRENT187_SEMANTIC_RISK_FACTS_DENY_ONLY_RECEIPT";
export const CURRENT187_SEMANTIC_RISK_STATUS = "FACTS_EXTRACTED_DENY_ONLY";

export const CURRENT187_SEMANTIC_RISK_SURFACES = Object.freeze([
  "columnAclAllGrantees",
  "databaseSecurity",
  "defaultAclAllGrantees",
  "effectiveObjectPrivileges",
  "memberships",
  "ownedObjects",
  "relationAclAllGrantees",
  "roleDatabaseSettings",
  "roles",
  "routineAclAllGrantees",
  "schemaAclAllGrantees",
  "typeAclAllGrantees",
]);

const MAX_ROWS_PER_SURFACE = 250_000;
const CANONICAL_ROW_MAX_BYTES = 4 * 1_024 * 1_024;
const DIGEST_DOMAIN = "LEETPLUS_CURRENT187_SEMANTIC_RISK_FACTS_V1";
const CATEGORY_DIGEST_DOMAIN = "LEETPLUS_CURRENT187_SEMANTIC_RISK_CATEGORY_V1";
const SURFACE_SET_DIGEST_DOMAIN =
  "LEETPLUS_CURRENT187_SEMANTIC_RISK_SURFACE_SET_V1";

const CATEGORY_NAMES = Object.freeze([
  "currentAclGrants",
  "defaultAclGrants",
  "directMemberships",
  "effectivePrivileges",
  "elevatedMemberships",
  "grantableCurrentAclGrants",
  "grantableDefaultAclGrants",
  "loginRoles",
  "ownedObjects",
  "privilegedRoleAttributes",
  "publicCurrentAclGrants",
  "publicDefaultAclGrants",
  "roleDatabaseSettings",
]);

const FACT_COUNT_KEYS = Object.freeze([
  "currentAclGrantCount",
  "defaultAclGrantCount",
  "directMembershipCount",
  "effectivePrivilegeCount",
  "effectivePrivilegeSubjectCount",
  "elevatedMembershipCount",
  "grantableCurrentAclGrantCount",
  "grantableDefaultAclGrantCount",
  "loginRoleCount",
  "ownedObjectCount",
  "privilegedRoleCount",
  "publicCurrentAclGrantCount",
  "publicDefaultAclGrantCount",
  "roleCount",
  "roleDatabaseSettingCount",
]);

const BOOLEAN_KEYS = new Set([
  "adminOption",
  "bypassRls",
  "canLogin",
  "connect",
  "create",
  "createDatabase",
  "createRole",
  "delete",
  "execute",
  "grantable",
  "inherit",
  "inheritOption",
  "insert",
  "member",
  "references",
  "replication",
  "select",
  "set",
  "setOption",
  "superuser",
  "temporary",
  "trigger",
  "truncate",
  "update",
  "usage",
]);

const INTEGER_KEYS = new Set([
  "columnNumber",
  "connectionLimit",
  "objectSubId",
]);

const OID_KEYS = new Set([
  "classOid",
  "databaseOid",
  "granteeOid",
  "grantorOid",
  "memberOid",
  "objectOid",
  "ownerOid",
  "relationOid",
  "roleOid",
  "routineOid",
  "schemaOid",
  "typeOid",
]);

const NULLABLE_STRING_KEYS = new Set([
  "databaseName",
  "granteeName",
  "schemaName",
  "validUntil",
]);

const ROLE_KEYS = Object.freeze([
  "bypassRls",
  "canLogin",
  "config",
  "connectionLimit",
  "createDatabase",
  "createRole",
  "inherit",
  "name",
  "oid",
  "replication",
  "superuser",
  "validUntil",
]);
const DIRECT_MEMBERSHIP_KEYS = Object.freeze([
  "adminOption",
  "grantorName",
  "grantorOid",
  "inheritOption",
  "kind",
  "memberName",
  "memberOid",
  "roleName",
  "roleOid",
  "setOption",
]);
const EFFECTIVE_MEMBERSHIP_KEYS = Object.freeze([
  "kind",
  "member",
  "memberName",
  "memberOid",
  "roleName",
  "roleOid",
  "set",
  "usage",
]);
const ROLE_DATABASE_SETTING_KEYS = Object.freeze([
  "databaseName",
  "databaseOid",
  "roleName",
  "roleOid",
  "setting",
]);
const OWNED_OBJECT_KEYS = Object.freeze([
  "classOid",
  "databaseName",
  "databaseOid",
  "dependencyType",
  "identity",
  "objectOid",
  "objectSubId",
  "ownerName",
  "ownerOid",
]);
const DATABASE_DIRECT_ACL_KEYS = Object.freeze([
  "databaseName",
  "databaseOid",
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "kind",
  "ownerName",
  "ownerOid",
  "privilege",
]);
const DATABASE_EFFECTIVE_ACL_KEYS = Object.freeze([
  "connect",
  "create",
  "databaseName",
  "databaseOid",
  "kind",
  "roleName",
  "roleOid",
  "temporary",
]);
const SCHEMA_ACL_KEYS = Object.freeze([
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "ownerOid",
  "privilege",
  "schemaName",
  "schemaOid",
]);
const RELATION_ACL_KEYS = Object.freeze([
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "ownerOid",
  "privilege",
  "relationKind",
  "relationName",
  "relationOid",
  "schemaName",
]);
const COLUMN_ACL_KEYS = Object.freeze([
  "columnName",
  "columnNumber",
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "privilege",
  "relationName",
  "relationOid",
  "schemaName",
]);
const TYPE_ACL_KEYS = Object.freeze([
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "ownerOid",
  "privilege",
  "schemaName",
  "typeName",
  "typeOid",
]);
const ROUTINE_ACL_KEYS = Object.freeze([
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "identityArguments",
  "ownerOid",
  "privilege",
  "routineName",
  "routineOid",
  "schemaName",
]);
const DEFAULT_ACL_KEYS = Object.freeze([
  "grantable",
  "granteeName",
  "granteeOid",
  "grantorName",
  "grantorOid",
  "objectType",
  "ownerName",
  "ownerOid",
  "privilege",
  "schemaName",
  "schemaOid",
]);

const EFFECTIVE_KEYS_BY_KIND = Object.freeze({
  COLUMN: Object.freeze([
    "columnName",
    "columnNumber",
    "insert",
    "kind",
    "references",
    "relationName",
    "relationOid",
    "roleName",
    "roleOid",
    "schemaName",
    "select",
    "update",
  ]),
  RELATION: Object.freeze([
    "delete",
    "insert",
    "kind",
    "objectName",
    "objectOid",
    "references",
    "roleName",
    "roleOid",
    "schemaName",
    "select",
    "trigger",
    "truncate",
    "update",
    "usage",
  ]),
  ROUTINE: Object.freeze([
    "execute",
    "kind",
    "objectName",
    "objectOid",
    "roleName",
    "roleOid",
    "schemaName",
  ]),
  SCHEMA: Object.freeze([
    "create",
    "kind",
    "objectOid",
    "roleName",
    "roleOid",
    "schemaName",
    "usage",
  ]),
  SEQUENCE: Object.freeze([
    "delete",
    "insert",
    "kind",
    "objectName",
    "objectOid",
    "references",
    "roleName",
    "roleOid",
    "schemaName",
    "select",
    "trigger",
    "truncate",
    "update",
    "usage",
  ]),
  TYPE: Object.freeze([
    "kind",
    "objectName",
    "objectOid",
    "roleName",
    "roleOid",
    "schemaName",
    "usage",
  ]),
});

const CURRENT_ACL_KEYS_BY_SURFACE = Object.freeze({
  columnAclAllGrantees: COLUMN_ACL_KEYS,
  relationAclAllGrantees: RELATION_ACL_KEYS,
  routineAclAllGrantees: ROUTINE_ACL_KEYS,
  schemaAclAllGrantees: SCHEMA_ACL_KEYS,
  typeAclAllGrantees: TYPE_ACL_KEYS,
});

const VERIFIED_CURRENT187_SEMANTIC_RISK_RECEIPTS = new WeakSet();

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail() {
  current187AdmissionFail(
    "CURRENT187_SEMANTIC_RISK_FACTS_INVALID",
    "CURRENT187 semantic risk facts could not be derived from exact canonical catalog evidence.",
  );
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${domain}\n`, "utf8")
    .update(current187AdmissionCanonicalJson(value), "utf8")
    .digest("hex");
}

function exactCanonicalRows(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value)) {
    fail();
  }
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    fail();
  }
  const length = descriptors.length?.value;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_ROWS_PER_SURFACE
  ) {
    fail();
  }
  const expectedKeys = [
    ...Array.from({ length }, (_, index) => String(index)),
    "length",
  ].sort(compareStrings);
  const actualKeys = Reflect.ownKeys(descriptors);
  if (actualKeys.some((key) => typeof key !== "string")) {
    fail();
  }
  actualKeys.sort(compareStrings);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    descriptors.length?.enumerable !== false
  ) {
    fail();
  }
  const rows = [];
  let prior = null;
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    const row = descriptor?.value;
    if (
      !descriptor ||
      descriptor.enumerable !== true ||
      typeof row !== "string" ||
      Buffer.byteLength(row, "utf8") > CANONICAL_ROW_MAX_BYTES ||
      (prior !== null && compareStrings(prior, row) > 0)
    ) {
      fail();
    }
    let parsed;
    try {
      parsed = JSON.parse(row);
    } catch {
      fail();
    }
    if (current187AdmissionCanonicalJson(parsed) !== row) {
      fail();
    }
    rows.push(Object.freeze({ canonical: row, parsed }));
    prior = row;
  }
  return Object.freeze(rows);
}

function validateString(value, nullable = false) {
  if (
    (nullable && value === null) ||
    (typeof value === "string" && value.length <= CANONICAL_ROW_MAX_BYTES)
  ) {
    return;
  }
  fail();
}

function validateConfig(value) {
  if (value === null) {
    return;
  }
  if (!Array.isArray(value) || value.length > 8_192) {
    fail();
  }
  for (const entry of value) {
    validateString(entry);
  }
}

function normalizeRow(value, keys) {
  const row = current187AdmissionExactDataRecord(
    value,
    keys,
    "CURRENT187_SEMANTIC_RISK_FACTS_INVALID",
    "CURRENT187 semantic catalog evidence has an unexpected shape.",
  );
  for (const key of keys) {
    const entry = row[key];
    if (key === "config") {
      validateConfig(entry);
    } else if (BOOLEAN_KEYS.has(key)) {
      if (typeof entry !== "boolean") fail();
    } else if (INTEGER_KEYS.has(key)) {
      if (!Number.isSafeInteger(entry)) fail();
    } else if (OID_KEYS.has(key)) {
      if (
        typeof entry !== "string" ||
        !/^(?:0|[1-9][0-9]{0,19})$/u.test(entry)
      ) {
        fail();
      }
    } else {
      validateString(entry, NULLABLE_STRING_KEYS.has(key));
    }
  }
  return row;
}

function discriminator(value, allowedKinds) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    utilTypes.isProxy(value)
  ) {
    fail();
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (
    !descriptor ||
    !Object.hasOwn(descriptor, "value") ||
    !allowedKinds.includes(descriptor.value)
  ) {
    fail();
  }
  return descriptor.value;
}

function truePrivilegeKeys(row) {
  return Object.keys(row)
    .filter((key) => BOOLEAN_KEYS.has(key) && row[key] === true)
    .sort(compareStrings);
}

function addAcl(categories, counts, canonical, row, defaultAcl = false) {
  const base = defaultAcl ? "defaultAclGrants" : "currentAclGrants";
  const publicCategory = defaultAcl
    ? "publicDefaultAclGrants"
    : "publicCurrentAclGrants";
  const grantableCategory = defaultAcl
    ? "grantableDefaultAclGrants"
    : "grantableCurrentAclGrants";
  const baseCount = defaultAcl
    ? "defaultAclGrantCount"
    : "currentAclGrantCount";
  const publicCount = defaultAcl
    ? "publicDefaultAclGrantCount"
    : "publicCurrentAclGrantCount";
  const grantableCount = defaultAcl
    ? "grantableDefaultAclGrantCount"
    : "grantableCurrentAclGrantCount";
  const publicOid = row.granteeOid === "0";
  const publicName = row.granteeName === "PUBLIC";
  if (publicOid !== publicName) {
    fail();
  }
  categories[base].push(canonical);
  counts[baseCount] += 1;
  if (publicOid) {
    categories[publicCategory].push(canonical);
    counts[publicCount] += 1;
  }
  if (row.grantable) {
    categories[grantableCategory].push(canonical);
    counts[grantableCount] += 1;
  }
}

function addEffectivePrivileges(categories, counts, canonical, row) {
  const enabled = truePrivilegeKeys(row);
  if (enabled.length === 0) {
    return;
  }
  categories.effectivePrivileges.push(
    current187AdmissionCanonicalJson({ enabled, row: canonical }),
  );
  counts.effectivePrivilegeSubjectCount += 1;
  counts.effectivePrivilegeCount += enabled.length;
}

export function extractCurrent187SemanticRiskFacts(surfaceRowsValue) {
  if (arguments.length !== 1) {
    fail();
  }
  const source = current187AdmissionExactDataRecord(
    surfaceRowsValue,
    CURRENT187_SEMANTIC_RISK_SURFACES,
    "CURRENT187_SEMANTIC_RISK_FACTS_INVALID",
    "CURRENT187 semantic risk input must contain the exact required surfaces.",
  );
  const rowsBySurface = Object.freeze(
    Object.fromEntries(
      CURRENT187_SEMANTIC_RISK_SURFACES.map((surface) => [
        surface,
        exactCanonicalRows(source[surface]),
      ]),
    ),
  );
  const categories = Object.fromEntries(
    CATEGORY_NAMES.map((category) => [category, []]),
  );
  const counts = Object.fromEntries(FACT_COUNT_KEYS.map((key) => [key, 0]));

  for (const { canonical, parsed } of rowsBySurface.roles) {
    const row = normalizeRow(parsed, ROLE_KEYS);
    counts.roleCount += 1;
    if (row.canLogin) {
      categories.loginRoles.push(canonical);
      counts.loginRoleCount += 1;
    }
    if (
      row.superuser ||
      row.createRole ||
      row.createDatabase ||
      row.replication ||
      row.bypassRls
    ) {
      categories.privilegedRoleAttributes.push(canonical);
      counts.privilegedRoleCount += 1;
    }
  }

  for (const { canonical, parsed } of rowsBySurface.memberships) {
    const kind = discriminator(parsed, ["DIRECT", "EFFECTIVE"]);
    const row = normalizeRow(
      parsed,
      kind === "DIRECT" ? DIRECT_MEMBERSHIP_KEYS : EFFECTIVE_MEMBERSHIP_KEYS,
    );
    if (kind === "DIRECT") {
      categories.directMemberships.push(canonical);
      counts.directMembershipCount += 1;
      if (row.adminOption || row.setOption) {
        categories.elevatedMemberships.push(canonical);
        counts.elevatedMembershipCount += 1;
      }
    }
  }

  for (const { canonical, parsed } of rowsBySurface.roleDatabaseSettings) {
    normalizeRow(parsed, ROLE_DATABASE_SETTING_KEYS);
    categories.roleDatabaseSettings.push(canonical);
    counts.roleDatabaseSettingCount += 1;
  }

  for (const { canonical, parsed } of rowsBySurface.ownedObjects) {
    normalizeRow(parsed, OWNED_OBJECT_KEYS);
    categories.ownedObjects.push(canonical);
    counts.ownedObjectCount += 1;
  }

  for (const { canonical, parsed } of rowsBySurface.databaseSecurity) {
    const kind = discriminator(parsed, ["DIRECT", "EFFECTIVE"]);
    const row = normalizeRow(
      parsed,
      kind === "DIRECT"
        ? DATABASE_DIRECT_ACL_KEYS
        : DATABASE_EFFECTIVE_ACL_KEYS,
    );
    if (kind === "DIRECT") {
      addAcl(categories, counts, canonical, row);
    } else {
      addEffectivePrivileges(categories, counts, canonical, row);
    }
  }

  for (const [surface, keys] of Object.entries(CURRENT_ACL_KEYS_BY_SURFACE)) {
    for (const { canonical, parsed } of rowsBySurface[surface]) {
      const row = normalizeRow(parsed, keys);
      addAcl(categories, counts, canonical, row);
    }
  }

  for (const { canonical, parsed } of rowsBySurface.defaultAclAllGrantees) {
    const row = normalizeRow(parsed, DEFAULT_ACL_KEYS);
    addAcl(categories, counts, canonical, row, true);
  }

  for (const { canonical, parsed } of rowsBySurface.effectiveObjectPrivileges) {
    const kind = discriminator(parsed, Object.keys(EFFECTIVE_KEYS_BY_KIND));
    const row = normalizeRow(parsed, EFFECTIVE_KEYS_BY_KIND[kind]);
    addEffectivePrivileges(categories, counts, canonical, row);
  }

  const categoryDigests = Object.freeze(
    Object.fromEntries(
      CATEGORY_NAMES.map((category) => [
        category,
        digest(CATEGORY_DIGEST_DOMAIN, {
          category,
          rows: categories[category].sort(compareStrings),
        }),
      ]),
    ),
  );
  const factCounts = Object.freeze(
    Object.fromEntries(FACT_COUNT_KEYS.map((key) => [key, counts[key]])),
  );
  const surfaceRowCounts = Object.freeze(
    Object.fromEntries(
      CURRENT187_SEMANTIC_RISK_SURFACES.map((surface) => [
        surface,
        rowsBySurface[surface].length,
      ]),
    ),
  );
  const surfaceSetDigest = digest(SURFACE_SET_DIGEST_DOMAIN, {
    surfaceRowCounts,
    surfaces: CURRENT187_SEMANTIC_RISK_SURFACES,
  });
  const publicReceipt = {
    authorization: false,
    canMutate: false,
    canSend: false,
    categoryDigests,
    contract: CURRENT187_ADMISSION_CONTRACT,
    factCounts,
    kind: CURRENT187_SEMANTIC_RISK_RECEIPT_KIND,
    persistedConsumptionVerified: false,
    policyAllowlistEvaluated: false,
    productionRootEnrolled: false,
    schemaVersion: CURRENT187_ADMISSION_SCHEMA_VERSION,
    semanticRiskStatus: CURRENT187_SEMANTIC_RISK_STATUS,
    sharedBetaAccess: false,
    slice: CURRENT187_SEMANTIC_RISK_SLICE,
    sourceIoPerformed: false,
    surfaceRowCounts,
    surfaceSetDigest,
    testAccessAuthorized: false,
  };
  const receipt = current187AdmissionDeepFreeze({
    ...publicReceipt,
    semanticRiskFactsDigest: digest(DIGEST_DOMAIN, publicReceipt),
  });
  VERIFIED_CURRENT187_SEMANTIC_RISK_RECEIPTS.add(receipt);
  return receipt;
}

export function isVerifiedCurrent187SemanticRiskFactsReceipt(value) {
  return VERIFIED_CURRENT187_SEMANTIC_RISK_RECEIPTS.has(value);
}

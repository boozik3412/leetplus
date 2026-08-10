import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { current187AdmissionCanonicalJson } from "./identity-mail-cluster-application-admission-current187-contract.mjs";
import {
  CURRENT187_SEMANTIC_RISK_STATUS,
  CURRENT187_SEMANTIC_RISK_SURFACES,
  extractCurrent187SemanticRiskFacts,
  isVerifiedCurrent187SemanticRiskFactsReceipt,
} from "./identity-mail-cluster-semantic-risk-current187.mjs";

function canonicalRows(...rows) {
  return rows.map((row) => current187AdmissionCanonicalJson(row)).sort();
}

function emptyInput() {
  return Object.fromEntries(
    CURRENT187_SEMANTIC_RISK_SURFACES.map((surface) => [surface, []]),
  );
}

function populatedInput(secret = "opaque-sensitive-role-name") {
  return {
    columnAclAllGrantees: canonicalRows({
      columnName: "email",
      columnNumber: 2,
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      privilege: "SELECT",
      relationName: "users",
      relationOid: "200",
      schemaName: "public",
    }),
    databaseSecurity: canonicalRows(
      {
        databaseName: "app_ci",
        databaseOid: "100",
        grantable: true,
        granteeName: "PUBLIC",
        granteeOid: "0",
        grantorName: "owner_role",
        grantorOid: "10",
        kind: "DIRECT",
        ownerName: "owner_role",
        ownerOid: "10",
        privilege: "CONNECT",
      },
      {
        connect: true,
        create: false,
        databaseName: "app_ci",
        databaseOid: "100",
        kind: "EFFECTIVE",
        roleName: secret,
        roleOid: "20",
        temporary: true,
      },
    ),
    defaultAclAllGrantees: canonicalRows({
      grantable: true,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      objectType: "r",
      ownerName: "owner_role",
      ownerOid: "10",
      privilege: "SELECT",
      schemaName: null,
      schemaOid: "0",
    }),
    effectiveObjectPrivileges: canonicalRows({
      kind: "TYPE",
      objectName: "status_type",
      objectOid: "400",
      roleName: secret,
      roleOid: "20",
      schemaName: "public",
      usage: true,
    }),
    memberships: canonicalRows(
      {
        adminOption: true,
        grantorName: "owner_role",
        grantorOid: "10",
        inheritOption: true,
        kind: "DIRECT",
        memberName: secret,
        memberOid: "20",
        roleName: "writer_role",
        roleOid: "21",
        setOption: false,
      },
      {
        kind: "EFFECTIVE",
        member: true,
        memberName: secret,
        memberOid: "20",
        roleName: "writer_role",
        roleOid: "21",
        set: true,
        usage: true,
      },
    ),
    ownedObjects: canonicalRows({
      classOid: "1259",
      databaseName: "app_ci",
      databaseOid: "100",
      dependencyType: "o",
      identity: "table public.users",
      objectOid: "200",
      objectSubId: 0,
      ownerName: secret,
      ownerOid: "20",
    }),
    relationAclAllGrantees: canonicalRows({
      grantable: true,
      granteeName: secret,
      granteeOid: "20",
      grantorName: "owner_role",
      grantorOid: "10",
      ownerOid: "10",
      privilege: "SELECT",
      relationKind: "r",
      relationName: "users",
      relationOid: "200",
      schemaName: "public",
    }),
    roleDatabaseSettings: canonicalRows({
      databaseName: "app_ci",
      databaseOid: "100",
      roleName: secret,
      roleOid: "20",
      setting: "search_path=public",
    }),
    roles: canonicalRows(
      {
        bypassRls: false,
        canLogin: true,
        config: null,
        connectionLimit: 10,
        createDatabase: false,
        createRole: false,
        inherit: true,
        name: secret,
        oid: "20",
        replication: false,
        superuser: false,
        validUntil: null,
      },
      {
        bypassRls: true,
        canLogin: false,
        config: ["statement_timeout=1s"],
        connectionLimit: -1,
        createDatabase: false,
        createRole: false,
        inherit: true,
        name: "privileged_role",
        oid: "22",
        replication: false,
        superuser: false,
        validUntil: "infinity",
      },
    ),
    routineAclAllGrantees: canonicalRows({
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      identityArguments: "",
      ownerOid: "10",
      privilege: "EXECUTE",
      routineName: "lookup_user",
      routineOid: "300",
      schemaName: "public",
    }),
    schemaAclAllGrantees: canonicalRows({
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      ownerOid: "10",
      privilege: "USAGE",
      schemaName: "public",
      schemaOid: "2200",
    }),
    typeAclAllGrantees: canonicalRows({
      grantable: false,
      granteeName: "PUBLIC",
      granteeOid: "0",
      grantorName: "owner_role",
      grantorOid: "10",
      ownerOid: "10",
      privilege: "USAGE",
      schemaName: "public",
      typeName: "status_type",
      typeOid: "400",
    }),
  };
}

test("empty exact semantic surface set produces a branded deny-only receipt", () => {
  const receipt = extractCurrent187SemanticRiskFacts(emptyInput());
  assert.equal(isVerifiedCurrent187SemanticRiskFactsReceipt(receipt), true);
  assert.equal(receipt.semanticRiskStatus, CURRENT187_SEMANTIC_RISK_STATUS);
  assert.equal(receipt.authorization, false);
  assert.equal(receipt.canMutate, false);
  assert.equal(receipt.canSend, false);
  assert.equal(receipt.policyAllowlistEvaluated, false);
  assert.equal(receipt.sharedBetaAccess, false);
  assert.equal(receipt.testAccessAuthorized, false);
  assert.match(receipt.semanticRiskFactsDigest, /^[a-f0-9]{64}$/u);
  assert.ok(Object.values(receipt.factCounts).every((count) => count === 0));
  assert.ok(
    Object.values(receipt.surfaceRowCounts).every((count) => count === 0),
  );
  assert.equal(Object.isFrozen(receipt), true);
});

test("semantic facts count privileged attributes, memberships, ownership, ACL, and effective privileges", () => {
  const receipt = extractCurrent187SemanticRiskFacts(populatedInput());
  assert.deepEqual(receipt.factCounts, {
    currentAclGrantCount: 6,
    defaultAclGrantCount: 1,
    directMembershipCount: 1,
    effectivePrivilegeCount: 3,
    effectivePrivilegeSubjectCount: 2,
    elevatedMembershipCount: 1,
    grantableCurrentAclGrantCount: 2,
    grantableDefaultAclGrantCount: 1,
    loginRoleCount: 1,
    ownedObjectCount: 1,
    privilegedRoleCount: 1,
    publicCurrentAclGrantCount: 5,
    publicDefaultAclGrantCount: 1,
    roleCount: 2,
    roleDatabaseSettingCount: 1,
  });
  assert.ok(
    Object.values(receipt.categoryDigests).every((value) =>
      /^[a-f0-9]{64}$/u.test(value),
    ),
  );
});

test("receipt is secret-free while exact facts remain digest-bound", () => {
  const first = extractCurrent187SemanticRiskFacts(
    populatedInput("person@example.com password=top-secret"),
  );
  const second = extractCurrent187SemanticRiskFacts(
    populatedInput("different-sensitive-role"),
  );
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /person@example\.com/u);
  assert.doesNotMatch(serialized, /top-secret/u);
  assert.notEqual(
    first.semanticRiskFactsDigest,
    second.semanticRiskFactsDigest,
  );
  assert.notEqual(
    first.categoryDigests.loginRoles,
    second.categoryDigests.loginRoles,
  );
});

test("missing, extra, malformed, and non-canonical surfaces fail closed", () => {
  const missing = emptyInput();
  delete missing.roles;
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(missing),
    /exact required surfaces/u,
  );

  const extra = { ...emptyInput(), unexpected: [] };
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(extra),
    /exact required surfaces/u,
  );

  const malformed = emptyInput();
  malformed.roles = canonicalRows({ name: "partial" });
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(malformed),
    /unexpected shape/u,
  );

  const nonCanonical = emptyInput();
  nonCanonical.roles = ['{"superuser":false, "name":"not-canonical"}'];
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(nonCanonical),
    /could not be derived/u,
  );
});

test("proxy and accessor inputs are rejected without invoking accessors", () => {
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(new Proxy(emptyInput(), {})),
    /exact required surfaces/u,
  );

  let getterCalls = 0;
  const hostile = emptyInput();
  Object.defineProperty(hostile, "roles", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(hostile),
    /exact required surfaces/u,
  );
  assert.equal(getterCalls, 0);
});

test("inconsistent PUBLIC name and OID evidence fails closed", () => {
  const input = populatedInput();
  input.schemaAclAllGrantees = canonicalRows({
    grantable: false,
    granteeName: "not_public",
    granteeOid: "0",
    grantorName: "owner_role",
    grantorOid: "10",
    ownerOid: "10",
    privilege: "USAGE",
    schemaName: "public",
    schemaOid: "2200",
  });
  assert.throws(
    () => extractCurrent187SemanticRiskFacts(input),
    /could not be derived/u,
  );
});

test("extractor source has no filesystem, database, process, network, provider, or environment capability", async () => {
  const source = await readFile(
    new URL(
      "./identity-mail-cluster-semantic-risk-current187.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /(?:node:fs|node:child_process|@prisma|DATABASE_URL|postgresql:\/\/|process\.env|fetch\s*\(|smtp|providerPayload|secretManager)/iu,
  );
});

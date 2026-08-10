import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CANDIDATE,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_COMPLETED_MANIFEST_DIGEST,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_MANIFEST_DIGEST,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FINDINGS as F,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SOURCE_DIRECTORY,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SQL_SHA256,
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST,
  IdentityMailDutyRoleCurrent186FoundationError,
  checkIdentityMailDutyRoleCurrent186Foundation,
  inspectIdentityMailDutyRoleCurrent186Foundation,
  runIdentityMailDutyRoleCurrent186SelfTest,
} from "./identity-mail-duty-role-current186-foundation.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DIRECTORY = join(
  dirname(SCRIPT_DIRECTORY),
  "migration-candidates",
  IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SOURCE_DIRECTORY,
);
const SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const METADATA_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");
const ACL_PROTECTED_RELATIONS = Object.freeze([
  "IdentityMailDeliveryEvent",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDutyRoleAclEpochV1",
  "IdentityMailDutyRoleManifestEvidenceV2",
  "IdentityMailDutyRoleManifestRevocationV2",
  "IdentityMailOutbox",
  "IdentityEmailClaim",
  "SharedBetaRuntimeReleaseMarker",
  "Tenant",
  "UserInvite",
  "_prisma_migrations",
]);
const DEFINITION_RELATIONS = Object.freeze([
  "IdentityMailDeliveryEvent",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDutyRoleAclEpochV1",
  "IdentityMailDutyRoleManifestEvidenceV2",
  "IdentityMailDutyRoleManifestRevocationV2",
  "IdentityMailOutbox",
  "_prisma_migrations",
]);
const SUPPORT_ONLY_RELATIONS = Object.freeze([
  "IdentityEmailClaim",
  "SharedBetaRuntimeReleaseMarker",
  "Tenant",
  "UserInvite",
]);
const SCHEMA_OWNER_RELATIONS = Object.freeze([
  "IdentityMailDeliveryTenantEnrollmentCommand",
  "IdentityMailDeliveryTenantEnrollmentEvent",
  "IdentityMailDutyRoleAclEpochV1",
  "IdentityMailDutyRoleManifestEvidenceV2",
  "IdentityMailDutyRoleManifestRevocationV2",
]);
const DATABASE_OWNER_RELATIONS = Object.freeze(
  ACL_PROTECTED_RELATIONS.filter(
    (relation) => !SCHEMA_OWNER_RELATIONS.includes(relation),
  ),
);

function normalizedDigest(value) {
  return createHash("sha256")
    .update(value.replaceAll("\r\n", "\n").replaceAll("\r", "\n"), "utf8")
    .digest("hex");
}

async function source() {
  return {
    metadataText: await readFile(METADATA_PATH, "utf8"),
    sql: await readFile(SQL_PATH, "utf8"),
  };
}

function repinMetadata(metadataText, sql) {
  const metadata = JSON.parse(metadataText);
  metadata.migrationSqlSha256 = normalizedDigest(sql);
  return JSON.stringify(metadata);
}

function replaceInsideLiveAssert(value, searchValue, replacement) {
  const start = value.indexOf(
    'CREATE FUNCTION public."identity_mail_duty_role_live_assert_v1"',
  );
  const end = value.indexOf("\n$$;", start);
  assert.ok(start >= 0 && end > start, "CURRENT186 live assertion section");
  const section = value.slice(start, end);
  const mutated = section.replace(searchValue, replacement);
  assert.notEqual(mutated, section, String(searchValue));
  return `${value.slice(0, start)}${mutated}${value.slice(end)}`;
}

function replaceInsideProtectedSurface(value, searchValue, replacement) {
  const start = value.indexOf(
    "-- The duty-role scan above proves that none of the three bounded roles has",
  );
  const end = value.indexOf(
    "-- The exact PG16 system PUBLIC baseline is version-pinned below.",
    start,
  );
  assert.ok(start >= 0 && end > start, "CURRENT186 protected ACL surface");
  const section = value.slice(start, end);
  const mutated = section.replace(searchValue, replacement);
  assert.notEqual(mutated, section, String(searchValue));
  return `${value.slice(0, start)}${mutated}${value.slice(end)}`;
}

async function expectFinding(overrides, finding) {
  const report =
    await inspectIdentityMailDutyRoleCurrent186Foundation(overrides);
  assert.equal(report.decision, "CURRENT186_DUTY_ROLE_FOUNDATION_BLOCKED");
  assert.ok(report.findings.includes(finding), JSON.stringify(report));
}

test("accepts only the frozen non-authorizing CURRENT186 candidate", async () => {
  const report = await checkIdentityMailDutyRoleCurrent186Foundation();
  assert.equal(report.decision, "CURRENT186_DUTY_ROLE_FOUNDATION_COMPLIANT");
  assert.equal(report.authorization, false);
  assert.equal(report.applicationRoleAllowlistBound, false);
  assert.equal(report.authorityScope, "CURRENT_DATABASE_ONLY");
  assert.equal(report.canMutate, false);
  assert.equal(report.canSend, false);
  assert.equal(report.crossDatabaseAuthorityControlled, false);
  assert.equal(report.futureCreatorDefaultPrivilegesControlled, false);
  assert.equal(report.productionApplyAuthorized, false);
  assert.equal(report.status, "NOT_DEPLOYABLE");
  assert.deepEqual(report.findings, []);
  assert.equal(
    report.migrationSqlSha256,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SQL_SHA256,
  );
  assert.equal(
    report.completedMigrationManifestDigest,
    IDENTITY_MAIL_DUTY_ROLE_CURRENT186_COMPLETED_MANIFEST_DIGEST,
  );
});

test("self-test exercises all bounded fail-closed probes", async () => {
  const report = await runIdentityMailDutyRoleCurrent186SelfTest();
  assert.equal(
    report.decision,
    "CURRENT186_DUTY_ROLE_FOUNDATION_SELF_TEST_PASSED",
  );
  assert.equal(report.negativeProbes, 76);
});

test("fails closed on unreadable input and check throws a safe typed error", async () => {
  const report = await inspectIdentityMailDutyRoleCurrent186Foundation({
    sql: Promise.reject(new Error("bounded read failure")),
  });
  assert.deepEqual(report.findings, [F.READ_ERROR]);
  await assert.rejects(
    () =>
      checkIdentityMailDutyRoleCurrent186Foundation({
        metadataText: "{}",
        sql: "BEGIN;\nCOMMIT;\n",
      }),
    (error) => {
      assert.ok(error instanceof IdentityMailDutyRoleCurrent186FoundationError);
      assert.equal(error.exitCode, 3);
      assert.equal(
        error.code,
        "IDENTITY_MAIL_DUTY_ROLE_CURRENT186_FOUNDATION_BLOCKED",
      );
      return true;
    },
  );
});

test("pins metadata, SQL SHA, predecessor and exact candidate chain", async () => {
  const { metadataText, sql } = await source();
  await expectFinding({ metadataText: "{}", sql }, F.METADATA_DRIFT);
  await expectFinding(
    { metadataText, sql: `${sql}\n-- drift` },
    F.SQL_SHA_DRIFT,
  );

  const predecessor = JSON.parse(metadataText);
  predecessor.predecessor.count = 184;
  await expectFinding(
    { metadataText: JSON.stringify(predecessor), sql },
    F.PREDECESSOR_DRIFT,
  );
  await expectFinding(
    {
      candidateDirectories: [IDENTITY_MAIL_DUTY_ROLE_CURRENT186_CANDIDATE],
      metadataText,
      sql,
    },
    F.CANDIDATE_CHAIN_DRIFT,
  );
});

test("forbids role DDL, grants and production authority", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace("CREATE TABLE", "CREATE ROLE escaped;\nCREATE TABLE"),
      F.ROLE_DDL_FORBIDDEN,
    ],
    [
      sql.replace(
        "REVOKE ALL PRIVILEGES",
        "GRANT EXECUTE ON FUNCTION unsafe() TO PUBLIC;\nREVOKE ALL PRIVILEGES",
      ),
      F.GRANT_FORBIDDEN,
    ],
    [
      sql.replace("CREATE TABLE", "ALTER SYSTEM SET x = 'y';\nCREATE TABLE"),
      F.PRODUCTION_AUTHORITY_FORBIDDEN,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins transaction, epoch ledger, digest, CAS and inactive carry-forward", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace(
        "SET LOCAL lock_timeout = '5s';",
        "SET LOCAL lock_timeout = '0';",
      ),
      F.TRANSACTION_ENVELOPE,
    ],
    [sql.replace("MATCH FULL", "MATCH SIMPLE"), F.EPOCH_LEDGER_DRIFT],
    [
      sql.replaceAll(
        "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_ACL_EPOCH_CURRENT186_V1",
        "LEETPLUS_EPOCH_DRIFT",
      ),
      F.EPOCH_DIGEST_DOMAIN_DRIFT,
    ],
    [
      sql.replace(
        "epoch_value IS DISTINCT FROM current_epoch + 1",
        "epoch_value > current_epoch + 1",
      ),
      F.EPOCH_MONOTONICITY_DRIFT,
    ],
    [
      sql.replace(
        "Inactive ACL epochs must carry forward",
        "Inactive epochs may fork",
      ),
      F.EPOCH_MONOTONICITY_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins DB-derived evidence, live definitions, PUBLIC baseline and receipt scope", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace(
        "LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_REHEARSAL_EVIDENCE_CURRENT186_V1",
        "LEETPLUS_EVIDENCE_DRIFT",
      ),
      F.EVIDENCE_DIGEST_DRIFT,
    ],
    [
      sql.replaceAll(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_DEFINITION_MANIFEST_DIGEST,
        "0".repeat(64),
      ),
      F.DEFINITION_MANIFEST_DRIFT,
    ],
    [
      sql.replace(
        "('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_row_guard_trigger'::TEXT)",
        "('IdentityMailDeliveryEvent'::TEXT, 'IdentityMailDeliveryEvent_unpinned_trigger'::TEXT)",
      ),
      F.DEFINITION_MANIFEST_DRIFT,
    ],
    [
      sql.replace(
        IDENTITY_MAIL_DUTY_ROLE_CURRENT186_SYSTEM_PUBLIC_ACL_DIGEST,
        "0".repeat(64),
      ),
      F.PUBLIC_ACL_BASELINE_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        `('public."SharedBetaRuntimeReleaseMarker"."actualContextDigest"'::TEXT, 'SELECT'::TEXT)`,
        `('public."SharedBetaRuntimeReleaseMarker"."actualContextDigestRemoved"'::TEXT, 'SELECT'::TEXT)`,
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        `('public."Tenant"."id"'::TEXT, 'SELECT'::TEXT)`,
        `('public."Tenant"."idRemoved"'::TEXT, 'SELECT'::TEXT)`,
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideProtectedSurface(
        sql,
        "('Tenant'::TEXT),",
        "('TenantRemoved'::TEXT),",
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      sql.replace(
        "'authorityScope', 'CURRENT_DATABASE_ONLY'",
        "'authorityScope', 'CLUSTER_WIDE'",
      ),
      F.AUTHORITY_SCOPE_DRIFT,
    ],
    [
      sql.replace(
        "'applicationRoleAllowlistBound', false",
        "'applicationRoleAllowlistBound', true",
      ),
      F.AUTHORITY_SCOPE_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins the expanded support ACL matrix, CURRENT183 rewrites and IdentityEmailClaim narrowing", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      replaceInsideLiveAssert(
        sql,
        `('public."IdentityEmailClaim"."revision"'::TEXT, 'SELECT'::TEXT)`,
        `('public."IdentityEmailClaim"."revisionRemoved"'::TEXT, 'SELECT'::TEXT)`,
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        `('public."IdentityEmailClaim"."emailCanonical"'::TEXT, 'UPDATE'::TEXT)`,
        `('public."IdentityEmailClaim"."emailCanonical"'::TEXT, 'SELECT'::TEXT)`,
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      replaceInsideLiveAssert(
        sql,
        `'public."identity_email_claim_lock_v1"(text)'::TEXT`,
        `'public."identity_email_claim_lock_v0"(text)'::TEXT`,
      ),
      F.MARKER_COLUMN_AUTHORITY_DRIFT,
    ],
    [
      sql.replace(
        "ba68aaef2db7b6302bad2a4b385d211e19566639182be7b6a300f8ad7e429b7c",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "2037007f96e0626f46d3f6cfe7504383ac453e12e405c2d2b7ad4fd777cc52fb",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "02f349d30854af22c2f6dfacdb3322ad52c03f19fb9a36fc40f2ac3bb5d942ec",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "190bb0100186f233cd33f1b4bb4065dd4c401e5156e5b0e9ecb8c7ba190c5754",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "d6f6194029f390f8d9712b2d1dc25c821df0982f2e22a73660379d427e0a7db3",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "6baacb6fe11a7bbe0633986422f98d13c045e4038d5c1136ed94df080ae7af2e",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "patched_prosrc LIKE '%identity_claim.*%'",
        "patched_prosrc LIKE '%identity_claim.removed%'",
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(`identity_claim."revision"`, `identity_claim."createdAt"`),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        'NULL::VARCHAR(320) AS "emailCanonical"',
        'NULL::TEXT AS "emailCanonical"',
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "reap_email_order_expression CONSTANT TEXT :=\n    '    ORDER BY \"emailCanonical\"';",
        'reap_email_order_expression CONSTANT TEXT :=\n    E\'    ORDER BY \\"emailCanonical\\" COLLATE \\"C\\"\'',
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    assert.notEqual(mutatedSql, sql, finding);
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins 13 ACL and ownership-protected relations while definition evidence remains nine", async () => {
  const { metadataText, sql } = await source();
  const liveStart = sql.indexOf(
    'CREATE FUNCTION public."identity_mail_duty_role_live_assert_v1"',
  );
  const protectedStart = sql.indexOf(
    "-- The duty-role scan above proves that none of the three bounded roles has",
    liveStart,
  );
  const protectedEnd = sql.indexOf(
    "-- The exact PG16 system PUBLIC baseline is version-pinned below.",
    protectedStart,
  );
  assert.ok(liveStart >= 0 && protectedStart > liveStart);
  assert.ok(protectedEnd > protectedStart);
  const protectedSurface = sql.slice(protectedStart, protectedEnd);
  for (const relation of ACL_PROTECTED_RELATIONS) {
    assert.equal(
      protectedSurface.split(`('${relation}'::TEXT)`).length - 1,
      1,
      relation,
    );
  }

  const ownershipStart = sql.indexOf(
    "protected_owner_relations(relation_name) AS (",
    liveStart,
  );
  const databaseOwnershipStart = sql.indexOf(
    "underlying_relations(relation_name) AS (",
    ownershipStart,
  );
  const databaseOwnershipEnd = sql.indexOf(
    "\n  )\n  SELECT",
    databaseOwnershipStart,
  );
  assert.ok(
    ownershipStart > liveStart &&
      databaseOwnershipStart > ownershipStart &&
      databaseOwnershipEnd > databaseOwnershipStart,
  );
  const schemaOwnershipSurface = sql.slice(
    ownershipStart,
    databaseOwnershipStart,
  );
  const databaseOwnershipSurface = sql.slice(
    databaseOwnershipStart,
    databaseOwnershipEnd,
  );
  assert.match(
    sql.slice(
      databaseOwnershipEnd,
      sql.indexOf("INTO owner_surface_drift", databaseOwnershipEnd),
    ),
    /SELECT pg_catalog\.count\(\*\) IS DISTINCT FROM 5[\s\S]*FROM protected_owner_relations AS expected/u,
  );
  assert.match(
    sql.slice(
      databaseOwnershipEnd,
      sql.indexOf("INTO owner_surface_drift", databaseOwnershipEnd),
    ),
    /SELECT pg_catalog\.count\(\*\) IS DISTINCT FROM 8[\s\S]*FROM underlying_relations AS expected/u,
  );
  for (const relation of SCHEMA_OWNER_RELATIONS) {
    assert.equal(
      schemaOwnershipSurface.split(`('${relation}'::TEXT)`).length - 1,
      1,
      `schema-owner:${relation}`,
    );
  }
  for (const relation of DATABASE_OWNER_RELATIONS) {
    assert.equal(
      databaseOwnershipSurface.split(`('${relation}'::TEXT)`).length - 1,
      1,
      `database-owner:${relation}`,
    );
  }

  const postconditionStart = sql.indexOf("DO $postcondition$");
  const definitionRelationsEnd = sql.indexOf(
    "protected_relation_oids AS (",
    postconditionStart,
  );
  const definitionRelationsStart = sql.lastIndexOf(
    "protected_relations(relation_name) AS (",
    definitionRelationsEnd,
  );
  assert.ok(
    postconditionStart >= 0 &&
      definitionRelationsStart > postconditionStart &&
      definitionRelationsEnd > definitionRelationsStart,
  );
  const definitionSurface = sql.slice(
    definitionRelationsStart,
    definitionRelationsEnd,
  );
  for (const relation of DEFINITION_RELATIONS) {
    assert.equal(
      definitionSurface.split(`('${relation}'::TEXT)`).length - 1,
      1,
      relation,
    );
  }
  for (const relation of SUPPORT_ONLY_RELATIONS) {
    assert.equal(definitionSurface.includes(`('${relation}'::TEXT)`), false);
  }
  assert.match(sql, /protected_relation_count IS DISTINCT FROM 9/u);
  assert.match(sql, /definition_protected_relation_count IS DISTINCT FROM 9/u);

  const removedRelation = "SharedBetaRuntimeReleaseMarker";
  const tuple = `('${removedRelation}'::TEXT)`;
  const tupleOffset = protectedSurface.indexOf(tuple);
  assert.ok(tupleOffset >= 0);
  const absoluteOffset = protectedStart + tupleOffset;
  const missingAclRelation =
    sql.slice(0, absoluteOffset) +
    `('${removedRelation}Removed'::TEXT)` +
    sql.slice(absoluteOffset + tuple.length);
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, missingAclRelation),
      sql: missingAclRelation,
    },
    F.MARKER_COLUMN_AUTHORITY_DRIFT,
  );

  const widenedDefinitionSurface = sql.replace(
    "definition_protected_relation_count IS DISTINCT FROM 9",
    "definition_protected_relation_count IS DISTINCT FROM 13",
  );
  assert.notEqual(widenedDefinitionSurface, sql);
  await expectFinding(
    {
      metadataText: repinMetadata(metadataText, widenedDefinitionSurface),
      sql: widenedDefinitionSurface,
    },
    F.DEFINITION_MANIFEST_DRIFT,
  );
});

test("pins emergency zero-session enforcement and durable recovery sidecar", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace(
        "FROM pg_catalog.pg_stat_activity AS activity",
        "FROM pg_catalog.pg_stat_replication AS activity",
      ),
      F.EMERGENCY_SESSION_BARRIER_DRIFT,
    ],
    [
      sql.replace(
        "WHERE activity.usesysid IN (\n      owner_role.oid, coordinator_role.oid, worker_role.oid\n    )",
        "WHERE activity.usesysid IN (\n      coordinator_role.oid, worker_role.oid\n    )",
      ),
      F.EMERGENCY_SESSION_BARRIER_DRIFT,
    ],
    [
      sql.replace("BETWEEN 2 AND 600000", "BETWEEN 2 AND 65536"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace("IS DISTINCT FROM 39::BIGINT", "IS DISTINCT FROM 36::BIGINT"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        '"beforeCatalogCanonicalJson" TEXT,',
        '"beforeCatalogCanonicalJsonRemoved" TEXT,',
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replaceAll(
        "beforeCatalogStorageProfile",
        "beforeCatalogCanonicalJsonHex",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace("BETWEEN 2 AND 4194304", "BETWEEN 2 AND 4194305"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replaceAll(
        "EPOCH_COLUMN_CANONICAL_JSON_V1",
        "EPOCH_COLUMN_CANONICAL_JSON_DRIFT",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace("SET STORAGE EXTENDED", "SET STORAGE EXTERNAL"),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_V1'",
        "'LEETPLUS_IDENTITY_MAIL_DUTY_ROLE_CATALOG_CURRENT186_DRIFT'",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "Inactive ACL epochs require a null recovery sidecar",
        "Inactive ACL epochs accept a recovery sidecar",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "before_catalog_digest, p_before_catalog_canonical_json, plan_digest",
        "before_catalog_digest, NULL, plan_digest",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
    [
      sql.replace(
        "direct_duty_acl_digest IS DISTINCT FROM\n       observed_direct_duty_acl_digest",
        "direct_duty_acl_digest IS NOT DISTINCT FROM\n       observed_direct_duty_acl_digest",
      ),
      F.RECOVERY_BEFORE_IMAGE_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins global and tenant lock ordering plus exact function hardening", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [sql.replace("1279677004, 186", "1279677004, 187"), F.LOCK_DRIFT],
    [
      sql.replace(
        'tenant_id := public."identity_mail_tenant_lock_v1"(p_tenant_id);',
        "tenant_id := p_tenant_id;",
      ),
      F.LOCK_ORDER_DRIFT,
    ],
    [
      sql.replace(
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"',
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v0"',
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "identity_mail_duty_role_acl_epoch_append_v1(text,text,text)",
        "identity_mail_duty_role_acl_epoch_append_v1(text,text)",
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "'identity_mail_duty_role_acl_epoch_immutable_guard_v1'",
        "'identity_mail_duty_role_acl_immutable_guard_v1'",
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "04789b4d5504938ed4c4c64be66cd2e972e0fe89a410ba7a51bdef88a4d27c4a",
        "0".repeat(64),
      ),
      F.FUNCTION_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY DEFINER',
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY INVOKER',
      ),
      F.SECURITY_DEFINER_DRIFT,
    ],
    [
      sql.replace(
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY DEFINER\nSET search_path = pg_catalog',
        'CREATE FUNCTION public."identity_mail_duty_role_acl_lock_v1"()\nRETURNS BIGINT\nLANGUAGE plpgsql\nVOLATILE\nPARALLEL UNSAFE\nSECURITY DEFINER\nSET search_path = public',
      ),
      F.SEARCH_PATH_DRIFT,
    ],
    [
      sql.replace(
        "PERFORM pg_catalog.set_config('search_path', 'pg_catalog', true);",
        "PERFORM pg_catalog.set_config('search_path', 'public', true);",
      ),
      F.SEARCH_PATH_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins exhaustive live ACL, role binding and inactive driver denial", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace("has_database_privilege", "database_privilege_probe_removed"),
    sql.replace("has_schema_privilege", "schema_privilege_probe_removed"),
    sql.replace("has_table_privilege", "table_privilege_probe_removed"),
    sql.replace("has_sequence_privilege", "sequence_privilege_probe_removed"),
    sql.replace("has_column_privilege", "column_privilege_probe_removed"),
    sql.replace("has_function_privilege", "function_privilege_probe_removed"),
    sql.replace(
      "acl_record.\"reasonCode\" NOT IN ('APPLY', 'ROTATE')",
      "acl_record.\"reasonCode\" NOT IN ('APPLY', 'ROTATE', 'ROLLBACK')",
    ),
    sql.replace(
      "worker_role.rolcanlogin IS DISTINCT FROM true",
      "worker_role.rolcanlogin IS NULL",
    ),
    sql.replace(
      "protected surface has an unexpected principal",
      "protected principal accepted",
    ),
  ];
  for (const mutatedSql of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      F.ACL_DRIFT,
    );
  }

  await expectFinding(
    {
      metadataText: repinMetadata(
        metadataText,
        sql.replace(
          "owns an object outside the frozen allowlist",
          "owned object accepted",
        ),
      ),
      sql: sql.replace(
        "owns an object outside the frozen allowlist",
        "owned object accepted",
      ),
    },
    F.OWNERSHIP_SURFACE_DRIFT,
  );
  for (const [searchValue, replacement] of [
    [
      "deployment_role.rolname = session_user",
      "deployment_role.rolname = current_user",
    ],
    ["OR NOT deployment_role.rolsuper", "OR deployment_role.rolsuper"],
    [
      "deployment_role.rolsuper IS DISTINCT FROM true",
      "deployment_role.rolsuper IS DISTINCT FROM false",
    ],
  ]) {
    const mutatedSql = sql.replace(searchValue, replacement);
    assert.notEqual(mutatedSql, sql, searchValue);
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      F.OWNERSHIP_SURFACE_DRIFT,
    );
  }

  for (const [searchValue, replacement, finding] of [
    [
      "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT',\n       'RUNTIME_COORDINATOR'",
      "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'",
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      "p_reason_code <> 'RUNTIME_COORDINATOR'",
      "p_reason_code <> 'UNREACHABLE_RUNTIME_REASON'",
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      "coordinator_role.rolname = session_user",
      "coordinator_role.rolname = current_user",
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      "p_reason_code IN ('APPLY', 'ROTATE', 'RUNTIME_COORDINATOR')\n       AND caller_role_oid IS DISTINCT FROM p_schema_owner_role_oid::OID",
      "p_reason_code IN ('APPLY', 'ROTATE')\n       AND caller_role_oid IS DISTINCT FROM p_schema_owner_role_oid::OID",
      F.RUNTIME_CALLER_BINDING_DRIFT,
    ],
    [
      "    'RUNTIME_COORDINATOR',\n    acl_record.\"definitionManifestDigest\"::TEXT",
      '    acl_record."reasonCode",\n    acl_record."definitionManifestDigest"::TEXT',
      F.DRIVER_REFERENCE_SURFACE_DRIFT,
    ],
    [
      "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT'\n      )",
      "'APPLY', 'ROLLBACK', 'ROTATE', 'EMERGENCY_CONTAINMENT',\n        'RUNTIME_COORDINATOR'\n      )",
      F.EPOCH_LEDGER_DRIFT,
    ],
  ]) {
    const mutatedSql = sql.replace(searchValue, replacement);
    assert.notEqual(mutatedSql, sql, searchValue);
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
  await expectFinding(
    {
      metadataText: repinMetadata(
        metadataText,
        sql.replace(
          "FROM pg_catalog.pg_user_mappings AS mapping",
          "FROM pg_catalog.pg_user_mapping AS mapping",
        ),
      ),
      sql: sql.replace(
        "FROM pg_catalog.pg_user_mappings AS mapping",
        "FROM pg_catalog.pg_user_mapping AS mapping",
      ),
    },
    F.OWNERSHIP_SURFACE_DRIFT,
  );
});

test("pins append-only triggers and exact postcondition", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace(
        'CREATE TRIGGER "IdentityMailEnrollmentEvent_immutable_dml_v2_trigger"',
        'CREATE TRIGGER "IdentityMailEnrollmentEvent_mutable_dml_v2_trigger"',
      ),
      F.IMMUTABILITY_DRIFT,
    ],
    [
      sql.replace(
        "INNER JOIN protected_relations AS protected",
        "INNER JOIN expected AS protected",
      ),
      F.IMMUTABILITY_DRIFT,
    ],
    [
      sql.replace(
        "actual.enabled <> 'O'::\"char\"",
        "actual.enabled = 'D'::\"char\"",
      ),
      F.IMMUTABILITY_DRIFT,
    ],
    [
      sql.replace(
        "trigger_count IS DISTINCT FROM 21",
        "trigger_count IS DISTINCT FROM 20",
      ),
      F.POSTCONDITION_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins four-reference driver phases, replay and revocation continuation", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace(
        "p_manifest_payload_digest TEXT",
        "p_manifest_payload_digest JSONB",
      ),
      F.DRIVER_REFERENCE_SURFACE_DRIFT,
    ],
    [
      sql.replace(
        "THEN 'BEGIN_DRAIN' ELSE 'FINALIZE' END",
        "THEN 'BEGIN' ELSE 'FINALIZE' END",
      ),
      F.DRIVER_PHASE_DRIFT,
    ],
    [
      sql.replace("'phase', 'TERMINAL_REPLAY'", "'phase', 'REPLAY'"),
      F.DRIVER_REPLAY_DRIFT,
    ],
    [
      sql.replace("IF NOT is_continuation AND (", "IF true AND ("),
      F.DRIVER_REVOCATION_POLICY_DRIFT,
    ],
    [
      sql.replace(
        'observed_at >= command_record."expiresAt"',
        'observed_at > command_record."expiresAt"',
      ),
      F.EXPIRY_BOUNDARY_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

test("pins fresh DRAINING state, zero-inflight barrier and exact rollback mapping", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    [
      sql.replace("FOR UPDATE OF outbox", "FOR SHARE OF outbox"),
      F.DRIVER_ZERO_BARRIER_DRIFT,
    ],
    [
      sql.replace(
        "'CLAIMED'::public.\"IdentityMailOutboxStatus\"",
        "'SENT'::public.\"IdentityMailOutboxStatus\"",
      ),
      F.DRIVER_ZERO_BARRIER_DRIFT,
    ],
    [
      sql.replace("state-only pseudo-rollback", "state-only rollback allowed"),
      F.ROLLBACK_MAPPING_DRIFT,
    ],
    [
      sql.replace(
        'referenced_command."previousWorkerRoleName"',
        'referenced_command."targetWorkerRoleName"',
      ),
      F.ROLLBACK_MAPPING_DRIFT,
    ],
  ];
  for (const [mutatedSql, finding] of mutations) {
    await expectFinding(
      {
        metadataText: repinMetadata(metadataText, mutatedSql),
        sql: mutatedSql,
      },
      finding,
    );
  }
});

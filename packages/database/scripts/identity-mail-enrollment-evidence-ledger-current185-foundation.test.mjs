import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE,
  IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_FINDINGS as F,
  IdentityMailEnrollmentEvidenceLedgerCurrent185FoundationError,
  checkIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation,
  inspectIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation,
  runIdentityMailEnrollmentEvidenceLedgerCurrent185SelfTest,
} from "./identity-mail-enrollment-evidence-ledger-current185-foundation.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CANDIDATE_DIRECTORY = join(dirname(SCRIPT_DIRECTORY), "migration-candidates", IDENTITY_MAIL_ENROLLMENT_EVIDENCE_LEDGER_CURRENT185_CANDIDATE);
const SQL_PATH = join(CANDIDATE_DIRECTORY, "migration.sql");
const METADATA_PATH = join(CANDIDATE_DIRECTORY, "candidate.json");
const CHECKER_PATH = join(
  SCRIPT_DIRECTORY,
  "identity-mail-enrollment-evidence-ledger-current185-foundation.mjs",
);

async function source() {
  return { metadataText: await readFile(METADATA_PATH, "utf8"), sql: await readFile(SQL_PATH, "utf8") };
}

function repinMetadata(metadataText, sql) {
  const metadata = JSON.parse(metadataText);
  metadata.migrationSqlSha256 = createHash("sha256").update(sql.replaceAll("\r\n", "\n").replaceAll("\r", "\n")).digest("hex");
  return JSON.stringify(metadata);
}

async function expectFinding(overrides, finding) {
  const report = await inspectIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation(overrides);
  assert.equal(report.decision, "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_BLOCKED");
  assert.ok(report.findings.includes(finding), JSON.stringify(report));
}

test("accepts only the independently pinned CURRENT185 foundation", async () => {
  const report =
    await inspectIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation();
  assert.equal(report.decision, "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_COMPLIANT");
  assert.equal(report.authorization, false);
  assert.equal(report.canMutate, false);
  assert.equal(report.canSend, false);
  assert.deepEqual(report.findings, []);
  assert.equal(
    report.migrationSqlSha256,
    "2c8752ec4f92addabd21ace9be8071aea1e62be45887abb2c4944de2f96657e6",
  );
});

test("self-test exercises the bounded fail-closed probes", async () => {
  const report = await runIdentityMailEnrollmentEvidenceLedgerCurrent185SelfTest();
  assert.equal(report.decision, "CURRENT185_EVIDENCE_LEDGER_FOUNDATION_SELF_TEST_PASSED");
  assert.equal(report.negativeProbes, 24);
});

test("pins exact final column type, nullability, and default manifests", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "5e81817ee3ae2e8344e95e49e49800054907e410cc35eccc2a5b490b7786cfa2",
      "5e81817ee3ae2e8344e95e49e49800054907e410cc35eccc2a5b490b7786cfa3",
    ),
    sql.replace(
      "2c143eb3707f8f77f2922378b394ad6dab6e704893fb987fd2576edc94d73b0e",
      "2c143eb3707f8f77f2922378b394ad6dab6e704893fb987fd2576edc94d73b0f",
    ),
    sql.replace(
      "9086e1a3ed6a0767868a24696820c4639e4bba6b49aa257125e5ecc90c04d44e",
      "9086e1a3ed6a0767868a24696820c4639e4bba6b49aa257125e5ecc90c04d44f",
    ),
    sql.replace(
      "actual.column_manifest_digest IS DISTINCT FROM\n       expected.column_manifest_digest",
      "actual.column_manifest_digest =\n       expected.column_manifest_digest",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.FINAL_COLUMN_MANIFEST_DRIFT,
    );
  }
});

test("pins retained CURRENT184 RPC body, owner, ACL, and metadata continuity", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500c",
      "56158ecb99847863ab4d5974970f64c9d944062b6b44651bd8422e664969500d",
    ),
    sql.replace(
      "routine.proowner IS DISTINCT FROM command_owner_oid",
      "routine.proowner = command_owner_oid",
    ),
    sql.replace(
      "routine.proargdefaults IS NOT NULL",
      "routine.proargdefaults IS NULL",
    ),
    sql.replace(
      "privilege.is_grantable IS DISTINCT FROM false",
      "privilege.is_grantable IS DISTINCT FROM true",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.RETAINED_RPC_CONTINUITY_DRIFT,
    );
  }
});

test("pins the retained tenant lock exact signature, owner, ACL, and metadata", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "retained_tenant_lock_named_routine_count IS DISTINCT FROM 1",
      "retained_tenant_lock_named_routine_count IS DISTINCT FROM 2",
    ),
    sql.replace(
      "routine.proowner = command_owner_oid\n    AND routine.prokind",
      "routine.proowner <> command_owner_oid\n    AND routine.prokind",
    ),
    sql.replace(
      "routine.proargnames = ARRAY['p_tenant_id']::TEXT[]",
      "routine.proargnames = ARRAY['tenant_id']::TEXT[]",
    ),
    sql.replace(
      "routine.provariadic = 0::OID\n    AND routine.prorettype = 'text'",
      "routine.provariadic <> 0::OID\n    AND routine.prorettype = 'text'",
    ),
    sql.replace(
      ") = 1\n    AND NOT EXISTS (",
      ") = 2\n    AND NOT EXISTS (",
    ),
    sql.replace(
      "routine.proowner = owner_role.oid\n    AND routine.prokind",
      "routine.proowner <> owner_role.oid\n    AND routine.prokind",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.TENANT_LOCK_CONTINUITY_DRIFT,
    );
  }
});

test("pins the exact all-eight foreign-key catalog matrix", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "62, 60, 61, 58, 59, 63, 64, 65, 66, 67, 68, 69, 70",
      "60, 62, 61, 58, 59, 63, 64, 65, 66, 67, 68, 69, 70",
    ),
    sql.replace(
      "1, 2, 3, 16, 17, 18, 19, 20, 21, 29, 30, 31, 32",
      "1, 2, 3, 17, 16, 18, 19, 20, 21, 29, 30, 31, 32",
    ),
    sql.replace(
      "constraint_entry.conkey IS DISTINCT FROM expected.source_columns",
      "constraint_entry.conkey = expected.source_columns",
    ),
    sql.replace(
      "ARRAY[42, 43, 41, 44]::SMALLINT[]",
      "ARRAY[42, 41, 43, 44]::SMALLINT[]",
    ),
    sql.replace(
      "'Tenant'::TEXT,\n        ARRAY[2]::SMALLINT[]",
      "'SharedBetaRuntimeReleaseMarker'::TEXT,\n        ARRAY[2]::SMALLINT[]",
    ),
    sql.replace(
      "constraint_entry.confmatchtype IS DISTINCT FROM 's'::\"char\"",
      "constraint_entry.confmatchtype IS DISTINCT FROM 'f'::\"char\"",
    ),
    sql.replace(
      "constraint_entry.contype IS DISTINCT FROM 'f'::\"char\"",
      "constraint_entry.contype IS DISTINCT FROM 'c'::\"char\"",
    ),
    sql.replace(
      "constraint_entry.confupdtype IS DISTINCT FROM 'r'::\"char\"",
      "constraint_entry.confupdtype IS DISTINCT FROM 'c'::\"char\"",
    ),
    sql.replace(
      "constraint_entry.confdeltype IS DISTINCT FROM 'r'::\"char\"",
      "constraint_entry.confdeltype IS DISTINCT FROM 'c'::\"char\"",
    ),
    sql.replace(
      "ARRAY[1, 86]::SMALLINT[],\n        true,\n        true",
      "ARRAY[1, 86]::SMALLINT[],\n        false,\n        true",
    ),
    sql.replace(
      "constraint_entry.condeferred IS DISTINCT FROM expected.is_deferred",
      "constraint_entry.condeferred IS DISTINCT FROM false",
    ),
    sql.replace(
      "foreign_key_count IS DISTINCT FROM 8",
      "foreign_key_count IS DISTINCT FROM 7",
    ),
    sql.replace(
      "WHERE constraint_entry.contype = 'f'::\"char\"\n    AND constraint_entry.conrelid IN",
      "WHERE constraint_entry.contype = 'c'::\"char\"\n    AND constraint_entry.conrelid IN",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.COMPOSITE_BINDING_DRIFT,
    );
  }
});

test("rejects importer overloads and argument defaults in the catalog", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "unexpected_importer_routine_count IS DISTINCT FROM 0",
      "unexpected_importer_routine_count IS DISTINCT FROM 1",
    ),
    sql.replace(
      "importer_named_routine_count IS DISTINCT FROM 1",
      "importer_named_routine_count IS DISTINCT FROM 2",
    ),
    sql.replace(
      "routine.pronargs = 2\n    AND routine.pronargdefaults = 0",
      "routine.pronargs = 2\n    AND routine.pronargdefaults = 1",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.IMPORTER_CATALOG_DRIFT,
    );
  }
});

test("rejects predecessor column, constraint, or index manifest pin drift", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "(57, 'receiptDigest', 'character(64)', true, false)",
      "(57, 'receiptDigest', 'character(63)', true, false)",
    ),
    sql.replace(
      "be490e0aa6819487811dc010cdec3a9165f8b5134eef2acb2585f34886478617",
      "be490e0aa6819487811dc010cdec3a9165f8b5134eef2acb2585f34886478618",
    ),
    sql.replace(
      "4c92d9e5d371003ae3512e2c450ec2b981e6209a7ef1d56ffe2d8ff9dd10c8bc",
      "4c92d9e5d371003ae3512e2c450ec2b981e6209a7ef1d56ffe2d8ff9dd10c8bd",
    ),
    sql.replace(
      "b1722ac29aa6197dc73c5b0687779d9c2bfdbe8fffa9c03df48406ee1ab6d771",
      "b1722ac29aa6197dc73c5b0687779d9c2bfdbe8fffa9c03df48406ee1ab6d772",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.PREDECESSOR_CATALOG_DRIFT,
    );
  }
});

test("rejects reversed legacy receipt bridge direction", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    '"acceptedAt" = "importedAt"',
    '"importedAt" = "acceptedAt"',
  );
  assert.notEqual(mutatedSql, sql);
  await expectFinding(
    { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
    F.RECEIPT_SURFACE_DRIFT,
  );
});

test("requires importer-context INSERT guards and scoped set/clear ordering", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "Identity mail V2 evidence INSERT requires importer context",
      "Identity mail V2 evidence INSERT context missing",
    ),
    sql.replace(
      "    '',\n    true\n  );\n\n  RETURN import_receipt;",
      "    import_receipt_digest,\n    true\n  );\n\n  RETURN import_receipt;",
    ),
    sql.replace(
      'CREATE TRIGGER "IdentityMailManifestV2_import_insert_guard_trigger"',
      'CREATE TRIGGER "IdentityMailManifestV2_import_insert_guard_trigger_drift"',
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.IMPORT_INSERT_GUARD_DRIFT,
    );
  }
});

test("requires the exact four owner-only routine declarations and ACLs", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    'CREATE FUNCTION public."identity_mail_evidence_import_insert_guard_v2"()',
    'CREATE FUNCTION public."identity_mail_evidence_import_insert_guard_v2_drift"()',
  );
  assert.notEqual(mutatedSql, sql);
  await expectFinding(
    { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
    F.ACL_SURFACE_DRIFT,
  );
});

test("rejects revocation lock and stamp drift", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    'NEW."revokedAt" := pg_catalog.clock_timestamp();',
    'NEW."revokedAt" = pg_catalog.clock_timestamp();',
  );
  assert.notEqual(mutatedSql, sql);
  await expectFinding(
    { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
    F.REVOCATION_LOCK_DRIFT,
  );
});

test("requires exact postcondition ACL, routine, and trigger metadata", async () => {
  const { metadataText, sql } = await source();
  const mutations = [
    sql.replace(
      "column_acl_drift IS DISTINCT FROM 0",
      "column_acl_drift IS DISTINCT FROM 1",
    ),
    sql.replace(
      "routine_count IS DISTINCT FROM 4",
      "routine_count IS DISTINCT FROM 5",
    ),
    sql.replace(
      "'public.identity_mail_manifest_revocation_lock_v2()'\n    )",
      "'public.identity_mail_manifest_revocation_lock_v2_drift()'\n    )",
    ),
    sql.replace(
      "privilege.privilege_type = 'EXECUTE'",
      "privilege.privilege_type = 'USAGE'",
    ),
    sql.replace(
      "'IdentityMailManifestV2_import_insert_guard_trigger',\n        7,",
      "'IdentityMailManifestV2_import_insert_guard_trigger',\n        8,",
    ),
  ];
  for (const mutatedSql of mutations) {
    assert.notEqual(mutatedSql, sql);
    await expectFinding(
      { sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) },
      F.POSTCONDITION_DRIFT,
    );
  }
});

test("rejects missing command-to-manifest composite binding", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replaceAll('"dutyApplicationArtifactSha256"', '"dutyApplicationArtifactDigest"');
  await expectFinding({ sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) }, F.COMPOSITE_BINDING_DRIFT);
});

test("rejects PUBLIC authority and missing owner-only ACL", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace("FROM PUBLIC;", "TO PUBLIC;");
  await expectFinding({ sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) }, F.ACL_SURFACE_DRIFT);
});

test("rejects replay-before-expiry ordering drift", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace("IMPORT_REPLAY", "REPLAY_IMPORT");
  await expectFinding({ sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) }, F.REPLAY_ORDER_DRIFT);
});

test("rejects checksum drift even when metadata is unchanged", async () => {
  const { metadataText, sql } = await source();
  await expectFinding({ sql: `${sql}\n`, metadataText }, F.SQL_SHA_DRIFT);
});

test("rejects metadata authority or extra metadata fields", async () => {
  const { metadataText } = await source();
  const metadata = JSON.parse(metadataText);
  await expectFinding(
    { metadataText: JSON.stringify({ ...metadata, authorization: true }) },
    F.METADATA_DRIFT,
  );
  await expectFinding(
    { metadataText: JSON.stringify({ ...metadata, runtimeGrant: true }) },
    F.METADATA_DRIFT,
  );
});

test("rejects extra runtime authority", async () => {
  const { metadataText, sql } = await source();
  const mutatedSql = sql.replace(
    /\nCOMMIT;\s*$/u,
    "\nCREATE ROLE identity_mail_enrollment_runtime;\n\nCOMMIT;\n",
  );
  assert.notEqual(mutatedSql, sql);
  await expectFinding({ sql: mutatedSql, metadataText: repinMetadata(metadataText, mutatedSql) }, F.FORBIDDEN_AUTHORITY_OR_DML);
});

test("check throws a typed fail-closed error", async () => {
  await assert.rejects(checkIdentityMailEnrollmentEvidenceLedgerCurrent185Foundation({ candidateDirectories: [] }), (error) => {
    assert.ok(error instanceof IdentityMailEnrollmentEvidenceLedgerCurrent185FoundationError);
    assert.ok(error.findings.includes(F.CANDIDATE_CHAIN_DRIFT));
    return true;
  });
});

test("checker source remains read-only and dependency-minimal", async () => {
  const sourceText = await readFile(CHECKER_PATH, "utf8");
  assert.doesNotMatch(
    sourceText,
    /(?:writeFile|appendFile|rm\(|unlink|rename\(|copyFile|node:child_process|node:net|node:tls|@prisma|from\s+["']pg["'])/u,
  );
  assert.deepEqual(
    [...sourceText.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gmu)].map(
      (match) => match[1],
    ),
    [
      "node:assert/strict",
      "node:crypto",
      "node:fs/promises",
      "node:path",
      "node:url",
    ],
  );
});

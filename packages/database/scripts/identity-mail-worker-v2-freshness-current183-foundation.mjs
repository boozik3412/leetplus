import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CONTRACT =
  "IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_STATIC_V1";
export const IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE =
  "20260802010000_identity_mail_worker_v2_freshness_protocol";
export const IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_PREDECESSOR =
  "20260801030000_identity_mail_tenant_first_claim_protocol";
export const IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_ORDINAL = 183;

export const IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS =
  Object.freeze({
    ACL_SURFACE_DRIFT: "ACL_SURFACE_DRIFT",
    ARTIFACT_INVALID: "ARTIFACT_INVALID",
    CANDIDATE_CHAIN_DRIFT: "CANDIDATE_CHAIN_DRIFT",
    COORDINATOR_BYPASS_ADDED: "COORDINATOR_BYPASS_ADDED",
    EXECUTION_FENCE_MISSING: "EXECUTION_FENCE_MISSING",
    FORBIDDEN_DDL_OR_DML: "FORBIDDEN_DDL_OR_DML",
    FRESHNESS_CONTRACT_DRIFT: "FRESHNESS_CONTRACT_DRIFT",
    METADATA_DRIFT: "METADATA_DRIFT",
    PREDECESSOR_DRIFT: "PREDECESSOR_DRIFT",
    READINESS_PIN_DRIFT: "READINESS_PIN_DRIFT",
    ROUTINE_SURFACE_DRIFT: "ROUTINE_SURFACE_DRIFT",
    SQL_SHA_DRIFT: "SQL_SHA_DRIFT",
    TRANSACTION_ENVELOPE_INVALID: "TRANSACTION_ENVELOPE_INVALID",
  });

const EXPECTED_CANONICAL_COUNT = 179;
const EXPECTED_CANONICAL_HEAD =
  "20260731120000_identity_mail_delivery_release_head";
const EXPECTED_CANONICAL_MANIFEST_DIGEST =
  "3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431";
const EXPECTED_PREDECESSOR_MANIFEST_DIGEST =
  "d30a07005d8df4940b05af4b2c6b340704387ed59446f4334e8765c287c71ffd";
const EXPECTED_PREDECESSOR_SHA256 =
  "4367c2c50b036ae21c22b88dc0980895c9010abb018c3f7a04d58ed0f00efa22";
const EXPECTED_CURRENT183_SHA256 =
  "9c2df1d3462d48d60a90c5f020ca11a8b54faeca3138f77beaa2223c2053e3a1";
const EXPECTED_CANDIDATE_DIRECTORIES = Object.freeze([
  "20260801010000_identity_mail_tenant_enrollment_control_plane",
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_PREDECESSOR,
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE,
]);
const EXPECTED_REPLACED_ROUTINES = Object.freeze([
  "identity_mail_tenant_lock_v1",
  "identity_mail_delivery_worker_assert_v2",
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/u;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANONICAL_DIRECTORY = join(DATABASE_DIRECTORY, "prisma", "migrations");
const CANDIDATES_DIRECTORY = join(DATABASE_DIRECTORY, "migration-candidates");
const CURRENT183_DIRECTORY = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE,
);

const HELP = `
Identity-mail worker-v2 freshness CURRENT183 static gate

Usage:
  node scripts/identity-mail-worker-v2-freshness-current183-foundation.mjs --check
  node scripts/identity-mail-worker-v2-freshness-current183-foundation.mjs --self-test
  node scripts/identity-mail-worker-v2-freshness-current183-foundation.mjs --help

The command is read-only. A compliant result does not authorize migration,
enrollment, runtime wiring, email delivery, or production mutation.
`.trim();

export class IdentityMailWorkerV2FreshnessCurrent183FoundationError extends Error {
  constructor(findings) {
    super("Identity-mail worker-v2 CURRENT183 freshness foundation is blocked.");
    this.name = "IdentityMailWorkerV2FreshnessCurrent183FoundationError";
    this.code = "IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_BLOCKED";
    this.findings = Object.freeze([...new Set(findings)].sort());
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return String(value ?? "").replaceAll("\r\n", "\n");
}

function manifestDigest(entries) {
  const manifest = [...entries]
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map(({ name, checksum }) => `${name} ${checksum}`)
    .join("\n");
  return sha256(`${manifest}\n`);
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
}

function functionBody(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION public\\."${escaped}"\\([\\s\\S]*?\\nAS \\$\\$\\n([\\s\\S]*?)\\n\\$\\$;`,
      "u",
    ),
  );
  return match?.[1] ?? null;
}

async function migrationEntries(directory) {
  const directories = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && MIGRATION_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    directories.map(async (name) => ({
      name,
      checksum: sha256(
        Buffer.from(
          normalizeSql(
            await readFile(join(directory, name, "migration.sql"), "utf8"),
          ),
          "utf8",
        ),
      ),
    })),
  );
}

async function candidateDirectories() {
  return (await readdir(CANDIDATES_DIRECTORY, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && MIGRATION_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function inspectSql(sql, findings) {
  const F = IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS;
  const beginCount = (sql.match(/^BEGIN;$/gmu) ?? []).length;
  const commitCount = (sql.match(/^COMMIT;$/gmu) ?? []).length;
  if (
    beginCount !== 1 ||
    commitCount !== 1 ||
    !sql.startsWith("BEGIN;\n") ||
    !sql.endsWith("COMMIT;\n") ||
    sql.indexOf("SET LOCAL lock_timeout = '5s';") < 0 ||
    sql.indexOf("SET LOCAL statement_timeout = '180s';") < 0
  ) {
    findings.push(F.TRANSACTION_ENVELOPE_INVALID);
  }

  if (
    !sql.includes(
      "leetplus.identity_mail_worker_v2_freshness_current183_confirmation",
    ) ||
    !sql.includes(
      "rehearse-noncanonical-identity-mail-worker-v2-freshness-current183",
    ) ||
    !sql.includes("^lp_imtec_[0-9a-f]{32}_ci$") ||
    !sql.includes(
      "leetplus.identity_mail_worker_v2_freshness_current183_sha256",
    ) ||
    !sql.includes("one exact unfinished Prisma rehearsal receipt")
  ) {
    findings.push(F.EXECUTION_FENCE_MISSING);
  }

  const declarations = [...sql.matchAll(
    /CREATE OR REPLACE FUNCTION public\."([^"]+)"/gu,
  )].map((match) => match[1]);
  const allFunctionDeclarations = [
    ...sql.matchAll(/^\s*CREATE\s+OR\s+REPLACE\s+FUNCTION\b/gimu),
  ];
  if (
    allFunctionDeclarations.length !== EXPECTED_REPLACED_ROUTINES.length ||
    declarations.length !== EXPECTED_REPLACED_ROUTINES.length ||
    declarations.some((name, index) => name !== EXPECTED_REPLACED_ROUTINES[index])
  ) {
    findings.push(F.ROUTINE_SURFACE_DRIFT);
  }

  const doTags = [
    ...sql.matchAll(/^\s*DO\s+\$([a-z_][a-z0-9_]*)\$/gimu),
  ].map((match) => match[1]);
  if (
    doTags.length !== 2 ||
    doTags[0] !== "prerequisite" ||
    doTags[1] !== "postcondition"
  ) {
    findings.push(F.TRANSACTION_ENVELOPE_INVALID);
  }

  if (
    /^\s*(?:ALTER\s+|CREATE\s+(?!OR\s+REPLACE\s+FUNCTION\b)|DROP\s+|GRANT\s+|INSERT\s+|UPDATE\s+|DELETE\s+|TRUNCATE\s+)/imu.test(
      sql,
    )
  ) {
    findings.push(F.FORBIDDEN_DDL_OR_DML);
  }

  const postconditionStart = sql.indexOf("DO $postcondition$");
  const postconditionEnd = sql.indexOf("$postcondition$;", postconditionStart);
  if (
    postconditionStart < 0 ||
    postconditionEnd < 0 ||
    sql.slice(postconditionEnd + "$postcondition$;".length) !== "\n\nCOMMIT;\n"
  ) {
    findings.push(F.TRANSACTION_ENVELOPE_INVALID);
  }

  if (
    /identity_mail_tenant_enrollment_(?:apply|enable|begin_drain|resume|finalize|rollback)/iu.test(
      sql,
    ) ||
    /DISABLE\s+TRIGGER|session_replication_role/iu.test(sql)
  ) {
    findings.push(F.COORDINATOR_BYPASS_ADDED);
  }

  const lockBody = functionBody(sql, "identity_mail_tenant_lock_v1");
  if (
    lockBody === null ||
    !lockBody.includes("'read committed'") ||
    lockBody.includes("'serializable'") ||
    !lockBody.includes("transaction_isolation") ||
    !lockBody.includes("transaction_read_only") ||
    !lockBody.includes("statement_timeout") ||
    !lockBody.includes("pg_advisory_xact_lock") ||
    !lockBody.includes("leetplus:identity-mail-tenant:v1:") ||
    !lockBody.includes(", 180") ||
    /public\."(?:Identity|UserInvite|Tenant)/u.test(lockBody)
  ) {
    findings.push(F.FRESHNESS_CONTRACT_DRIFT);
  }

  const assertBody = functionBody(
    sql,
    "identity_mail_delivery_worker_assert_v2",
  );
  const lockIndex = assertBody?.indexOf(
    'public."identity_mail_tenant_lock_v1"(p_tenant_id)',
  ) ?? -1;
  const enrollmentIndex = assertBody?.indexOf(
    'public."IdentityMailDeliveryTenantEnrollment"',
  ) ?? -1;
  if (
    assertBody === null ||
    lockIndex < 0 ||
    enrollmentIndex < 0 ||
    lockIndex >= enrollmentIndex ||
    !assertBody.includes("migration_count IS DISTINCT FROM 183") ||
    !assertBody.includes(
      "20260802010000_identity_mail_worker_v2_freshness_protocol",
    ) ||
    !assertBody.includes("database receipt is not exact CURRENT_183") ||
    !assertBody.includes("'candidateStatus', 'NOT_DEPLOYABLE'") ||
    !assertBody.includes("'authorization', false") ||
    !assertBody.includes("'canSend', false") ||
    !assertBody.includes("'candidateChecksum', candidate_checksum")
  ) {
    findings.push(F.READINESS_PIN_DRIFT);
  }

  for (const body of [lockBody, assertBody]) {
    if (body === null) continue;
    // pg_proc.prosrc retains both LF characters inside `AS $$\n...\n$$`.
    // Pin the catalog representation, not only the text captured between them.
    const bodyDigest = sha256(`\n${body}\n`);
    if (!sql.includes(`'${bodyDigest}'`)) {
      findings.push(F.ROUTINE_SURFACE_DRIFT);
    }
  }

  if (
    !sql.includes(
      'REVOKE ALL PRIVILEGES\nON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT)\nFROM PUBLIC;',
    ) ||
    !sql.includes(
      'REVOKE ALL PRIVILEGES\nON FUNCTION public."identity_mail_delivery_worker_assert_v2"(TEXT, TEXT)\nFROM PUBLIC;',
    ) ||
    !sql.includes("CURRENT_183 installed a non-owner EXECUTE grant") ||
    !sql.includes("privilege.grantee <> routine.proowner")
  ) {
    findings.push(F.ACL_SURFACE_DRIFT);
  }
}

export async function inspectIdentityMailWorkerV2FreshnessCurrent183Foundation(
  overrides = {},
) {
  const F = IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS;
  const findings = [];
  const canonical = await migrationEntries(CANONICAL_DIRECTORY);
  const directories =
    overrides.candidateDirectories ?? (await candidateDirectories());
  const sql = normalizeSql(
    overrides.sql ??
      (await readFile(join(CURRENT183_DIRECTORY, "migration.sql"), "utf8")),
  );
  const metadataText =
    overrides.metadataText ??
    (await readFile(join(CURRENT183_DIRECTORY, "candidate.json"), "utf8"));

  if (
    canonical.length !== EXPECTED_CANONICAL_COUNT ||
    canonical.at(-1)?.name !== EXPECTED_CANONICAL_HEAD ||
    manifestDigest(canonical) !== EXPECTED_CANONICAL_MANIFEST_DIGEST
  ) {
    findings.push(F.ARTIFACT_INVALID);
  }

  if (
    JSON.stringify(directories) !== JSON.stringify(EXPECTED_CANDIDATE_DIRECTORIES)
  ) {
    findings.push(F.CANDIDATE_CHAIN_DRIFT);
  }

  let metadata = null;
  try {
    metadata = JSON.parse(metadataText);
  } catch {
    findings.push(F.METADATA_DRIFT);
  }
  if (
    !exactKeys(metadata, [
      "schemaVersion",
      "contract",
      "candidate",
      "ordinal",
      "predecessor",
      "migrationSqlSha256",
      "authorization",
      "canMutate",
      "status",
    ]) ||
    metadata?.schemaVersion !== 1 ||
    metadata?.contract !==
      "IDENTITY_MAIL_WORKER_V2_FRESHNESS_PROTOCOL_CANDIDATE_V1" ||
    metadata?.candidate !==
      IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE ||
    metadata?.ordinal !== IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_ORDINAL ||
    metadata?.authorization !== false ||
    metadata?.canMutate !== false ||
    metadata?.status !== "NOT_DEPLOYABLE" ||
    !SHA256_PATTERN.test(String(metadata?.migrationSqlSha256 ?? ""))
  ) {
    findings.push(F.METADATA_DRIFT);
  }

  if (
    !exactKeys(metadata?.predecessor, [
      "count",
      "head",
      "manifestDigest",
      "headChecksum",
    ]) ||
    metadata?.predecessor?.count !== 182 ||
    metadata?.predecessor?.head !==
      IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_PREDECESSOR ||
    metadata?.predecessor?.manifestDigest !==
      EXPECTED_PREDECESSOR_MANIFEST_DIGEST ||
    metadata?.predecessor?.headChecksum !== EXPECTED_PREDECESSOR_SHA256
  ) {
    findings.push(F.PREDECESSOR_DRIFT);
  }

  const actualSqlSha256 = sha256(sql);
  if (
    metadata?.migrationSqlSha256 !== actualSqlSha256 ||
    actualSqlSha256 !== EXPECTED_CURRENT183_SHA256
  ) {
    findings.push(F.SQL_SHA_DRIFT);
  }

  if (
    !sql.includes("completed_migration_count IS DISTINCT FROM 182") ||
    !sql.includes(IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_PREDECESSOR) ||
    !sql.includes(EXPECTED_PREDECESSOR_MANIFEST_DIGEST) ||
    !sql.includes(EXPECTED_PREDECESSOR_SHA256)
  ) {
    findings.push(F.PREDECESSOR_DRIFT);
  }

  inspectSql(sql, findings);

  if (findings.length > 0) {
    return Object.freeze({
      authorization: false,
      canMutate: false,
      candidate: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE,
      contract: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CONTRACT,
      decision: "CURRENT183_FOUNDATION_BLOCKED",
      findings: Object.freeze([...new Set(findings)].sort()),
    });
  }

  return Object.freeze({
    authorization: false,
    canMutate: false,
    candidate: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CANDIDATE,
    contract: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_CONTRACT,
    coordinator: "NOT_IMPLEMENTED_GUARDS_PRESERVED",
    decision: "CURRENT183_FOUNDATION_COMPLIANT",
    findings: Object.freeze([]),
    migrationSqlSha256: actualSqlSha256,
    ordinal: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_ORDINAL,
  });
}

export async function checkIdentityMailWorkerV2FreshnessCurrent183Foundation(
  overrides = {},
) {
  const report =
    await inspectIdentityMailWorkerV2FreshnessCurrent183Foundation(overrides);
  if (report.decision !== "CURRENT183_FOUNDATION_COMPLIANT") {
    throw new IdentityMailWorkerV2FreshnessCurrent183FoundationError(
      report.findings,
    );
  }
  return report;
}

export async function runIdentityMailWorkerV2FreshnessCurrent183SelfTest() {
  const baseline =
    await checkIdentityMailWorkerV2FreshnessCurrent183Foundation();
  assert.equal(baseline.decision, "CURRENT183_FOUNDATION_COMPLIANT");
  const sql = await readFile(join(CURRENT183_DIRECTORY, "migration.sql"), "utf8");
  const metadataText = await readFile(
    join(CURRENT183_DIRECTORY, "candidate.json"),
    "utf8",
  );

  const probes = [
    {
      expected: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS
        .FRESHNESS_CONTRACT_DRIFT,
      overrides: { sql: sql.replace("'read committed'", "'serializable'") },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS
        .READINESS_PIN_DRIFT,
      overrides: {
        sql: sql.replace(
          "migration_count IS DISTINCT FROM 183",
          "migration_count IS DISTINCT FROM 182",
        ),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS
        .ACL_SURFACE_DRIFT,
      overrides: {
        sql: sql.replace(
          'REVOKE ALL PRIVILEGES\nON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT)\nFROM PUBLIC;',
          'GRANT EXECUTE ON FUNCTION public."identity_mail_tenant_lock_v1"(TEXT) TO PUBLIC;',
        ),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS
        .COORDINATOR_BYPASS_ADDED,
      overrides: {
        sql: `${sql.slice(0, -8)}\nSET LOCAL session_replication_role = 'replica';\nCOMMIT;\n`,
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS
        .METADATA_DRIFT,
      overrides: {
        metadataText: JSON.stringify({
          ...JSON.parse(metadataText),
          authorization: true,
        }),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_FRESHNESS_CURRENT183_FINDINGS
        .CANDIDATE_CHAIN_DRIFT,
      overrides: {
        candidateDirectories: EXPECTED_CANDIDATE_DIRECTORIES.slice(0, -1),
      },
    },
  ];

  for (const probe of probes) {
    const report =
      await inspectIdentityMailWorkerV2FreshnessCurrent183Foundation(
        probe.overrides,
      );
    assert.equal(report.decision, "CURRENT183_FOUNDATION_BLOCKED");
    assert.ok(report.findings.includes(probe.expected));
  }

  return Object.freeze({
    decision: "CURRENT183_FOUNDATION_SELF_TEST_PASSED",
    negativeProbes: probes.length,
  });
}

async function main() {
  const [argument] = process.argv.slice(2);
  if (argument === "--help") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (argument === "--self-test") {
    process.stdout.write(
      `${JSON.stringify(await runIdentityMailWorkerV2FreshnessCurrent183SelfTest())}\n`,
    );
    return;
  }
  if (argument === "--check") {
    process.stdout.write(
      `${JSON.stringify(await checkIdentityMailWorkerV2FreshnessCurrent183Foundation())}\n`,
    );
    return;
  }
  throw new Error(HELP);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof IdentityMailWorkerV2FreshnessCurrent183FoundationError) {
      process.stderr.write(
        `${JSON.stringify({ code: error.code, findings: error.findings })}\n`,
      );
    } else {
      process.stderr.write(`${String(error?.stack ?? error)}\n`);
    }
    process.exitCode = 1;
  });
}

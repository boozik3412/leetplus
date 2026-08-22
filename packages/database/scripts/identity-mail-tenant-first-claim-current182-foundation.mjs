import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CURRENT182_FOUNDATION_SCRIPT_NAME =
  "identity-mail-tenant-first-claim-current182-foundation";

const CURRENT181 = "20260801020000_identity_mail_tenant_lock_drain_worker_v2";
const CURRENT181_SHA256 =
  "c923d26d77fbb268fccc03d6eff0539a75c2644059d7f7ffc2493491c88f69ac";
const CURRENT181_MANIFEST_DIGEST =
  "ba90c13072d9afb2cc942b3cde1d01a789772605c69b71d3b273a0cb5a6e97f6";
const CURRENT182 = "20260801030000_identity_mail_tenant_first_claim_protocol";
const CURRENT182_CONTRACT =
  "IDENTITY_MAIL_TENANT_FIRST_CLAIM_PROTOCOL_CANDIDATE_V1";
const CURRENT182_CONFIRMATION =
  "rehearse-noncanonical-identity-mail-tenant-first-claim-current182";
const CURRENT182_CONFIRMATION_GUC =
  "leetplus.identity_mail_tenant_first_claim_current182_confirmation";
const CURRENT182_SHA256_GUC =
  "leetplus.identity_mail_tenant_first_claim_current182_sha256";
const CURRENT181_HELPER_PROSRC_SHA256 =
  "31c675561131be5f7b8b20b417567d084fda580da2f6d449eae9470b3808e817";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_PACKAGE_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const CANDIDATE_DIRECTORY = join(
  DATABASE_PACKAGE_DIRECTORY,
  "migration-candidates",
  CURRENT182,
);
const CURRENT181_SQL_PATH = join(
  DATABASE_PACKAGE_DIRECTORY,
  "migration-candidates",
  CURRENT181,
  "migration.sql",
);

export const CURRENT182_FOUNDATION_FINDINGS = Object.freeze({
  ACL_DRIFT: "CURRENT182_ACL_DRIFT",
  CANONICAL_SIGNATURE_DRIFT: "CURRENT182_CANONICAL_SIGNATURE_DRIFT",
  CURRENT181_DRIFT: "CURRENT182_PREDECESSOR_CURRENT181_DRIFT",
  LEGACY_STUB_DRIFT: "CURRENT182_LEGACY_STUB_DRIFT",
  METADATA_DRIFT: "CURRENT182_METADATA_DRIFT",
  MUTATION_SURFACE_DRIFT: "CURRENT182_MUTATION_SURFACE_DRIFT",
  POSTCONDITION_DRIFT: "CURRENT182_POSTCONDITION_DRIFT",
  PREREQUISITE_DRIFT: "CURRENT182_PREREQUISITE_DRIFT",
  SQL_SHA_DRIFT: "CURRENT182_SQL_SHA_DRIFT",
  TENANT_LOCK_ORDER_DRIFT: "CURRENT182_TENANT_LOCK_ORDER_DRIFT",
  TRANSACTION_BOUNDARY_DRIFT: "CURRENT182_TRANSACTION_BOUNDARY_DRIFT",
});

const CANONICAL_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: "identity_email_claim_reserve_invite_v2",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT"]),
    prosrcSha256:
      "d8e6dfb1634be66e6a4f3be87fc480f2e4a5aba417a97e26eff8ccdefbaed6b5",
  }),
  Object.freeze({
    name: "identity_email_claim_assert_invite_v1",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT", "INTEGER"]),
    prosrcSha256:
      "148532adcee88fe3dd309912d0929e53cb8c3a71c4c838bfa50535df21046bed",
  }),
  Object.freeze({
    name: "identity_email_claim_assert_invite_locator_v1",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT", "INTEGER"]),
    prosrcSha256:
      "59d2de1db1405e4c9cf66b3ba25cfe341639f92b293173280f0e36e059a8050d",
  }),
  Object.freeze({
    name: "identity_email_claim_transition_v2",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "INTEGER",
      "TEXT",
      "TEXT",
    ]),
    prosrcSha256:
      "e6b34e1044f9ffa7dffd95eb09ac7e4f08e640d7ef6146b99bf9c42ed3802775",
  }),
  Object.freeze({
    name: "identity_email_claim_release_v2",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT", "TEXT", "INTEGER"]),
    prosrcSha256:
      "39e553ed4e89ff2054a8b462827175779cf6829fde36f02e28cafca64310ac12",
  }),
]);

const LEGACY_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: "identity_email_claim_reserve_invite_v1",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT"]),
  }),
  Object.freeze({
    name: "identity_email_claim_transition_v1",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "INTEGER",
      "TEXT",
      "TEXT",
    ]),
  }),
  Object.freeze({
    name: "identity_email_claim_release_v1",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT", "TEXT", "INTEGER"]),
  }),
]);

const ALL_FUNCTIONS = Object.freeze([
  ...CANONICAL_FUNCTIONS,
  ...LEGACY_FUNCTIONS,
]);
const LEGACY_STUB_BODY =
  "BEGIN RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED' USING ERRCODE = '55000'; END;";
const TENANT_LOCK_CALL = 'public."identity_mail_tenant_lock_v1"';
const EMAIL_LOCK_CALL = 'public."identity_email_claim_lock_v1"';
const ZERO_SHA256 = "0".repeat(64);
const HELP = `
Identity mail tenant-first claim CURRENT182 static gate

Usage:
  node scripts/${CURRENT182_FOUNDATION_SCRIPT_NAME}.mjs --check
  node scripts/${CURRENT182_FOUNDATION_SCRIPT_NAME}.mjs --self-test
  node scripts/${CURRENT182_FOUNDATION_SCRIPT_NAME}.mjs --help

The command is read-only. --check validates the frozen migration.sql and its
pinned SHA-256. A compliant result does not authorize deployment or mutation.
`.trim();

function normalizeSql(value) {
  return String(value ?? "").replaceAll("\r\n", "\n");
}

function compactSql(value) {
  return normalizeSql(value).replaceAll(/\s+/gu, " ").trim();
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeJson(value) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function occurrenceCount(value, fragment) {
  if (fragment.length === 0) return 0;
  return String(value).split(fragment).length - 1;
}

function functionBlock(sql, name) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const start = new RegExp(
    `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\."${escapedName}"\\s*\\(`,
    "iu",
  ).exec(sql)?.index;
  if (typeof start !== "number") return "";
  const next = /\n(?:CREATE|ALTER|DROP|COMMENT|REVOKE|DO\s+\$)\s/giu;
  next.lastIndex = start + 1;
  const end = next.exec(sql)?.index ?? sql.length;
  return sql.slice(start, end);
}

export function current182FunctionBody(sql, name) {
  const block = functionBlock(normalizeSql(sql), name);
  const match = /\bAS\s+\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/iu.exec(block);
  return match?.[2] ?? "";
}

function functionArgumentTypes(sql, name) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(
    `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\."${escapedName}"\\s*\\(`,
    "iu",
  ).exec(sql);
  if (!match || typeof match.index !== "number") return [];
  const open = sql.indexOf("(", match.index);
  let depth = 0;
  let close = -1;
  for (let index = open; index < sql.length; index += 1) {
    if (sql[index] === "(") depth += 1;
    if (sql[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  if (open < 0 || close < 0) return [];
  const argumentsText = sql.slice(open + 1, close);
  const arguments_ = [];
  let current = "";
  depth = 0;
  for (const character of argumentsText) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      arguments_.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim().length > 0) arguments_.push(current);
  return arguments_.map(
    (argument) =>
      /(?:^|\s)(JSONB|BIGINT|INTEGER|TEXT|BYTEA)$/u.exec(
        argument.replaceAll(/\s+/gu, " ").trim().toUpperCase(),
      )?.[1] ?? "UNKNOWN",
  );
}

function exactArray(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function sqlTypePattern(type) {
  return `(?:pg_catalog\\.)?${type}`;
}

function hasExactPublicRevoke(sql, { name, argumentTypes }) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const argumentPattern = argumentTypes.map(sqlTypePattern).join("\\s*,\\s*");
  return new RegExp(
    `\\bREVOKE\\s+ALL\\s+PRIVILEGES\\s+ON\\s+FUNCTION\\s+public\\."${escapedName}"\\s*\\(\\s*${argumentPattern}\\s*\\)\\s+FROM\\s+PUBLIC\\s*;`,
    "iu",
  ).test(sql);
}

function routineSignature({ name, argumentTypes }) {
  return `public."${name}"(${argumentTypes
    .map((type) => type.toLowerCase())
    .join(",")})`;
}

function firstRelationAccess(body) {
  const match =
    /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\./iu.exec(
      body,
    );
  return match?.index ?? -1;
}

function stripFunctionBodies(sql) {
  return sql.replaceAll(
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b[\s\S]*?\bAS\s+\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$\s*;/giu,
    "CREATE FUNCTION <body omitted>;",
  );
}

function addFinding(findings, finding, condition) {
  if (condition && !findings.includes(finding)) findings.push(finding);
}

export function validateCurrent182Foundation(input) {
  const findings = [];
  const metadata = safeJson(input?.candidateMetadataText);
  const candidateSql = normalizeSql(input?.candidateSql);
  const predecessorSql = normalizeSql(input?.predecessorSql);

  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.CURRENT181_DRIFT,
    sha256(Buffer.from(predecessorSql, "utf8")) !== CURRENT181_SHA256,
  );

  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.METADATA_DRIFT,
    metadata === null ||
      metadata.schemaVersion !== 1 ||
      metadata.contract !== CURRENT182_CONTRACT ||
      metadata.candidate !== CURRENT182 ||
      metadata.ordinal !== 182 ||
      metadata.authorization !== false ||
      metadata.canMutate !== false ||
      metadata.status !== "NOT_DEPLOYABLE" ||
      metadata.predecessor?.count !== 181 ||
      metadata.predecessor?.head !== CURRENT181 ||
      metadata.predecessor?.manifestDigest !== CURRENT181_MANIFEST_DIGEST ||
      metadata.predecessor?.headChecksum !== CURRENT181_SHA256,
  );

  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.SQL_SHA_DRIFT,
    metadata === null ||
      metadata.migrationSqlSha256 !== sha256(Buffer.from(candidateSql, "utf8")),
  );

  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.TRANSACTION_BOUNDARY_DRIFT,
    occurrenceCount(candidateSql, "BEGIN;") !== 1 ||
      occurrenceCount(candidateSql, "COMMIT;") !== 1 ||
      candidateSql.trimEnd().endsWith("COMMIT;") !== true,
  );

  const prerequisiteFragments = [
    "^lp_imtec_[0-9a-f]{32}_ci$",
    CURRENT182_CONFIRMATION_GUC,
    CURRENT182_SHA256_GUC,
    CURRENT182_CONFIRMATION,
    "completed_migration_count IS DISTINCT FROM 181",
    CURRENT181,
    CURRENT181_SHA256,
    CURRENT181_MANIFEST_DIGEST,
    "candidate_receipt_applied_steps IS DISTINCT FROM 0",
    CURRENT181_HELPER_PROSRC_SHA256,
    "CURRENT_182 requires owner-only tenant and identity claim routines",
  ];
  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.PREREQUISITE_DRIFT,
    prerequisiteFragments.some((fragment) => !candidateSql.includes(fragment)),
  );

  for (const spec of CANONICAL_FUNCTIONS) {
    const body = current182FunctionBody(candidateSql, spec.name);
    const tenantLockIndex = body.indexOf(TENANT_LOCK_CALL);
    const emailLockIndex = body.indexOf(EMAIL_LOCK_CALL);
    const relationAccessIndex = firstRelationAccess(body);
    addFinding(
      findings,
      CURRENT182_FOUNDATION_FINDINGS.CANONICAL_SIGNATURE_DRIFT,
      body.length === 0 ||
        !exactArray(
          functionArgumentTypes(candidateSql, spec.name),
          spec.argumentTypes,
        ),
    );
    addFinding(
      findings,
      CURRENT182_FOUNDATION_FINDINGS.TENANT_LOCK_ORDER_DRIFT,
      occurrenceCount(body, TENANT_LOCK_CALL) !== 1 ||
        occurrenceCount(body, EMAIL_LOCK_CALL) !== 1 ||
        tenantLockIndex < 0 ||
        emailLockIndex < 0 ||
        tenantLockIndex > emailLockIndex ||
        (relationAccessIndex >= 0 && tenantLockIndex > relationAccessIndex),
    );
  }

  for (const spec of LEGACY_FUNCTIONS) {
    const body = current182FunctionBody(candidateSql, spec.name);
    addFinding(
      findings,
      CURRENT182_FOUNDATION_FINDINGS.CANONICAL_SIGNATURE_DRIFT,
      body.length === 0 ||
        !exactArray(
          functionArgumentTypes(candidateSql, spec.name),
          spec.argumentTypes,
        ),
    );
    addFinding(
      findings,
      CURRENT182_FOUNDATION_FINDINGS.LEGACY_STUB_DRIFT,
      compactSql(body) !== LEGACY_STUB_BODY ||
        /\b(?:SELECT|INSERT|UPDATE|DELETE|PERFORM)\b|_lock_v1/iu.test(body),
    );
  }

  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.ACL_DRIFT,
    ALL_FUNCTIONS.some((spec) => !hasExactPublicRevoke(candidateSql, spec)) ||
      /\bGRANT\b/iu.test(candidateSql),
  );

  const postconditionFragments = [
    "DO $postcondition$",
    "pg_catalog.sha256(",
    "pg_catalog.convert_to(routine.prosrc, 'UTF8')",
    "routine.proowner IS DISTINCT FROM migration_owner_oid",
    'routine.prosecdef IS DISTINCT FROM expected."security_definer"',
    "routine.proparallel IS DISTINCT FROM 'u'::\"char\"",
    "routine.proconfig IS DISTINCT FROM",
    "ARRAY['search_path=pg_catalog']::TEXT[]",
    "routine ACL is not owner-only",
    "pg_catalog.aclexplode(",
    CURRENT181_HELPER_PROSRC_SHA256,
    ...ALL_FUNCTIONS.flatMap((spec) => [
      routineSignature(spec),
      spec.prosrcSha256 ??
        "cb85b2de740b9af3c79d2df5e470a506523db773164b78d5352f3d92443da2ef",
    ]),
  ];
  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.POSTCONDITION_DRIFT,
    candidateSql.includes(ZERO_SHA256) ||
      postconditionFragments.some(
        (fragment) => !candidateSql.includes(fragment),
      ),
  );

  const topLevelSql = stripFunctionBodies(candidateSql);
  addFinding(
    findings,
    CURRENT182_FOUNDATION_FINDINGS.MUTATION_SURFACE_DRIFT,
    /\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|TABLE|INDEX|TRIGGER|TYPE)\b/iu.test(
      topLevelSql,
    ) ||
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?!"_prisma_migrations")/iu.test(
        topLevelSql,
      ) ||
      /\bauthorization\s*[:=]\s*true\b|\bcanMutate\s*[:=]\s*true\b/iu.test(
        `${input?.candidateMetadataText ?? ""}\n${candidateSql}`,
      ),
  );

  return Object.freeze({
    authorization: false,
    canMutate: false,
    candidate: CURRENT182,
    decision:
      findings.length === 0
        ? "CURRENT182_FOUNDATION_COMPLIANT"
        : "NON_COMPLIANT",
    findings: Object.freeze([...findings].sort()),
    status: "NOT_DEPLOYABLE",
  });
}

export async function readCurrent182FoundationInputs() {
  const [candidateMetadataText, candidateSql, predecessorSql] =
    await Promise.all([
      readFile(join(CANDIDATE_DIRECTORY, "candidate.json"), "utf8"),
      readFile(join(CANDIDATE_DIRECTORY, "migration.sql"), "utf8"),
      readFile(CURRENT181_SQL_PATH, "utf8"),
    ]);
  return { candidateMetadataText, candidateSql, predecessorSql };
}

export async function runCurrent182Foundation() {
  const report = validateCurrent182Foundation(
    await readCurrent182FoundationInputs(),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.findings.length > 0) process.exitCode = 1;
  return report;
}

export async function runCurrent182FoundationSelfTest() {
  const baselineInput = await readCurrent182FoundationInputs();
  const baseline = validateCurrent182Foundation(baselineInput);
  assertSelfTest(
    baseline.decision === "CURRENT182_FOUNDATION_COMPLIANT",
    "baseline",
  );
  const probes = [
    {
      finding: CURRENT182_FOUNDATION_FINDINGS.METADATA_DRIFT,
      mutate(input) {
        const metadata = JSON.parse(input.candidateMetadataText);
        metadata.authorization = true;
        input.candidateMetadataText = JSON.stringify(metadata);
      },
    },
    {
      finding: CURRENT182_FOUNDATION_FINDINGS.SQL_SHA_DRIFT,
      mutate(input) {
        input.candidateSql += "\n-- self-test checksum drift\n";
      },
    },
    {
      finding: CURRENT182_FOUNDATION_FINDINGS.CURRENT181_DRIFT,
      mutate(input) {
        input.predecessorSql += "\n-- self-test predecessor drift\n";
      },
    },
    {
      finding: CURRENT182_FOUNDATION_FINDINGS.TENANT_LOCK_ORDER_DRIFT,
      mutate(input) {
        const body = current182FunctionBody(
          input.candidateSql,
          "identity_email_claim_reserve_invite_v2",
        );
        const mutated = body
          .replace(TENANT_LOCK_CALL, "__CURRENT182_SELF_TEST_SWAP__")
          .replace(EMAIL_LOCK_CALL, TENANT_LOCK_CALL)
          .replace("__CURRENT182_SELF_TEST_SWAP__", EMAIL_LOCK_CALL);
        assertSelfTest(mutated !== body, "tenant-lock-order fixture");
        input.candidateSql = input.candidateSql.replace(body, mutated);
      },
    },
    {
      finding: CURRENT182_FOUNDATION_FINDINGS.LEGACY_STUB_DRIFT,
      mutate(input) {
        input.candidateSql = input.candidateSql.replace(
          "BEGIN\n  RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED'",
          "BEGIN\n  PERFORM 1 FROM public.\"IdentityEmailClaim\";\n  RAISE EXCEPTION 'LEGACY_IDENTITY_CLAIM_WRITER_RETIRED'",
        );
      },
    },
  ];
  for (const [index, probe] of probes.entries()) {
    const input = {
      candidateMetadataText: baselineInput.candidateMetadataText,
      candidateSql: baselineInput.candidateSql,
      predecessorSql: baselineInput.predecessorSql,
    };
    probe.mutate(input);
    const report = validateCurrent182Foundation(input);
    assertSelfTest(
      report.findings.includes(probe.finding),
      `probe ${index + 1}: ${probe.finding}`,
    );
  }
  const report = Object.freeze({
    authorization: false,
    baselineDecision: baseline.decision,
    canMutate: false,
    candidate: CURRENT182,
    probesPassed: probes.length,
    status: "SELF_TEST_PASSED",
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return report;
}

function assertSelfTest(condition, label) {
  if (!condition) throw new Error(`CURRENT182 self-test failed: ${label}`);
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (argv.length !== 1 || !new Set(["--check", "--self-test"]).has(argv[0])) {
    process.stderr.write("Use --check, --self-test, or --help.\n");
    return 2;
  }
  if (argv[0] === "--self-test") {
    await runCurrent182FoundationSelfTest();
    return 0;
  }
  const report = await runCurrent182Foundation();
  return report.findings.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const isMain =
  invokedPath.length > 0 && pathToFileURL(invokedPath).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
      process.exitCode = 1;
    });
}

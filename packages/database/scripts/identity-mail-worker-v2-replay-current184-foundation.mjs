import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CONTRACT =
  "IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_STATIC_V1";
export const IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE =
  "20260802020000_identity_mail_worker_v2_lost_response_replay";
export const IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_PREDECESSOR =
  "20260802010000_identity_mail_worker_v2_freshness_protocol";
export const IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_ORDINAL = 184;

export const IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS =
  Object.freeze({
    ACL_SURFACE_DRIFT: "ACL_SURFACE_DRIFT",
    ARTIFACT_INVALID: "ARTIFACT_INVALID",
    CANDIDATE_CHAIN_DRIFT: "CANDIDATE_CHAIN_DRIFT",
    COLUMN_SURFACE_DRIFT: "COLUMN_SURFACE_DRIFT",
    CONSTRAINT_SURFACE_DRIFT: "CONSTRAINT_SURFACE_DRIFT",
    EVENT_APPEND_DRIFT: "EVENT_APPEND_DRIFT",
    EXECUTION_FENCE_MISSING: "EXECUTION_FENCE_MISSING",
    FORBIDDEN_AUTHORITY_OR_DML: "FORBIDDEN_AUTHORITY_OR_DML",
    HELPER_EXPOSURE_DRIFT: "HELPER_EXPOSURE_DRIFT",
    METADATA_DRIFT: "METADATA_DRIFT",
    PREDECESSOR_DRIFT: "PREDECESSOR_DRIFT",
    READINESS_PIN_DRIFT: "READINESS_PIN_DRIFT",
    REPLAY_CONTRACT_DRIFT: "REPLAY_CONTRACT_DRIFT",
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
  "70f66215bdadf0652ade1640e9dd20cf565d25a81d5d319a4c3d68c4e1c9e256";
const EXPECTED_PREDECESSOR_SHA256 =
  "a3b92838cac386480384abb770aa06a9f2cb27b4326d5c6f9344f9019b26f2f0";
const EXPECTED_CURRENT184_SHA256 =
  "d889537c9c0e6c8d6862062fd5cd1a45f5f26409993cb3cbba64446dfe71c424";
const EXPECTED_CANDIDATE_DIRECTORIES = Object.freeze([
  "20260801010000_identity_mail_tenant_enrollment_control_plane",
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2",
  "20260801030000_identity_mail_tenant_first_claim_protocol",
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_PREDECESSOR,
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE,
]);
const EXPECTED_CREATED_ROUTINES = Object.freeze([
  "identity_mail_delivery_event_append_v2",
  "identity_initial_owner_mail_provider_mark_v2",
  "identity_initial_owner_mail_complete_v2",
  "identity_mail_delivery_worker_assert_v2",
]);
const EXPECTED_RENAMED_ROUTINES = Object.freeze([
  Object.freeze({
    from: "identity_initial_owner_mail_provider_mark_v2",
    to: "identity_initial_owner_mail_provider_mark_current183",
  }),
  Object.freeze({
    from: "identity_initial_owner_mail_complete_v2",
    to: "identity_initial_owner_mail_complete_current183",
  }),
]);
const EXPECTED_CHANGED_ROUTINES = Object.freeze([
  "identity_mail_delivery_event_append_v2",
  "identity_initial_owner_mail_provider_mark_current183",
  "identity_initial_owner_mail_complete_current183",
  "identity_initial_owner_mail_provider_mark_v2",
  "identity_initial_owner_mail_complete_v2",
  "identity_mail_delivery_worker_assert_v2",
]);
const EXPECTED_OWNER_ONLY_SIGNATURES = Object.freeze([
  'public."identity_mail_delivery_event_append_v2"()',
  'public."identity_mail_delivery_worker_assert_v2"(text,text)',
  'public."identity_initial_owner_mail_claim_v2"(text,text,text,text)',
  'public."identity_initial_owner_mail_provider_mark_v2"(text,text,integer,text,text,text,text,text)',
  'public."identity_initial_owner_mail_complete_v2"(text,text,integer,text,text,text,text,text,text)',
  'public."identity_initial_owner_mail_reap_v2"(text,text,text,integer)',
  'public."identity_initial_owner_mail_reconcile_v2"(text,text,bigint,text,text,text)',
  'public."identity_initial_owner_mail_provider_mark_current183"(text,text,integer,text,text,text,text,text)',
  'public."identity_initial_owner_mail_complete_current183"(text,text,integer,text,text,text,text,text,text)',
]);
const IMPLEMENTATION_HELPER_NAMES = Object.freeze([
  "identity_initial_owner_mail_provider_mark_current183",
  "identity_initial_owner_mail_complete_current183",
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/u;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANONICAL_DIRECTORY = join(DATABASE_DIRECTORY, "prisma", "migrations");
const CANDIDATES_DIRECTORY = join(DATABASE_DIRECTORY, "migration-candidates");
const API_SOURCE_DIRECTORY = join(
  dirname(dirname(DATABASE_DIRECTORY)),
  "apps",
  "api",
  "src",
);
const CURRENT184_DIRECTORY = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE,
);

const HELP = `
Identity-mail worker-v2 lost-response replay CURRENT184 static gate

Usage:
  node scripts/identity-mail-worker-v2-replay-current184-foundation.mjs --check
  node scripts/identity-mail-worker-v2-replay-current184-foundation.mjs --self-test
  node scripts/identity-mail-worker-v2-replay-current184-foundation.mjs --help

The command is read-only. A compliant result does not authorize migration,
runtime grants, worker wiring, email delivery, or production mutation.
`.trim();

export class IdentityMailWorkerV2ReplayCurrent184FoundationError extends Error {
  constructor(findings) {
    super("Identity-mail worker-v2 CURRENT184 replay foundation is blocked.");
    this.name = "IdentityMailWorkerV2ReplayCurrent184FoundationError";
    this.code = "IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_BLOCKED";
    this.findings = Object.freeze([...new Set(findings)].sort());
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeSql(value) {
  return String(value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
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
      `CREATE(?: OR REPLACE)? FUNCTION public\\."${escaped}"\\([\\s\\S]*?\\nAS \\$\\$\\n([\\s\\S]*?)\\n\\$\\$;`,
      "u",
    ),
  );
  return match?.[1] ?? null;
}

function maskDollarQuotedBodies(sql) {
  const opener = /\$([a-z_][a-z0-9_]*)?\$/gimu;
  let cursor = 0;
  let masked = "";
  while (true) {
    opener.lastIndex = cursor;
    const match = opener.exec(sql);
    if (match === null) break;
    const token = match[0];
    const closeAt = sql.indexOf(token, opener.lastIndex);
    if (closeAt < 0) break;
    masked += sql.slice(cursor, match.index) + token + token;
    cursor = closeAt + token.length;
  }
  return masked + sql.slice(cursor);
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
          normalizeSql(await readFile(join(directory, name, "migration.sql"), "utf8")),
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

async function candidateMigrationEntries(names) {
  return Promise.all(
    names.map(async (name) => ({
      name,
      checksum: sha256(
        Buffer.from(
          normalizeSql(
            await readFile(
              join(CANDIDATES_DIRECTORY, name, "migration.sql"),
              "utf8",
            ),
          ),
          "utf8",
        ),
      ),
    })),
  );
}

async function sourceText(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      parts.push(await sourceText(path));
    } else if (entry.isFile() && /\.(?:ts|tsx|mjs)$/u.test(entry.name)) {
      parts.push(await readFile(path, "utf8"));
    }
  }
  return parts.join("\n");
}

function inspectTransactionAndSurface(sql, findings) {
  const F = IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS;
  const topLevelSql = maskDollarQuotedBodies(sql);
  const beginCount = (sql.match(/^BEGIN;$/gmu) ?? []).length;
  const commitCount = (sql.match(/^COMMIT;$/gmu) ?? []).length;
  if (
    beginCount !== 1 ||
    commitCount !== 1 ||
    !sql.startsWith("BEGIN;\n") ||
    !sql.endsWith("COMMIT;\n") ||
    !sql.includes("SET LOCAL lock_timeout = '5s';") ||
    !sql.includes("SET LOCAL statement_timeout = '180s';")
  ) {
    findings.push(F.TRANSACTION_ENVELOPE_INVALID);
  }

  if (
    !sql.includes("leetplus.identity_mail_worker_v2_replay_current184_confirmation") ||
    !sql.includes("rehearse-noncanonical-identity-mail-worker-v2-replay-current184") ||
    !sql.includes("leetplus.identity_mail_worker_v2_replay_current184_sha256") ||
    !sql.includes("^lp_imtec_[0-9a-f]{32}_ci$") ||
    !sql.includes("one exact unfinished Prisma rehearsal receipt")
  ) {
    findings.push(F.EXECUTION_FENCE_MISSING);
  }

  const doTags = [...sql.matchAll(/^\s*DO\s+\$([a-z_][a-z0-9_]*)\$/gimu)].map(
    (match) => match[1],
  );
  const postconditionStart = sql.indexOf("DO $postcondition$");
  const postconditionEnd = sql.indexOf("$postcondition$;", postconditionStart);
  if (
    JSON.stringify(doTags) !== JSON.stringify(["prerequisite", "postcondition"]) ||
    postconditionStart < 0 ||
    postconditionEnd < 0 ||
    sql.slice(postconditionEnd + "$postcondition$;".length) !== "\n\nCOMMIT;\n"
  ) {
    findings.push(F.TRANSACTION_ENVELOPE_INVALID);
  }

  if (
    /^\s*(?:CREATE\s+(?:TABLE|VIEW|MATERIALIZED|TRIGGER|ROLE|USER|SCHEMA|DATABASE)\b|DROP\s+|GRANT\s+|INSERT\s+|UPDATE\s+|DELETE\s+|TRUNCATE\s+|ALTER\s+(?:ROLE|USER|DATABASE)\b)/gimu.test(
      topLevelSql,
    ) ||
    /\b(?:CREATE|ALTER)\s+(?:ROLE|USER)\b|\bGRANT\s+EXECUTE\b|session_replication_role|DISABLE\s+TRIGGER/iu.test(
      sql,
    )
  ) {
    findings.push(F.FORBIDDEN_AUTHORITY_OR_DML);
  }
}

function inspectColumnsAndConstraints(sql, findings) {
  const F = IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS;
  const alterStart = sql.indexOf(
    'ALTER TABLE public."IdentityMailDeliveryEvent"',
  );
  const uniqueStart = sql.indexOf("CREATE UNIQUE INDEX", alterStart);
  const constraintSql =
    alterStart >= 0 && uniqueStart > alterStart
      ? sql.slice(alterStart, uniqueStart)
      : "";
  const addColumns = [...sql.matchAll(/\bADD\s+COLUMN\s+"([^"]+)"/gimu)].map(
    (match) => match[1],
  );
  if (
    JSON.stringify(addColumns) !==
      JSON.stringify(["transitionRequestDigest", "settlementState"]) ||
    !/ADD\s+COLUMN\s+"transitionRequestDigest"\s+CHAR\(64\)(?:\s+NULL)?/iu.test(sql) ||
    !/ADD\s+COLUMN\s+"settlementState"\s+VARCHAR\(16\)(?:\s+NULL)?/iu.test(sql) ||
    (sql.match(/ALTER\s+TABLE\s+public\."IdentityMailDeliveryEvent"/gimu) ?? [])
      .length < 1
  ) {
    findings.push(F.COLUMN_SURFACE_DRIFT);
  }

  const uniqueIndexPattern =
    /CREATE\s+UNIQUE\s+INDEX\s+"[^"]+"\s+ON\s+public\."IdentityMailDeliveryEvent"\s*\(\s*"tenantId"\s*,\s*"outboxId"\s*,\s*"transitionRequestDigest"\s*\)\s+WHERE\s+"transitionRequestDigest"\s+IS\s+NOT\s+NULL/imu;
  if (
    !uniqueIndexPattern.test(sql) ||
    (sql.match(/\bADD\s+CONSTRAINT\s+"[^"]+"\s+CHECK\s*\(/gimu) ?? []).length < 1 ||
    !constraintSql.includes('"transitionRequestDigest" IS NULL') ||
    !constraintSql.includes('"transitionRequestDigest" IS NOT NULL') ||
    !constraintSql.includes('"settlementState" IS NULL') ||
    !constraintSql.includes('"settlementState" IS NOT NULL') ||
    !constraintSql.includes("^[0-9a-f]{64}$") ||
    !constraintSql.includes('"eventType" IN (')
  ) {
    findings.push(F.CONSTRAINT_SURFACE_DRIFT);
  }
}

function inspectRoutines(sql, findings) {
  const F = IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS;
  const declarations = [
    ...sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\."([^"]+)"/gu),
  ].map((match) => match[1]);
  const creationKinds = [
    ...sql.matchAll(/CREATE( OR REPLACE)? FUNCTION public\."([^"]+)"/gu),
  ].map((match) => match[1] !== undefined);
  const allDeclarations = [
    ...sql.matchAll(/^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gimu),
  ];
  if (
    declarations.length !== EXPECTED_CREATED_ROUTINES.length ||
    allDeclarations.length !== EXPECTED_CREATED_ROUTINES.length ||
    declarations.some((name, index) => name !== EXPECTED_CREATED_ROUTINES[index]) ||
    JSON.stringify(creationKinds) !== JSON.stringify([true, false, false, true])
  ) {
    findings.push(F.ROUTINE_SURFACE_DRIFT);
  }

  const renames = [
    ...sql.matchAll(
      /ALTER FUNCTION public\."([^"]+)"\([\s\S]*?\)\s+RENAME TO "([^"]+)";/gu,
    ),
  ].map((match) => ({ from: match[1], to: match[2] }));
  const alterFunctionCount = (
    sql.match(/^\s*ALTER\s+FUNCTION\b/gimu) ?? []
  ).length;
  if (
    alterFunctionCount !== EXPECTED_RENAMED_ROUTINES.length ||
    JSON.stringify(renames) !== JSON.stringify(EXPECTED_RENAMED_ROUTINES)
  ) {
    findings.push(F.ROUTINE_SURFACE_DRIFT);
  }

  const eventBody = functionBody(sql, "identity_mail_delivery_event_append_v2");
  if (
    eventBody === null ||
    !eventBody.includes('"transitionRequestDigest"') ||
    !eventBody.includes('"settlementState"') ||
    !eventBody.includes("WHEN transition_request_digest IS NULL THEN") ||
    !eventBody.includes("LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V2") ||
    !eventBody.includes("LEETPLUS_IDENTITY_MAIL_DELIVERY_EVENT_V3") ||
    !eventBody.includes("identity_mail_delivery_event")
  ) {
    findings.push(F.EVENT_APPEND_DRIFT);
  }

  const providerBody = functionBody(
    sql,
    "identity_initial_owner_mail_provider_mark_v2",
  );
  const completeBody = functionBody(sql, "identity_initial_owner_mail_complete_v2");
  const replayBodies = [
    {
      body: providerBody,
      domain: "LEETPLUS_IDENTITY_MAIL_PROVIDER_MARK_REQUEST_V2",
      helper: 'public."identity_initial_owner_mail_provider_mark_current183"(',
      replay: "'decision', 'HANDOFF'",
    },
    {
      body: completeBody,
      domain: "LEETPLUS_IDENTITY_MAIL_COMPLETE_REQUEST_V2",
      helper: 'public."identity_initial_owner_mail_complete_current183"(',
      replay: `'decision', replay_event."toStatus"::TEXT`,
    },
  ];
  for (const { body, domain, helper, replay } of replayBodies) {
    const lockIndex =
      body?.indexOf('public."identity_mail_tenant_lock_v1"(p_tenant_id)') ?? -1;
    const replayIndex =
      body?.indexOf('FROM public."IdentityMailDeliveryEvent"') ?? -1;
    const helperIndex = body?.indexOf(helper) ?? -1;
    if (
      body === null ||
      lockIndex < 0 ||
      replayIndex < 0 ||
      helperIndex < 0 ||
      lockIndex >= replayIndex ||
      replayIndex >= helperIndex ||
      !body.includes('"transitionRequestDigest"') ||
      !body.includes('"settlementState"') ||
      !body.includes(domain) ||
      !body.includes("leetplus.identity_mail_transition_request_digest") ||
      !body.includes("leetplus.identity_mail_settlement_state") ||
      !hasExactDrainingAuthority(body) ||
      !body.includes(replay) ||
      !body.includes("candidateStatus") ||
      !body.includes("NOT_DEPLOYABLE")
    ) {
      findings.push(F.REPLAY_CONTRACT_DRIFT);
      break;
    }
  }

  const assertBody = functionBody(sql, "identity_mail_delivery_worker_assert_v2");
  if (
    assertBody === null ||
    !assertBody.includes("migration_count IS DISTINCT FROM 184") ||
    !assertBody.includes(IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE) ||
    !assertBody.includes("database receipt is not exact CURRENT_184") ||
    !assertBody.includes("'candidateStatus', 'NOT_DEPLOYABLE'") ||
    !assertBody.includes("'authorization', false") ||
    !assertBody.includes("'canSend', false")
  ) {
    findings.push(F.READINESS_PIN_DRIFT);
  }

}

function hasExactDrainingAuthority(body) {
  return [
    `command_record."action" NOT IN ('ROTATE', 'DISABLE')`,
    `command_record."drainStateRevision" IS DISTINCT FROM\n         enrollment_record."stateRevision"`,
    `command_record."expectedPolicyRevision" IS DISTINCT FROM\n         enrollment_record."policyRevision"`,
    `command_record."previousWorkerRoleName" IS DISTINCT FROM\n         enrollment_record."workerRoleName"`,
    `command_record."previousWorkerRoleName" IS DISTINCT FROM\n         session_user`,
    `command_record."previousWorkerRoleOid" IS DISTINCT FROM\n         enrollment_record."workerRoleOid"`,
    `command_record."previousWorkerRoleOid" IS DISTINCT FROM\n         worker_role_record.oid::BIGINT`,
    `command_record."previousProviderAuthorityDigest" IS DISTINCT FROM\n         p_provider_authority_digest`,
    `command_record."previousConfigurationDigest" IS DISTINCT FROM\n         enrollment_record."currentConfigurationDigest"`,
  ].every((predicate) => body.includes(predicate));
}

function inspectAcl(sql, findings) {
  const F = IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS;
  const postconditionStart = sql.indexOf("DO $postcondition$");
  const postconditionEnd = sql.indexOf("$postcondition$;", postconditionStart);
  const postconditionSql =
    postconditionStart >= 0 && postconditionEnd > postconditionStart
      ? sql.slice(postconditionStart, postconditionEnd)
      : "";
  const revokedRoutineNames = [
    ...sql.matchAll(
      /REVOKE ALL PRIVILEGES\s+ON FUNCTION public\."([^"]+)"\([\s\S]*?\)\s+FROM PUBLIC;/gu,
    ),
  ].map((match) => match[1]);
  if (
    JSON.stringify(revokedRoutineNames) !==
      JSON.stringify(EXPECTED_CHANGED_ROUTINES) ||
    !sql.includes("CURRENT_184 installed a non-owner EXECUTE grant") ||
    !sql.includes("privilege.grantee <> routine.proowner") ||
    EXPECTED_OWNER_ONLY_SIGNATURES.some(
      (signature) =>
        !sql.includes(signature) || !postconditionSql.includes(`('${signature}')`),
    )
  ) {
    findings.push(F.ACL_SURFACE_DRIFT);
  }
}

export async function inspectIdentityMailWorkerV2ReplayCurrent184Foundation(
  overrides = {},
) {
  const F = IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS;
  const findings = [];
  const canonical = await migrationEntries(CANONICAL_DIRECTORY);
  const predecessorEntries = (
    overrides.predecessorEntries ?? [
      ...canonical,
      ...(await candidateMigrationEntries(
        EXPECTED_CANDIDATE_DIRECTORIES.slice(0, -1),
      )),
    ]
  ).sort((left, right) => left.name.localeCompare(right.name, "en"));
  const directories =
    overrides.candidateDirectories ?? (await candidateDirectories());
  const sql = normalizeSql(
    overrides.sql ??
      (await readFile(join(CURRENT184_DIRECTORY, "migration.sql"), "utf8")),
  );
  const metadataText =
    overrides.metadataText ??
    (await readFile(join(CURRENT184_DIRECTORY, "candidate.json"), "utf8"));
  const runtimeSourceText =
    overrides.runtimeSourceText ?? (await sourceText(API_SOURCE_DIRECTORY));

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
  if (
    predecessorEntries.length !== 183 ||
    predecessorEntries.at(-1)?.name !==
      IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_PREDECESSOR ||
    predecessorEntries.at(-1)?.checksum !== EXPECTED_PREDECESSOR_SHA256 ||
    manifestDigest(predecessorEntries) !== EXPECTED_PREDECESSOR_MANIFEST_DIGEST
  ) {
    findings.push(F.PREDECESSOR_DRIFT);
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
      "IDENTITY_MAIL_WORKER_V2_LOST_RESPONSE_REPLAY_CANDIDATE_V1" ||
    metadata?.candidate !== IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE ||
    metadata?.ordinal !== IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_ORDINAL ||
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
    metadata?.predecessor?.count !== 183 ||
    metadata?.predecessor?.head !==
      IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_PREDECESSOR ||
    metadata?.predecessor?.manifestDigest !==
      EXPECTED_PREDECESSOR_MANIFEST_DIGEST ||
    metadata?.predecessor?.headChecksum !== EXPECTED_PREDECESSOR_SHA256
  ) {
    findings.push(F.PREDECESSOR_DRIFT);
  }

  const actualSqlSha256 = sha256(sql);
  if (
    metadata?.migrationSqlSha256 !== actualSqlSha256 ||
    actualSqlSha256 !== EXPECTED_CURRENT184_SHA256
  ) {
    findings.push(F.SQL_SHA_DRIFT);
  }
  if (
    !sql.includes("completed_migration_count IS DISTINCT FROM 183") ||
    !sql.includes(IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_PREDECESSOR) ||
    !sql.includes(EXPECTED_PREDECESSOR_MANIFEST_DIGEST) ||
    !sql.includes(EXPECTED_PREDECESSOR_SHA256)
  ) {
    findings.push(F.PREDECESSOR_DRIFT);
  }

  inspectTransactionAndSurface(sql, findings);
  inspectColumnsAndConstraints(sql, findings);
  inspectRoutines(sql, findings);
  inspectAcl(sql, findings);
  if (IMPLEMENTATION_HELPER_NAMES.some((name) => runtimeSourceText.includes(name))) {
    findings.push(F.HELPER_EXPOSURE_DRIFT);
  }

  if (findings.length > 0) {
    return Object.freeze({
      authorization: false,
      canMutate: false,
      candidate: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE,
      contract: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CONTRACT,
      decision: "CURRENT184_FOUNDATION_BLOCKED",
      findings: Object.freeze([...new Set(findings)].sort()),
    });
  }
  return Object.freeze({
    authorization: false,
    canMutate: false,
    candidate: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CANDIDATE,
    contract: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_CONTRACT,
    decision: "CURRENT184_FOUNDATION_COMPLIANT",
    findings: Object.freeze([]),
    migrationSqlSha256: actualSqlSha256,
    ordinal: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_ORDINAL,
    runtime: "NOT_WIRED_OWNER_ONLY",
  });
}

export async function checkIdentityMailWorkerV2ReplayCurrent184Foundation(
  overrides = {},
) {
  const report =
    await inspectIdentityMailWorkerV2ReplayCurrent184Foundation(overrides);
  if (report.decision !== "CURRENT184_FOUNDATION_COMPLIANT") {
    throw new IdentityMailWorkerV2ReplayCurrent184FoundationError(report.findings);
  }
  return report;
}

export async function runIdentityMailWorkerV2ReplayCurrent184SelfTest() {
  const baseline = await checkIdentityMailWorkerV2ReplayCurrent184Foundation();
  assert.equal(baseline.decision, "CURRENT184_FOUNDATION_COMPLIANT");
  const sql = await readFile(join(CURRENT184_DIRECTORY, "migration.sql"), "utf8");
  const metadataText = await readFile(
    join(CURRENT184_DIRECTORY, "candidate.json"),
    "utf8",
  );
  const probes = [
    {
      expected: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS
        .REPLAY_CONTRACT_DRIFT,
      overrides: {
        sql: sql.replaceAll('"transitionRequestDigest"', '"requestDigest"'),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS
        .READINESS_PIN_DRIFT,
      overrides: {
        sql: sql.replace(
          "migration_count IS DISTINCT FROM 184",
          "migration_count IS DISTINCT FROM 183",
        ),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS
        .ACL_SURFACE_DRIFT,
      overrides: {
        sql: sql.replace(
          'REVOKE ALL PRIVILEGES\nON FUNCTION public."identity_mail_delivery_event_append_v2"()\nFROM PUBLIC;',
          'GRANT EXECUTE ON FUNCTION public."identity_mail_delivery_event_append_v2"() TO PUBLIC;',
        ),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS
        .METADATA_DRIFT,
      overrides: {
        metadataText: JSON.stringify({
          ...JSON.parse(metadataText),
          authorization: true,
        }),
      },
    },
    {
      expected: IDENTITY_MAIL_WORKER_V2_REPLAY_CURRENT184_FINDINGS
        .CANDIDATE_CHAIN_DRIFT,
      overrides: {
        candidateDirectories: EXPECTED_CANDIDATE_DIRECTORIES.slice(0, -1),
      },
    },
  ];
  for (const probe of probes) {
    const report = await inspectIdentityMailWorkerV2ReplayCurrent184Foundation(
      probe.overrides,
    );
    assert.equal(report.decision, "CURRENT184_FOUNDATION_BLOCKED");
    assert.ok(report.findings.includes(probe.expected));
  }
  return Object.freeze({
    decision: "CURRENT184_FOUNDATION_SELF_TEST_PASSED",
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
      `${JSON.stringify(await runIdentityMailWorkerV2ReplayCurrent184SelfTest())}\n`,
    );
    return;
  }
  if (argument === "--check") {
    process.stdout.write(
      `${JSON.stringify(await checkIdentityMailWorkerV2ReplayCurrent184Foundation())}\n`,
    );
    return;
  }
  throw new Error(HELP);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    if (error instanceof IdentityMailWorkerV2ReplayCurrent184FoundationError) {
      process.stderr.write(
        `${JSON.stringify({ code: error.code, findings: error.findings })}\n`,
      );
    } else {
      process.stderr.write(`${String(error?.stack ?? error)}\n`);
    }
    process.exitCode = 1;
  });
}

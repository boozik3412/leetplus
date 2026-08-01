import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CONTRACT =
  "IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_STATIC_V1";
export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_BASE_COUNT = 179;
export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_BASE_HEAD =
  "20260731120000_identity_mail_delivery_release_head";
export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR =
  "20260801010000_identity_mail_tenant_enrollment_control_plane";
export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE =
  "20260801020000_identity_mail_tenant_lock_drain_worker_v2";
export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_ORDINAL = 181;

const EXPECTED_CANDIDATE_DIRECTORIES = Object.freeze([
  IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR,
  IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE,
  "20260801030000_identity_mail_tenant_first_claim_protocol",
  "20260802010000_identity_mail_worker_v2_freshness_protocol",
]);

export const IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS =
  Object.freeze({
    ACL_SURFACE_DRIFT: "ACL_SURFACE_DRIFT",
    ARTIFACT_INVALID: "ARTIFACT_INVALID",
    CANDIDATE_CHAIN_DRIFT: "CANDIDATE_CHAIN_DRIFT",
    CANDIDATE_SHA256_MISMATCH: "CANDIDATE_SHA256_MISMATCH",
    CANDIDATE_SHA256_NOT_PINNED: "CANDIDATE_SHA256_NOT_PINNED",
    CANDIDATE_SQL_MISSING: "CANDIDATE_SQL_MISSING",
    CANONICAL_BASE_DRIFT: "CANONICAL_BASE_DRIFT",
    COLUMN_SURFACE_DRIFT: "COLUMN_SURFACE_DRIFT",
    CONSTRAINT_SURFACE_DRIFT: "CONSTRAINT_SURFACE_DRIFT",
    EXECUTION_FENCE_MISSING: "EXECUTION_FENCE_MISSING",
    FORBIDDEN_GRANT: "FORBIDDEN_GRANT",
    FORBIDDEN_ROLE_DDL: "FORBIDDEN_ROLE_DDL",
    HELPER_CONTRACT_DRIFT: "HELPER_CONTRACT_DRIFT",
    LEGACY_PRODUCER_STUB_DRIFT: "LEGACY_PRODUCER_STUB_DRIFT",
    METADATA_DRIFT: "METADATA_DRIFT",
    CLAIM_CONTRACT_DRIFT: "CLAIM_CONTRACT_DRIFT",
    CATALOG_POSTCONDITION_DRIFT: "CATALOG_POSTCONDITION_DRIFT",
    DRAIN_RETRY_DRIFT: "DRAIN_RETRY_DRIFT",
    EVENT_DIGEST_DRIFT: "EVENT_DIGEST_DRIFT",
    READY_INDEX_DRIFT: "READY_INDEX_DRIFT",
    ROUTINE_SURFACE_DRIFT: "ROUTINE_SURFACE_DRIFT",
    SETTLEMENT_AUTHORITY_DRIFT: "SETTLEMENT_AUTHORITY_DRIFT",
    TRANSITION_TIMESTAMP_DRIFT: "TRANSITION_TIMESTAMP_DRIFT",
    TRANSACTION_ENVELOPE_INVALID: "TRANSACTION_ENVELOPE_INVALID",
    V1_WORKER_PROSRC_PIN_MISSING: "V1_WORKER_PROSRC_PIN_MISSING",
    WORKER_TENANT_LOCK_ORDER_DRIFT: "WORKER_TENANT_LOCK_ORDER_DRIFT",
  });

const EXPECTED_BASE_MANIFEST_DIGEST =
  "3330185424ca669c18f39c2da5aa1e49f942500c0c85185c9125930e02df9431";
const EXPECTED_BASE_HEAD_CHECKSUM =
  "c394060fbf979c567403976c8e906dc67b3bd840aea9fa9550e1d939d04af519";
const EXPECTED_PREDECESSOR_SHA256 =
  "e84ba3c4e9e61d1d759b82a33fc22c853471fb0ef908546e755699d0d264f683";
const EXPECTED_PREDECESSOR_MANIFEST_DIGEST =
  "c41f3854bff364deb4f169f56f31bb5bd7e46249a677c66bc879cb967b6fae58";

const UNPINNED_CANDIDATE_SHA256 = "0".repeat(64);
const EXPECTED_CANDIDATE_SHA256 =
  "b78b40ce37f48419c8d9e4f6ad8a90ddb9a242128a33d7dbfa76d8439ba0f455";

const MIGRATION_NAME_PATTERN = /^[0-9]{14}_[a-z0-9_]+$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DATABASE_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const CANONICAL_MIGRATIONS_DIRECTORY = join(
  DATABASE_DIRECTORY,
  "prisma",
  "migrations",
);
const CANDIDATES_DIRECTORY = join(DATABASE_DIRECTORY, "migration-candidates");
const PREDECESSOR_DIRECTORY = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR,
);
const CANDIDATE_DIRECTORY = join(
  CANDIDATES_DIRECTORY,
  IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE,
);

const EXPECTED_CLAIM_BINDING_COLUMNS = Object.freeze([
  "claimEnrollmentStateRevision",
  "claimPolicyRevision",
  "claimProviderAuthorityDigest",
]);
const EXPECTED_CONSTRAINT_SURFACE = Object.freeze([
  "identity_mail_outbox_claim_enrollment_binding_check",
  "identity_mail_delivery_event_claim_enrollment_binding_check",
  "identity_mail_tenant_enrollment_command_rollback_once_uidx",
]);
const EXPECTED_ENTRYPOINT_SPECS = Object.freeze([
  Object.freeze({
    name: "identity_mail_tenant_lock_v1",
    argumentTypes: Object.freeze(["TEXT"]),
    returnType: "TEXT",
    security: "INVOKER",
  }),
  Object.freeze({
    name: "identity_mail_delivery_worker_assert_v2",
    argumentTypes: Object.freeze(["TEXT", "TEXT"]),
    returnType: "JSONB",
    security: "DEFINER",
  }),
  Object.freeze({
    name: "identity_initial_owner_mail_claim_v2",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT", "TEXT"]),
    returnType: "JSONB",
    security: "DEFINER",
  }),
  Object.freeze({
    name: "identity_initial_owner_mail_provider_mark_v2",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "INTEGER",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
    ]),
    returnType: "JSONB",
    security: "DEFINER",
  }),
  Object.freeze({
    name: "identity_initial_owner_mail_complete_v2",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "INTEGER",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
    ]),
    returnType: "JSONB",
    security: "DEFINER",
  }),
  Object.freeze({
    name: "identity_initial_owner_mail_reap_v2",
    argumentTypes: Object.freeze(["TEXT", "TEXT", "TEXT", "INTEGER"]),
    returnType: "JSONB",
    security: "DEFINER",
  }),
  Object.freeze({
    name: "identity_initial_owner_mail_reconcile_v2",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "BIGINT",
      "TEXT",
      "TEXT",
      "TEXT",
    ]),
    returnType: "JSONB",
    security: "DEFINER",
  }),
]);
const EXPECTED_ENTRYPOINTS = Object.freeze(
  EXPECTED_ENTRYPOINT_SPECS.map(({ name }) => name),
);
const EXPECTED_OPERATIONAL_V2_LOCKS = Object.freeze([
  Object.freeze({
    name: "identity_mail_delivery_worker_assert_v2",
    lockRoutine: "identity_mail_tenant_lock_v1",
  }),
  Object.freeze({
    name: "identity_initial_owner_mail_claim_v2",
    lockRoutine: "identity_mail_delivery_worker_assert_v2",
  }),
  ...[
    "identity_initial_owner_mail_provider_mark_v2",
    "identity_initial_owner_mail_complete_v2",
    "identity_initial_owner_mail_reap_v2",
    "identity_initial_owner_mail_reconcile_v2",
  ].map((name) =>
    Object.freeze({ name, lockRoutine: "identity_mail_tenant_lock_v1" }),
  ),
]);
const EXPECTED_SETTLEMENT_AUTHORITY_ROUTINES = Object.freeze([
  "identity_initial_owner_mail_provider_mark_v2",
  "identity_initial_owner_mail_complete_v2",
  "identity_initial_owner_mail_reap_v2",
]);
const EXPECTED_LEGACY_PRODUCER_STUBS = Object.freeze([
  Object.freeze({
    name: "identity_owner_invite_issue_hold_v1",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "TEXT",
      "INTEGER",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "BYTEA",
      "TIMESTAMP WITH TIME ZONE",
    ]),
  }),
  Object.freeze({
    name: "shared_beta_tenant_activate_v1",
    argumentTypes: Object.freeze([
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "TEXT",
      "BYTEA",
      "TIMESTAMP WITH TIME ZONE",
    ]),
  }),
]);
const EXPECTED_V1_WORKER_PROSRC = Object.freeze([
  Object.freeze({
    signature: 'public."identity_mail_delivery_worker_assert_v1"(text)',
    sha256:
      "a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37",
  }),
  Object.freeze({
    signature:
      'public."identity_initial_owner_mail_claim_v1"(text,text,text,text)',
    sha256:
      "f2d56144cba4cbc3ee4626f09e1b5c106347822e500c7cd2310f52553b40b57b",
  }),
  Object.freeze({
    signature:
      'public."identity_initial_owner_mail_provider_mark_v1"(text,integer,text,text,text,text,text)',
    sha256:
      "a4bf0b2da481d9b1aa463261f5d90314729bedd06c6764337e64f59cfde59742",
  }),
  Object.freeze({
    signature:
      'public."identity_initial_owner_mail_complete_v1"(text,integer,text,text,text,text,text)',
    sha256:
      "650839a7f45bd35a703a2e5e3ee479ef1ddee59f7d36b258836b5671d6f144dc",
  }),
  Object.freeze({
    signature:
      'public."identity_initial_owner_mail_reap_v1"(text,text,text,integer)',
    sha256:
      "a0f72c433ca283d179e75cb0443acdaedf5d405b05c4e8ad3b0a998034bf89e2",
  }),
  Object.freeze({
    signature:
      'public."identity_initial_owner_mail_reconcile_v1"(text,bigint,text,text,text)',
    sha256:
      "6ebfbc2d6dd435fe7b4abc474ebc8e43b7178de8bd9723e3eb420f4079ed7d8e",
  }),
]);
const ENTRYPOINT_NAME_PATTERN = /^(?:identity_mail_tenant_lock_v1|identity_mail_delivery_worker_assert_v2|identity_initial_owner_mail_(?:claim|provider_mark|complete|reap|reconcile)_v2)$/u;

function normalizeSql(value) {
  return String(value ?? "").replaceAll("\r\n", "\n");
}

function compactSql(value) {
  return normalizeSql(value).replaceAll(/\s+/gu, " ").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactArray(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function canonicalManifestDigest(entries) {
  return sha256(
    Buffer.from(
      `${entries.map(({ name, sha256: checksum }) => `${name} ${checksum}`).join("\n")}\n`,
      "utf8",
    ),
  );
}

function collect(value, pattern, group = 1) {
  return [...String(value ?? "").matchAll(pattern)].map(
    (match) => match[group],
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
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

async function readOptional(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function functionBlock(sql, name) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const start = new RegExp(
    `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\."${escapedName}"\\s*\\(`,
    "iu",
  ).exec(sql)?.index;
  if (typeof start !== "number") return "";
  const next = /\n(?:CREATE|ALTER|DROP|COMMENT|REVOKE)\s/giu;
  next.lastIndex = start + 1;
  const end = next.exec(sql)?.index ?? sql.length;
  return sql.slice(start, end);
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
  return arguments_.map((argument) => {
    const normalized = argument.replaceAll(/\s+/gu, " ").trim().toUpperCase();
    if (/TIMESTAMP(?:\(\d+\))? WITH TIME ZONE$/u.test(normalized)) {
      return "TIMESTAMP WITH TIME ZONE";
    }
    return /(?:^|\s)(JSONB|BIGINT|INTEGER|TEXT|BYTEA)$/u.exec(normalized)?.[1] ??
      "UNKNOWN";
  });
}

function functionBody(sql, name) {
  const block = functionBlock(sql, name);
  const match = /\bAS\s+\$([A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$\s*;/iu.exec(
    block,
  );
  return match?.[2] ?? "";
}

function addedColumnsForTable(sql, tableName) {
  const escapedName = tableName.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const blocks = collect(
    sql,
    new RegExp(
      `\\bALTER\\s+TABLE\\s+public\\."${escapedName}"([\\s\\S]*?);`,
      "gimu",
    ),
  );
  return blocks.flatMap((block) =>
    collect(block, /\bADD\s+COLUMN\s+"([^"]+)"/gimu),
  );
}

function occurrenceCount(value, fragment) {
  if (fragment.length === 0) return 0;
  return String(value).split(fragment).length - 1;
}

function sqlTypePattern(type) {
  if (type === "TIMESTAMP WITH TIME ZONE") {
    return "(?:pg_catalog\\.)?TIMESTAMP(?:\\(\\d+\\))?\\s+WITH\\s+TIME\\s+ZONE";
  }
  return `(?:pg_catalog\\.)?${type.replaceAll(" ", "\\s+")}`;
}

function hasExactPublicRevoke(sql, { name, argumentTypes }) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const argumentPattern = argumentTypes.map(sqlTypePattern).join("\\s*,\\s*");
  return new RegExp(
    `\\bREVOKE\\s+ALL\\s+PRIVILEGES\\s+ON\\s+FUNCTION\\s+public\\."${escapedName}"\\s*\\(\\s*${argumentPattern}\\s*\\)\\s+FROM\\s+PUBLIC\\s*;`,
    "iu",
  ).test(sql);
}

function stripSqlComments(value) {
  const sql = String(value ?? "");
  let output = "";
  let state = "NORMAL";
  let blockDepth = 0;
  let dollarTag = "";
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1] ?? "";
    if (state === "LINE_COMMENT") {
      if (character === "\n") {
        output += "\n";
        state = "NORMAL";
      } else {
        output += " ";
      }
      continue;
    }
    if (state === "BLOCK_COMMENT") {
      if (character === "/" && next === "*") {
        output += "  ";
        blockDepth += 1;
        index += 1;
      } else if (character === "*" && next === "/") {
        output += "  ";
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = "NORMAL";
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (state === "SINGLE_QUOTE") {
      output += character;
      if (character === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (character === "'") {
        state = "NORMAL";
      }
      continue;
    }
    if (state === "DOUBLE_QUOTE") {
      output += character;
      if (character === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (character === '"') {
        state = "NORMAL";
      }
      continue;
    }
    if (state === "DOLLAR_QUOTE") {
      if (sql.startsWith(dollarTag, index)) {
        output += dollarTag;
        index += dollarTag.length - 1;
        state = "NORMAL";
      } else {
        output += character;
      }
      continue;
    }
    if (character === "-" && next === "-") {
      output += "  ";
      state = "LINE_COMMENT";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      output += "  ";
      state = "BLOCK_COMMENT";
      blockDepth = 1;
      index += 1;
      continue;
    }
    if (character === "'") {
      output += character;
      state = "SINGLE_QUOTE";
      continue;
    }
    if (character === '"') {
      output += character;
      state = "DOUBLE_QUOTE";
      continue;
    }
    if (character === "$") {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(
        sql.slice(index),
      );
      if (match) {
        dollarTag = match[0];
        output += dollarTag;
        index += dollarTag.length - 1;
        state = "DOLLAR_QUOTE";
        continue;
      }
    }
    output += character;
  }
  return output;
}

function semanticFunctionBody(sql, name) {
  return compactSql(stripSqlComments(functionBody(sql, name)));
}

function hasEveryFragment(value, fragments) {
  return fragments.every((fragment) => value.includes(fragment));
}

function routineCallIndex(value, name) {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return value.search(new RegExp(`public\\."${escapedName}"\\s*\\(`, "iu"));
}

function firstPublicRelationAccessIndex(value) {
  return value.search(
    /\b(?:FROM|JOIN|UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\."/iu,
  );
}

function hasTenantFirstOperationalOrder(sql, spec) {
  const body = semanticFunctionBody(sql, spec.name);
  const lockIndex = routineCallIndex(body, spec.lockRoutine);
  const firstPublicRoutineIndex = body.search(/public\."[^"]+"\s*\(/iu);
  const relationIndex = firstPublicRelationAccessIndex(body);
  return (
    body.length > 0 &&
    lockIndex >= 0 &&
    lockIndex === firstPublicRoutineIndex &&
    relationIndex >= 0 &&
    lockIndex < relationIndex
  );
}

function executableSqlSurface(value) {
  const sql = stripSqlComments(value);
  let output = "";
  let state = "NORMAL";
  let dollarTag = "";
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1] ?? "";
    if (state === "SINGLE_QUOTE") {
      output += character === "\n" ? "\n" : " ";
      if (character === "'" && next === "'") {
        output += " ";
        index += 1;
      } else if (character === "'") {
        state = "NORMAL";
      }
      continue;
    }
    if (state === "DOUBLE_QUOTE") {
      output += character === "\n" ? "\n" : " ";
      if (character === '"' && next === '"') {
        output += " ";
        index += 1;
      } else if (character === '"') {
        state = "NORMAL";
      }
      continue;
    }
    if (state === "DOLLAR_QUOTE") {
      if (sql.startsWith(dollarTag, index)) {
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length - 1;
        state = "NORMAL";
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (character === "'") {
      output += " ";
      state = "SINGLE_QUOTE";
      continue;
    }
    if (character === '"') {
      output += " ";
      state = "DOUBLE_QUOTE";
      continue;
    }
    if (character === "$") {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u.exec(
        sql.slice(index),
      );
      if (match) {
        dollarTag = match[0];
        output += " ".repeat(dollarTag.length);
        index += dollarTag.length - 1;
        state = "DOLLAR_QUOTE";
        continue;
      }
    }
    output += character;
  }
  return output;
}

function hasExecutableGrantStatement(sql) {
  return /(?:^|;)\s*GRANT\b/iu.test(executableSqlSurface(sql));
}

function artifactShapeIsSafe(artifact) {
  return (
    artifact !== null &&
    typeof artifact === "object" &&
    Array.isArray(artifact.canonical?.directoryNames) &&
    Array.isArray(artifact.canonical?.entries) &&
    Array.isArray(artifact.candidates?.directoryNames) &&
    typeof artifact.predecessor?.name === "string" &&
    typeof artifact.predecessor?.sql === "string" &&
    typeof artifact.candidate?.name === "string" &&
    (typeof artifact.candidate?.sql === "string" ||
      artifact.candidate?.sql === null) &&
    typeof artifact.candidate?.metadataText === "string"
  );
}

export class IdentityMailTenantLockDrainCurrent181FoundationError extends Error {
  constructor(report) {
    super("Identity mail tenant lock/drain CURRENT181 foundation is blocked.");
    this.name = "IdentityMailTenantLockDrainCurrent181FoundationError";
    this.code = "IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_BLOCKED";
    this.exitCode = 3;
    this.report = report;
  }
}

export async function loadIdentityMailTenantLockDrainCurrent181Artifact() {
  const canonicalDirectoryEntries = await readdir(
    CANONICAL_MIGRATIONS_DIRECTORY,
    { withFileTypes: true },
  );
  const canonicalDirectoryNames = canonicalDirectoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const canonicalEntries = [];
  for (const name of canonicalDirectoryNames) {
    if (!MIGRATION_NAME_PATTERN.test(name)) continue;
    const sql = normalizeSql(
      await readFile(join(CANONICAL_MIGRATIONS_DIRECTORY, name, "migration.sql"), "utf8"),
    );
    canonicalEntries.push({
      name,
      sha256: sha256(Buffer.from(sql, "utf8")),
    });
  }

  const candidateDirectoryEntries = await readdir(CANDIDATES_DIRECTORY, {
    withFileTypes: true,
  });
  const candidateDirectoryNames = candidateDirectoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const [predecessorBytes, candidateBytes, metadataText] = await Promise.all([
    readFile(join(PREDECESSOR_DIRECTORY, "migration.sql")),
    readOptional(join(CANDIDATE_DIRECTORY, "migration.sql")),
    readFile(join(CANDIDATE_DIRECTORY, "candidate.json"), "utf8"),
  ]);

  return {
    canonical: {
      directoryNames: canonicalDirectoryNames,
      entries: canonicalEntries,
    },
    candidates: { directoryNames: candidateDirectoryNames },
    predecessor: {
      name: IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR,
      sql: normalizeSql(predecessorBytes.toString("utf8")),
    },
    candidate: {
      name: IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE,
      sql:
        candidateBytes === null
          ? null
          : normalizeSql(candidateBytes.toString("utf8")),
      metadataText,
    },
  };
}

export function evaluateIdentityMailTenantLockDrainCurrent181Foundation(
  artifact,
) {
  const findingSet = new Set();
  const add = (condition, finding) => {
    if (condition) findingSet.add(finding);
  };
  const F = IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS;
  add(!artifactShapeIsSafe(artifact), F.ARTIFACT_INVALID);

  const canonicalDirectories = Array.isArray(
    artifact?.canonical?.directoryNames,
  )
    ? artifact.canonical.directoryNames
    : [];
  const canonicalEntries = Array.isArray(artifact?.canonical?.entries)
    ? artifact.canonical.entries
    : [];
  const canonicalNames = canonicalEntries.map((entry) => entry?.name);
  const candidateDirectories = Array.isArray(
    artifact?.candidates?.directoryNames,
  )
    ? artifact.candidates.directoryNames
    : [];
  const predecessorName = String(artifact?.predecessor?.name ?? "");
  const predecessorSql = normalizeSql(artifact?.predecessor?.sql);
  const predecessorSha256 = sha256(Buffer.from(predecessorSql, "utf8"));
  const candidateName = String(artifact?.candidate?.name ?? "");
  const candidateSql =
    typeof artifact?.candidate?.sql === "string"
      ? normalizeSql(artifact.candidate.sql)
      : null;
  const compact = compactSql(candidateSql);
  const candidateSha256 =
    candidateSql === null
      ? null
      : sha256(Buffer.from(candidateSql, "utf8"));
  const metadata = safeJson(artifact?.candidate?.metadataText);
  const baseManifestDigest = canonicalManifestDigest(canonicalEntries);
  const predecessorManifestDigest = canonicalManifestDigest([
    ...canonicalEntries,
    { name: predecessorName, sha256: predecessorSha256 },
  ]);

  add(
    canonicalDirectories.some((name) => !MIGRATION_NAME_PATTERN.test(name)) ||
      !exactArray(canonicalDirectories, canonicalNames) ||
      canonicalEntries.length !==
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_BASE_COUNT ||
      canonicalNames.at(-1) !==
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_BASE_HEAD ||
      canonicalEntries.at(-1)?.sha256 !== EXPECTED_BASE_HEAD_CHECKSUM ||
      baseManifestDigest !== EXPECTED_BASE_MANIFEST_DIGEST,
    F.CANONICAL_BASE_DRIFT,
  );
  add(
    !exactArray(candidateDirectories, EXPECTED_CANDIDATE_DIRECTORIES) ||
      predecessorName !==
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR ||
      predecessorSha256 !== EXPECTED_PREDECESSOR_SHA256 ||
      predecessorManifestDigest !== EXPECTED_PREDECESSOR_MANIFEST_DIGEST ||
      candidateName !== IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE ||
      canonicalEntries.length + 2 !==
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_ORDINAL,
    F.CANDIDATE_CHAIN_DRIFT,
  );

  const metadataKeys =
    metadata === null ? [] : Object.keys(metadata).sort();
  const predecessorKeys =
    metadata?.predecessor &&
    typeof metadata.predecessor === "object" &&
    !Array.isArray(metadata.predecessor)
      ? Object.keys(metadata.predecessor).sort()
      : [];
  add(
    !exactArray(
      metadataKeys,
      [
        "authorization",
        "canMutate",
        "candidate",
        "contract",
        "migrationSqlSha256",
        "ordinal",
        "predecessor",
        "schemaVersion",
        "status",
      ].sort(),
    ) ||
      !exactArray(
        predecessorKeys,
        ["count", "head", "headChecksum", "manifestDigest"].sort(),
      ) ||
      metadata?.schemaVersion !== 1 ||
      metadata?.contract !==
        "IDENTITY_MAIL_TENANT_LOCK_DRAIN_WORKER_V2_CANDIDATE_V1" ||
      metadata?.candidate !==
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE ||
      metadata?.ordinal !== IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_ORDINAL ||
      metadata?.predecessor?.count !== 180 ||
      metadata?.predecessor?.head !==
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR ||
      metadata?.predecessor?.manifestDigest !==
        EXPECTED_PREDECESSOR_MANIFEST_DIGEST ||
      metadata?.predecessor?.headChecksum !== EXPECTED_PREDECESSOR_SHA256 ||
      metadata?.migrationSqlSha256 !== EXPECTED_CANDIDATE_SHA256 ||
      metadata?.authorization !== false ||
      metadata?.canMutate !== false ||
      metadata?.status !== "NOT_DEPLOYABLE",
    F.METADATA_DRIFT,
  );

  add(EXPECTED_CANDIDATE_SHA256 === UNPINNED_CANDIDATE_SHA256, F.CANDIDATE_SHA256_NOT_PINNED);
  add(candidateSql === null, F.CANDIDATE_SQL_MISSING);
  add(
    candidateSql !== null &&
      (candidateSha256 !== EXPECTED_CANDIDATE_SHA256 ||
        candidateSha256 !== metadata?.migrationSqlSha256),
    F.CANDIDATE_SHA256_MISMATCH,
  );

  if (candidateSql !== null) {
    add(
      !/^\s*BEGIN;/iu.test(candidateSql) || !/COMMIT;\s*$/iu.test(candidateSql),
      F.TRANSACTION_ENVELOPE_INVALID,
    );

    const fenceFragments = [
      "completed_migration_count IS DISTINCT FROM 180",
      `'${IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_PREDECESSOR}'`,
      `'${EXPECTED_PREDECESSOR_MANIFEST_DIGEST}'`,
      `'${EXPECTED_PREDECESSOR_SHA256}'`,
      `'${IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE}'`,
      "'leetplus.identity_mail_tenant_lock_drain_current181_confirmation'",
      "'leetplus.identity_mail_tenant_lock_drain_current181_sha256'",
      "'^lp_imtec_[0-9a-f]{32}_ci$'",
      "'rehearse-noncanonical-identity-mail-tenant-lock-drain-current181'",
      "candidate_receipt_count IS DISTINCT FROM 1",
      "candidate_receipt_checksum IS DISTINCT FROM rehearsal_candidate_sha256",
      "candidate_receipt_applied_steps IS DISTINCT FROM 0",
    ];
    add(
      fenceFragments.some((fragment) => !compact.includes(fragment)) ||
        !/finished_at"?\s+IS\s+NULL/iu.test(candidateSql) ||
        !/rolled_back_at"?\s+IS\s+NULL/iu.test(candidateSql),
      F.EXECUTION_FENCE_MISSING,
    );

    const helper = compactSql(
      functionBlock(candidateSql, "identity_mail_tenant_lock_v1"),
    );
    const helperBody = compactSql(
      stripSqlComments(
        functionBody(candidateSql, "identity_mail_tenant_lock_v1"),
      ),
    );
    const transactionLocalLockPattern =
      /PERFORM\s+pg_catalog\.set_config\s*\(\s*'lock_timeout'\s*,\s*'5s'\s*,\s*true\s*\)\s*;/giu;
    const transactionLocalLockMatches =
      helperBody.match(transactionLocalLockPattern) ?? [];
    const anyLockConfigMatches =
      helperBody.match(
        /pg_catalog\.set_config\s*\(\s*'lock_timeout'/giu,
      ) ?? [];
    const transactionLocalLockIndex = helperBody.search(
      /PERFORM\s+pg_catalog\.set_config\s*\(\s*'lock_timeout'\s*,\s*'5s'\s*,\s*true\s*\)\s*;/iu,
    );
    const advisoryLockIndex = helperBody.search(
      /PERFORM\s+pg_catalog\.pg_advisory_xact_lock\s*\(/iu,
    );
    add(
      helper.length === 0 ||
        !/RETURNS\s+(?:pg_catalog\.)?TEXT/iu.test(helper) ||
        !/LANGUAGE\s+plpgsql/iu.test(helper) ||
        !/VOLATILE/iu.test(helper) ||
        !/PARALLEL\s+UNSAFE/iu.test(helper) ||
        !/SECURITY\s+INVOKER/iu.test(helper) ||
        !/SET\s+search_path\s*=\s*pg_catalog/iu.test(helper) ||
        !/statement_timeout_interval\s*:=\s*pg_catalog\.current_setting\s*\(\s*'statement_timeout'\s*\)\s*::\s*(?:pg_catalog\.)?INTERVAL\s*;/iu.test(
          helperBody,
        ) ||
        !/IF\s+pg_catalog\.current_setting\s*\(\s*'transaction_isolation'\s*\)\s*<>\s*'serializable'\s+OR\s+pg_catalog\.current_setting\s*\(\s*'transaction_read_only'\s*\)\s*<>\s*'off'\s+OR\s+statement_timeout_interval\s*<=\s*(?:pg_catalog\.)?INTERVAL\s*'0 milliseconds'\s+OR\s+statement_timeout_interval\s*>\s*(?:pg_catalog\.)?INTERVAL\s*'30 seconds'\s+THEN\s+RAISE\s+EXCEPTION/iu.test(
          helperBody,
        ) ||
        transactionLocalLockMatches.length !== 1 ||
        anyLockConfigMatches.length !== 1 ||
        transactionLocalLockIndex < 0 ||
        advisoryLockIndex < 0 ||
        transactionLocalLockIndex >= advisoryLockIndex ||
        !/pg_catalog\.hashtextextended\s*\(/iu.test(helper) ||
        !helper.includes("'leetplus:identity-mail-tenant:v1:'") ||
        !/[, ]180(?:\s*::\s*(?:pg_catalog\.)?(?:BIGINT|INTEGER))?\s*\)/iu.test(
          helper,
        ) ||
        !/pg_catalog\.pg_advisory_xact_lock\s*\(/iu.test(helper) ||
        /pg_(?:try_)?advisory_(?:lock|unlock)\s*\(/iu.test(helper),
      F.HELPER_CONTRACT_DRIFT,
    );

    const outboxClaimBindingColumns = addedColumnsForTable(
      candidateSql,
      "IdentityMailOutbox",
    );
    const deliveryEventClaimBindingColumns = addedColumnsForTable(
      candidateSql,
      "IdentityMailDeliveryEvent",
    );
    add(
      !exactArray(
        outboxClaimBindingColumns,
        EXPECTED_CLAIM_BINDING_COLUMNS,
      ) ||
        !exactArray(
          deliveryEventClaimBindingColumns,
          EXPECTED_CLAIM_BINDING_COLUMNS,
        ),
      F.COLUMN_SURFACE_DRIFT,
    );
    add(
      EXPECTED_CONSTRAINT_SURFACE.some((name) => !compact.includes(`"${name}"`)) ||
        !/CREATE\s+UNIQUE\s+INDEX\s+"identity_mail_tenant_enrollment_command_rollback_once_uidx"[\s\S]*?WHERE[\s\S]*?"intent"\s*=\s*'ROLLBACK'/iu.test(
          candidateSql,
        ),
      F.CONSTRAINT_SURFACE_DRIFT,
    );
    const postconditionStart = candidateSql.indexOf("DO $postcondition$");
    const postcondition =
      postconditionStart < 0
        ? ""
        : compactSql(candidateSql.slice(postconditionStart));
    add(
      !compact.includes(
        'CREATE INDEX "identity_mail_outbox_ready_tenant_v2_idx" ON public."IdentityMailOutbox" ( "tenantId", "availableAt", "createdAt", "id" ) WHERE "status" IN (',
      ) ||
        !hasEveryFragment(postcondition, [
          'WITH expected("index_name", "is_unique", "index_definition") AS (',
          "'identity_mail_outbox_ready_tenant_v2_idx', false, $definition$CREATE INDEX identity_mail_outbox_ready_tenant_v2_idx ON public.\"IdentityMailOutbox\" USING btree (\"tenantId\", \"availableAt\", \"createdAt\", id)",
          'pg_catalog.pg_get_indexdef(target_index.indexrelid) IS DISTINCT FROM expected."index_definition"',
        ]),
      F.READY_INDEX_DRIFT,
    );
    add(
      !hasEveryFragment(postcondition, [
        'unsafe_owner_membership_count INTEGER',
        'WITH RECURSIVE roles_reaching_owner("role_oid") AS (',
        'membership.roleid = migration_owner_oid',
        'membership.member = migration_owner_oid',
        'INTO unsafe_owner_membership_count',
        'unexpected_function_count INTEGER',
        '"prosrc_sha256"',
        'routine.pronargdefaults IS DISTINCT FROM 0',
        'routine.proargdefaults IS NOT NULL',
        'routine.provariadic IS DISTINCT FROM 0::OID',
        'routine.proisstrict IS DISTINCT FROM false',
        'routine.proleakproof IS DISTINCT FROM false',
        'routine.proretset IS DISTINCT FROM false',
        'routine.proallargtypes IS NOT NULL',
        'routine.proargmodes IS NOT NULL',
        "pg_catalog.sha256(pg_catalog.convert_to(routine.prosrc, 'UTF8'))",
        'INTO unexpected_function_count',
        'expected_routine.proname = candidate.proname',
        'expected_routine.oid <> candidate.oid',
        "candidate.pronamespace = pg_catalog.to_regnamespace('public')",
      ]),
      F.CATALOG_POSTCONDITION_DRIFT,
    );

    const entrypoints = collect(
      candidateSql,
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\."([^"]+)"\s*\(/gimu,
    ).filter((name) => ENTRYPOINT_NAME_PATTERN.test(name));
    add(
      !exactArray(entrypoints, EXPECTED_ENTRYPOINTS) ||
        EXPECTED_ENTRYPOINT_SPECS.some((spec) => {
          const block = compactSql(functionBlock(candidateSql, spec.name));
          const expectedSecurity = new RegExp(
            `SECURITY\\s+${spec.security}`,
            "iu",
          );
          const unexpectedSecurity = new RegExp(
            `SECURITY\\s+${spec.security === "INVOKER" ? "DEFINER" : "INVOKER"}`,
            "iu",
          );
          return (
            block.length === 0 ||
            !exactArray(
              functionArgumentTypes(candidateSql, spec.name),
              spec.argumentTypes,
            ) ||
            !new RegExp(
              `RETURNS\\s+${sqlTypePattern(spec.returnType)}`,
              "iu",
            ).test(block) ||
            !/LANGUAGE\s+plpgsql/iu.test(block) ||
            !/VOLATILE/iu.test(block) ||
            !/PARALLEL\s+UNSAFE/iu.test(block) ||
            !/SET\s+search_path\s*=\s*pg_catalog/iu.test(block) ||
            !expectedSecurity.test(block) ||
            unexpectedSecurity.test(block) ||
            (/SECURITY\s+DEFINER/iu.test(block) &&
              /\bEXECUTE\s+(?:IMMEDIATE\s+)?/iu.test(block))
          );
        }),
      F.ROUTINE_SURFACE_DRIFT,
    );

    add(
      EXPECTED_OPERATIONAL_V2_LOCKS.some(
        (spec) => !hasTenantFirstOperationalOrder(candidateSql, spec),
      ),
      F.WORKER_TENANT_LOCK_ORDER_DRIFT,
    );

    const claimBody = semanticFunctionBody(
      candidateSql,
      "identity_initial_owner_mail_claim_v2",
    );
    add(
      !hasEveryFragment(claimBody, [
        'FROM public."IdentityMailOutbox" AS target_outbox',
        'WHERE target_outbox."tenantId" = p_tenant_id',
        'target_outbox."status" IN (',
        "'PENDING'::public.\"IdentityMailOutboxStatus\"",
        "'RETRY'::public.\"IdentityMailOutboxStatus\"",
        'target_outbox."availableAt" <= now_at',
        'target_outbox."expiresAt" > now_at',
        'target_outbox."attempts" < (policy ->> \'maxAttempts\')::INTEGER',
        "FOR UPDATE OF target_outbox SKIP LOCKED LIMIT 1",
        'FROM public."UserInvite" AS target_invite',
        'FROM public."Tenant" AS target_tenant',
        'FROM public."IdentityEmailClaim" AS identity_claim',
        'claim_record."tenantId" IS DISTINCT FROM p_tenant_id',
        'tenant_record."status" IS DISTINCT FROM',
        'tenant_record."customerStage" IS DISTINCT FROM',
        'tenant_record."onboardingStatus" IS DISTINCT FROM',
        'tenant_record."trialStartsAt" > now_at',
        'tenant_record."trialEndsAt" <= now_at',
        'outbox_record."secretCiphertext" IS NULL',
      ]),
      F.CLAIM_CONTRACT_DRIFT,
    );

    const settlementAuthorityDrift =
      EXPECTED_SETTLEMENT_AUTHORITY_ROUTINES.some((name) => {
        const body = semanticFunctionBody(candidateSql, name);
        return !hasEveryFragment(body, [
          'enrollment_record."state" = \'ACTIVE\'',
          'enrollment_record."state" = \'DRAINING\'',
          'command_record."action" NOT IN (\'ROTATE\', \'DISABLE\')',
          'command_record."previousProviderAuthorityDigest" IS DISTINCT FROM p_provider_authority_digest',
          'outbox_record."claimProviderAuthorityDigest" IS DISTINCT FROM p_provider_authority_digest',
          'outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM enrollment_record."stateRevision"',
          'outbox_record."claimPolicyRevision" IS DISTINCT FROM enrollment_record."policyRevision"',
          'outbox_record."claimEnrollmentStateRevision" IS DISTINCT FROM command_record."stateRevisionBefore"',
          'outbox_record."claimPolicyRevision" IS DISTINCT FROM command_record."expectedPolicyRevision"',
        ]);
      });
    add(settlementAuthorityDrift, F.SETTLEMENT_AUTHORITY_DRIFT);

    const completeBody = semanticFunctionBody(
      candidateSql,
      "identity_initial_owner_mail_complete_v2",
    );
    const reapBody = semanticFunctionBody(
      candidateSql,
      "identity_initial_owner_mail_reap_v2",
    );
    const retryAssignment =
      'next_status := \'RETRY\'::public."IdentityMailOutboxStatus"';
    add(
      occurrenceCount(completeBody, retryAssignment) !== 1 ||
        occurrenceCount(reapBody, retryAssignment) !== 1 ||
        !hasEveryFragment(completeBody, [
          "ELSIF draining AND p_outcome_code IN ( 'PRE_PROVIDER_RETRY', 'CANCELED' ) THEN next_status := 'CANCELED'::public.\"IdentityMailOutboxStatus\"",
          "ELSIF NOT draining AND p_outcome_code = 'PRE_PROVIDER_RETRY' AND outbox_record.\"attempts\" < max_attempts THEN",
          "IF next_available_at < deliverable_until THEN next_status := 'RETRY'::public.\"IdentityMailOutboxStatus\"",
        ]) ||
        !hasEveryFragment(reapBody, [
          "IF draining THEN next_status := 'CANCELED'::public.\"IdentityMailOutboxStatus\"; event_type := 'REAP_CANCELED'; reason_code := 'TENANT_DRAINING'",
          "ELSE next_available_at := transition_at + pg_catalog.make_interval(",
          "IF next_available_at < deliverable_until AND outbox_record.\"attempts\" < max_attempts THEN next_status := 'RETRY'::public.\"IdentityMailOutboxStatus\"",
        ]),
      F.DRAIN_RETRY_DRIFT,
    );

    const providerMarkBody = semanticFunctionBody(
      candidateSql,
      "identity_initial_owner_mail_provider_mark_v2",
    );
    const monotonicClockFragment =
      "pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())";
    const updatedAtIncrementFragment =
      'outbox_record."updatedAt" + INTERVAL \'1 millisecond\'';
    const outboxGuardBody = semanticFunctionBody(
      candidateSql,
      "identity_mail_outbox_delivery_guard_v2",
    );
    add(
      !hasEveryFragment(outboxGuardBody, [
        'NEW."transitionRevision" <> OLD."transitionRevision" + 1',
        'NEW."updatedAt" <= OLD."updatedAt"',
      ]) ||
        !hasEveryFragment(claimBody, [
          "now_at := pg_catalog.greatest( now_at,",
          updatedAtIncrementFragment,
          '"updatedAt" = now_at',
        ]) ||
        !hasEveryFragment(providerMarkBody, [
          `now_at := pg_catalog.greatest( ${monotonicClockFragment},`,
          updatedAtIncrementFragment,
          '"updatedAt" = now_at',
        ]) ||
        !hasEveryFragment(completeBody, [
          `now_at := pg_catalog.greatest( ${monotonicClockFragment},`,
          updatedAtIncrementFragment,
          '"updatedAt" = now_at',
        ]) ||
        !hasEveryFragment(reapBody, [
          "transition_at := pg_catalog.greatest( now_at,",
          updatedAtIncrementFragment,
          '"updatedAt" = transition_at',
        ]),
      F.TRANSITION_TIMESTAMP_DRIFT,
    );

    const deliveryEventBody = semanticFunctionBody(
      candidateSql,
      "identity_mail_delivery_event_append_v2",
    );
    add(
      !deliveryEventBody.includes(
        "pg_catalog.floor( pg_catalog.date_part('epoch', NEW.\"updatedAt\") * 1000 )::BIGINT::TEXT",
      ) || deliveryEventBody.includes('NEW."updatedAt"::TEXT'),
      F.EVENT_DIGEST_DRIFT,
    );

    const expectedRetirementBody =
      "BEGIN RAISE EXCEPTION 'LEGACY_IDENTITY_MAIL_PRODUCER_RETIRED' USING ERRCODE = '55000'; END;";
    add(
      EXPECTED_LEGACY_PRODUCER_STUBS.some((spec) => {
        const block = compactSql(functionBlock(candidateSql, spec.name));
        return (
          block.length === 0 ||
          !/^CREATE\s+OR\s+REPLACE\s+FUNCTION\b/iu.test(block) ||
          !exactArray(
            functionArgumentTypes(candidateSql, spec.name),
            spec.argumentTypes,
          ) ||
          !/RETURNS\s+(?:pg_catalog\.)?JSONB/iu.test(block) ||
          !/LANGUAGE\s+plpgsql/iu.test(block) ||
          !/VOLATILE/iu.test(block) ||
          !/PARALLEL\s+UNSAFE/iu.test(block) ||
          !/SECURITY\s+DEFINER/iu.test(block) ||
          /SECURITY\s+INVOKER/iu.test(block) ||
          !/SET\s+search_path\s*=\s*pg_catalog/iu.test(block) ||
          compactSql(functionBody(candidateSql, spec.name)) !==
            expectedRetirementBody
        );
      }),
      F.LEGACY_PRODUCER_STUB_DRIFT,
    );

    add(
      EXPECTED_V1_WORKER_PROSRC.some(({ signature, sha256: checksum }) => {
        const name = /public\."([^"]+)"/u.exec(signature)?.[1] ?? "";
        const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        return (
          occurrenceCount(compact, `'${signature}'`) < 2 ||
          occurrenceCount(compact, `'${checksum}'`) < 2 ||
          new RegExp(
            `\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\."${escapedName}"\\s*\\(`,
            "iu",
          ).test(candidateSql)
        );
      }),
      F.V1_WORKER_PROSRC_PIN_MISSING,
    );

    add(hasExecutableGrantStatement(candidateSql), F.FORBIDDEN_GRANT);
    add(
      /\b(?:CREATE|ALTER|DROP)\s+ROLE\b/iu.test(candidateSql),
      F.FORBIDDEN_ROLE_DDL,
    );
    add(
      [...EXPECTED_ENTRYPOINT_SPECS, ...EXPECTED_LEGACY_PRODUCER_STUBS].some(
        (spec) => !hasExactPublicRevoke(candidateSql, spec),
      ),
      F.ACL_SURFACE_DRIFT,
    );
  }

  const findings = [...findingSet].sort();
  return deepFreeze({
    schemaVersion: 1,
    contract: IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CONTRACT,
    authorization: false,
    canMutate: false,
    decision: findings.length === 0 ? "COMPLIANT" : "BLOCKED",
    base: {
      count: canonicalEntries.length,
      head: canonicalNames.at(-1) ?? null,
      manifestDigest: baseManifestDigest,
    },
    predecessor: {
      count: canonicalEntries.length + 1,
      head: predecessorName || null,
      manifestDigest: predecessorManifestDigest,
      sha256: predecessorSha256,
    },
    candidate: {
      name: candidateName || null,
      ordinal: canonicalEntries.length + 2,
      sha256: candidateSha256,
      pinnedSha256: EXPECTED_CANDIDATE_SHA256,
    },
    findings,
  });
}

export function assertIdentityMailTenantLockDrainCurrent181Foundation(
  artifact,
) {
  const report = evaluateIdentityMailTenantLockDrainCurrent181Foundation(
    artifact,
  );
  if (report.decision !== "COMPLIANT") {
    throw new IdentityMailTenantLockDrainCurrent181FoundationError(report);
  }
  return report;
}

export function runIdentityMailTenantLockDrainCurrent181SelfTest(artifact) {
  const baseline = evaluateIdentityMailTenantLockDrainCurrent181Foundation(
    artifact,
  );
  if (baseline.decision !== "COMPLIANT" || baseline.findings.length !== 0) {
    throw new Error("CURRENT181 self-test requires a compliant baseline.");
  }

  const replaceCandidateFragment = (value, before, after) => {
    const sql = value?.candidate?.sql;
    if (typeof sql !== "string" || !sql.includes(before)) {
      throw new Error(`CURRENT181 self-test fixture is missing: ${before}`);
    }
    value.candidate.sql = sql.replace(before, after);
  };
  const probes = [
    {
      name: "sha-metadata-drift",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS.METADATA_DRIFT,
      mutate(value) {
        const metadata = safeJson(value?.candidate?.metadataText);
        if (metadata === null) {
          throw new Error("CURRENT181 self-test candidate metadata is invalid.");
        }
        metadata.migrationSqlSha256 = "1".repeat(64);
        value.candidate.metadataText = JSON.stringify(metadata);
      },
    },
    {
      name: "worker-tenant-lock-order",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS
          .WORKER_TENANT_LOCK_ORDER_DRIFT,
      mutate(value) {
        replaceCandidateFragment(
          value,
          "BEGIN\n  IF p_provider_authority_digest IS NULL",
          'BEGIN\n  PERFORM 1 FROM public."IdentityMailOutbox";\n  IF p_provider_authority_digest IS NULL',
        );
      },
    },
    {
      name: "claim-skip-locked",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS
          .CLAIM_CONTRACT_DRIFT,
      mutate(value) {
        replaceCandidateFragment(value, " SKIP LOCKED", "");
      },
    },
    {
      name: "draining-retry",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS.DRAIN_RETRY_DRIFT,
      mutate(value) {
        replaceCandidateFragment(
          value,
          "ELSIF draining AND p_outcome_code IN (",
          "ELSIF NOT draining AND p_outcome_code IN (",
        );
      },
    },
    {
      name: "catalog-argument-defaults",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS
          .CATALOG_POSTCONDITION_DRIFT,
      mutate(value) {
        replaceCandidateFragment(
          value,
          "routine.pronargdefaults IS DISTINCT FROM 0",
          "routine.pronargdefaults IS DISTINCT FROM 1",
        );
      },
    },
    {
      name: "catalog-unexpected-overload",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS
          .CATALOG_POSTCONDITION_DRIFT,
      mutate(value) {
        replaceCandidateFragment(
          value,
          "expected_routine.oid <> candidate.oid",
          "expected_routine.oid = candidate.oid",
        );
      },
    },
    {
      name: "ready-index-order",
      finding:
        IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_FINDINGS.READY_INDEX_DRIFT,
      mutate(value) {
        replaceCandidateFragment(
          value,
          '    "tenantId",\n    "availableAt",\n    "createdAt",\n    "id"',
          '    "tenantId",\n    "createdAt",\n    "availableAt",\n    "id"',
        );
      },
    },
  ];
  let probesPassed = 0;
  for (const probe of probes) {
    const probeArtifact = structuredClone(artifact);
    probe.mutate(probeArtifact);
    const report = evaluateIdentityMailTenantLockDrainCurrent181Foundation(
      probeArtifact,
    );
    if (
      report.decision !== "BLOCKED" ||
      !report.findings.includes(probe.finding)
    ) {
      throw new Error(
        `CURRENT181 self-test probe failed: ${probe.name} (${probe.finding}).`,
      );
    }
    probesPassed += 1;
  }

  return deepFreeze({
    script: "identity-mail-tenant-lock-drain-current181-foundation",
    status: "SELF_TEST_PASSED",
    authorization: false,
    canMutate: false,
    candidate: IDENTITY_MAIL_TENANT_LOCK_DRAIN_CURRENT181_CANDIDATE,
    baselineDecision: baseline.decision,
    probesPassed,
  });
}

function helpText() {
  return `Identity mail tenant lock/drain CURRENT181 static gate\n\nUsage:\n  node scripts/identity-mail-tenant-lock-drain-current181-foundation.mjs --check\n  node scripts/identity-mail-tenant-lock-drain-current181-foundation.mjs --self-test\n  node scripts/identity-mail-tenant-lock-drain-current181-foundation.mjs --help\n\nThe command is read-only. --check validates the frozen migration.sql against its pinned SHA-256 and static contract. A compliant result does not authorize deployment or mutation.\n`;
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(helpText());
    return 0;
  }
  if (
    argv.length !== 1 ||
    !new Set(["--check", "--self-test"]).has(argv[0])
  ) {
    process.stderr.write("Use --check, --self-test, or --help.\n");
    return 2;
  }
  const artifact = await loadIdentityMailTenantLockDrainCurrent181Artifact();
  if (argv[0] === "--self-test") {
    process.stdout.write(
      `${JSON.stringify(runIdentityMailTenantLockDrainCurrent181SelfTest(artifact))}\n`,
    );
    return 0;
  }
  try {
    const report = assertIdentityMailTenantLockDrainCurrent181Foundation(
      artifact,
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof IdentityMailTenantLockDrainCurrent181FoundationError) {
      process.stderr.write(`${JSON.stringify(error.report)}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const isMain =
  invokedPath.length > 0 &&
  pathToFileURL(invokedPath).href === import.meta.url;
if (isMain) {
  main(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${String(error instanceof Error ? error.message : error)}\n`);
      process.exitCode = 1;
    });
}

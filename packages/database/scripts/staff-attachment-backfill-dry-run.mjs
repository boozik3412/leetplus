import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const SCRIPT_NAME = 'staff-attachment-backfill-dry-run';
const REPORT_SCHEMA_VERSION = 1;
const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 1_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const MIN_STATEMENT_TIMEOUT_MS = 1_000;
const MAX_STATEMENT_TIMEOUT_MS = 120_000;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 10 * 60_000;
const MIN_TRANSACTION_TIMEOUT_MS = 30_000;
const MAX_TRANSACTION_TIMEOUT_MS = 60 * 60_000;
const MAX_NODES_PER_VALUE = 20_000;
const MAX_REFERENCES_PER_ROW = 1_000;
const PRODUCTION_ATTESTATION =
  'I_ATTEST_THIS_IS_A_READ_ONLY_PRODUCTION_ATTACHMENT_INVENTORY';
const RELEASE_SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const TARGET_ENVIRONMENTS = new Set(['development', 'staging', 'production']);
const UUID_SOURCE =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID_EXACT_RE = new RegExp(`^${UUID_SOURCE}$`);
const ATTACHMENT_PATH_RE = new RegExp(
  `^\\/(?:api\\/)?staff\\/attachments\\/(${UUID_SOURCE})$`,
  'i',
);
const EMBEDDED_RELATIVE_RE = new RegExp(
  `(^|[\\s"'(=:\\[\\{>])(\\/(?:api\\/)?staff\\/attachments\\/(${UUID_SOURCE}))(?=$|[\\s"')\\],\\}<])`,
  'gim',
);
const EMBEDDED_HTTPS_RE = /https:\/\/[^\s"'<>()[\]{},;!?]+/gim;
const EMBEDDED_HTTP_RE = /http:\/\/[^\s"'<>()[\]{},;!?]+/gim;
const ATTACHMENT_ROUTE_MARKER_RE = /\/(?:api\/)?staff\/attachments\//i;

const HELP = `
${SCRIPT_NAME}

Read-only inventory for the staged staff attachment ACL backfill. The script
never creates, updates, or deletes application data. It uses one PostgreSQL
connection with default_transaction_read_only=on and scans stable, bounded
keyset pages inside one PostgreSQL REPEATABLE READ snapshot.

Usage:
  node scripts/staff-attachment-backfill-dry-run.mjs [options]

Options:
  --help                     Show this help and exit without reading env or DB.
  --self-test                Run parser/source safety checks without env or DB.
  --pretty                   Pretty-print the aggregate JSON report.
  --batch-size <1..1000>     Keyset page size (default: 250).
  --print-database-fingerprint
                             Print only the credential-free target fingerprint
                             for DATABASE_URL, then exit without DB access.

Required environment:
  DATABASE_URL
    PostgreSQL connection string. Credentials and the URL are never printed.

  STAFF_ATTACHMENT_BACKFILL_TARGET
    One of: development, staging, production. There is no implicit target.

Production attestation:
  When STAFF_ATTACHMENT_BACKFILL_TARGET=production or NODE_ENV=production,
  STAFF_ATTACHMENT_BACKFILL_PRODUCTION_ATTESTATION must equal:
  ${PRODUCTION_ATTESTATION}

  Production also requires STAFF_ATTACHMENT_BACKFILL_RELEASE_SHA to be the
  exact lowercase release commit and
  STAFF_ATTACHMENT_BACKFILL_EXPECTED_DATABASE_FINGERPRINT to match the
  credential-free DATABASE_URL target fingerprint. Generate the fingerprint
  from the reviewed production URL with --print-database-fingerprint before
  opening the read-only inventory window.

Optional environment:
  STAFF_ATTACHMENT_ALLOWED_HTTPS_ORIGINS
    Comma-separated HTTPS origins accepted for absolute attachment URLs.
    Every entry must be an origin only (for example https://app.example.test),
    with no path, query, fragment, username, or password. Empty means that only
    exact relative /staff/attachments/<uuid> and
    /api/staff/attachments/<uuid> references are recognized.

  STAFF_ATTACHMENT_BACKFILL_BATCH_SIZE
    Keyset page size used when --batch-size is omitted.

  STAFF_ATTACHMENT_BACKFILL_STATEMENT_TIMEOUT_MS
    PostgreSQL statement timeout from 1000 through 120000 milliseconds
    (default: 30000).

  STAFF_ATTACHMENT_BACKFILL_TRANSACTION_TIMEOUT_MS
    Maximum duration of the read-only snapshot transaction from 30000 through
    3600000 milliseconds (default: 600000). Classification and JSON rendering
    happen only after this transaction is released.

Output safety:
  The JSON contains aggregate counts and stable reason codes only. It never
  contains raw UUIDs, URLs, file names, user data, or database credentials.
  Normalized chat relations and exact task-comment evidence URLs are reported
  as primary candidates. Recursive JSON and rich-text occurrences are
  secondary copies for review only and are never proposed for auto-binding.
`.trim();

function failContract(code, message) {
  const error = new Error(message);
  error.code = code;
  error.safeContractError = true;
  throw error;
}

function parseBoundedInteger(
  value,
  { code, label, minimum, maximum, fallback },
) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (!/^\d+$/.test(String(value))) {
    failContract(code, `${label} must be an integer.`);
  }

  const parsed = Number.parseInt(String(value), 10);
  if (parsed < minimum || parsed > maximum) {
    failContract(code, `${label} is outside the permitted range.`);
  }

  return parsed;
}

function parseArguments(argv) {
  let batchSize;
  let printDatabaseFingerprint = false;
  let pretty = false;
  let selfTest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help') {
      return {
        help: true,
        printDatabaseFingerprint: false,
        selfTest: false,
        pretty: false,
        batchSize: DEFAULT_BATCH_SIZE,
      };
    }

    if (argument === '--self-test') {
      selfTest = true;
      continue;
    }

    if (argument === '--pretty') {
      pretty = true;
      continue;
    }

    if (argument === '--print-database-fingerprint') {
      printDatabaseFingerprint = true;
      continue;
    }

    if (argument === '--batch-size') {
      const value = argv[index + 1];
      if (value === undefined) {
        failContract(
          'CLI_BATCH_SIZE_VALUE_REQUIRED',
          '--batch-size requires a value.',
        );
      }
      batchSize = parseBoundedInteger(value, {
        code: 'CLI_BATCH_SIZE_INVALID',
        label: '--batch-size',
        minimum: 1,
        maximum: MAX_BATCH_SIZE,
      });
      index += 1;
      continue;
    }

    failContract(
      'CLI_ARGUMENT_UNSUPPORTED',
      'An unsupported command-line argument was provided.',
    );
  }

  if (printDatabaseFingerprint && (selfTest || pretty || batchSize)) {
    failContract(
      'CLI_FINGERPRINT_ARGUMENT_CONFLICT',
      '--print-database-fingerprint cannot be combined with scan options.',
    );
  }

  return {
    help: false,
    printDatabaseFingerprint,
    selfTest,
    pretty,
    batchSize,
  };
}

function parseTargetEnvironment() {
  const target = String(process.env.STAFF_ATTACHMENT_BACKFILL_TARGET ?? '')
    .trim()
    .toLowerCase();

  if (!TARGET_ENVIRONMENTS.has(target)) {
    failContract(
      'TARGET_ENVIRONMENT_REQUIRED',
      'STAFF_ATTACHMENT_BACKFILL_TARGET must name an allowed environment.',
    );
  }

  const nodeEnvironment = String(process.env.NODE_ENV ?? '')
    .trim()
    .toLowerCase();
  const productionRequested =
    target === 'production' || nodeEnvironment === 'production';

  if (nodeEnvironment === 'production' && target !== 'production') {
    failContract(
      'PRODUCTION_TARGET_MISMATCH',
      'NODE_ENV=production requires an explicit production scan target.',
    );
  }

  if (
    productionRequested &&
    process.env.STAFF_ATTACHMENT_BACKFILL_PRODUCTION_ATTESTATION !==
      PRODUCTION_ATTESTATION
  ) {
    failContract(
      'PRODUCTION_ATTESTATION_REQUIRED',
      'The exact production read-only inventory attestation is required.',
    );
  }

  return { target, productionAttested: productionRequested };
}

export function parseAllowedOrigins(
  rawValue = process.env.STAFF_ATTACHMENT_ALLOWED_HTTPS_ORIGINS ?? '',
) {
  const raw = String(rawValue).trim();
  if (!raw) {
    return new Set();
  }

  const entries = raw.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    failContract(
      'ALLOWED_ORIGIN_EMPTY_ENTRY',
      'The HTTPS origin allowlist contains an empty entry.',
    );
  }

  const origins = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    let parsed;
    try {
      parsed = new URL(entries[index]);
    } catch {
      failContract(
        'ALLOWED_ORIGIN_INVALID',
        'An HTTPS origin allowlist entry is invalid.',
      );
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.origin === 'null'
    ) {
      failContract(
        'ALLOWED_ORIGIN_NOT_HTTPS_ORIGIN',
        'Every allowlist entry must be an HTTPS origin without extra URL parts.',
      );
    }

    origins.add(parsed.origin);
  }

  return origins;
}

export function parsePostgresDatabaseUrl(raw) {
  if (!raw) {
    failContract('DATABASE_URL_REQUIRED', 'DATABASE_URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    failContract(
      'DATABASE_URL_INVALID',
      'DATABASE_URL must be a valid PostgreSQL connection string.',
    );
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    failContract(
      'DATABASE_URL_PROTOCOL_INVALID',
      'DATABASE_URL must use the postgres or postgresql protocol.',
    );
  }

  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    failContract(
      'DATABASE_URL_TARGET_INVALID',
      'DATABASE_URL must identify an explicit PostgreSQL host and database.',
    );
  }

  return parsed;
}

export function databaseTargetFingerprint(raw) {
  const parsed = parsePostgresDatabaseUrl(raw);
  const canonicalTarget = {
    databasePath: parsed.pathname,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    protocol: 'postgresql:',
    schema: parsed.searchParams.get('schema') || 'public',
  };

  return createHash('sha256')
    .update('STAFF_ATTACHMENT_DATABASE_TARGET_V1\0', 'utf8')
    .update(JSON.stringify(canonicalTarget), 'utf8')
    .digest('hex');
}

function parseOperationalBinding({ productionRequested, targetFingerprint }) {
  const releaseSha = String(
    process.env.STAFF_ATTACHMENT_BACKFILL_RELEASE_SHA ?? '',
  ).trim();
  const expectedTargetFingerprint = String(
    process.env.STAFF_ATTACHMENT_BACKFILL_EXPECTED_DATABASE_FINGERPRINT ?? '',
  ).trim();

  if (productionRequested && !RELEASE_SHA_RE.test(releaseSha)) {
    failContract(
      'PRODUCTION_RELEASE_SHA_REQUIRED',
      'Production inventory requires the exact lowercase release commit.',
    );
  }
  if (releaseSha && !RELEASE_SHA_RE.test(releaseSha)) {
    failContract(
      'RELEASE_SHA_INVALID',
      'The release commit must be 40 lowercase hexadecimal characters.',
    );
  }
  if (productionRequested && !SHA256_RE.test(expectedTargetFingerprint)) {
    failContract(
      'PRODUCTION_DATABASE_FINGERPRINT_REQUIRED',
      'Production inventory requires the reviewed database target fingerprint.',
    );
  }
  if (expectedTargetFingerprint && !SHA256_RE.test(expectedTargetFingerprint)) {
    failContract(
      'DATABASE_FINGERPRINT_INVALID',
      'The expected database target fingerprint must be lowercase SHA-256.',
    );
  }
  if (
    expectedTargetFingerprint &&
    expectedTargetFingerprint !== targetFingerprint
  ) {
    failContract(
      'DATABASE_TARGET_FINGERPRINT_MISMATCH',
      'DATABASE_URL does not match the reviewed database target fingerprint.',
    );
  }

  return {
    databaseTargetFingerprint: targetFingerprint,
    releaseSha: releaseSha || null,
  };
}

function buildReadOnlyDatabaseUrl(statementTimeoutMs) {
  const parsed = parsePostgresDatabaseUrl(process.env.DATABASE_URL);

  const existingOptions = parsed.searchParams.get('options')?.trim();
  const enforcedOptions = [
    existingOptions,
    '-c default_transaction_read_only=on',
    `-c statement_timeout=${statementTimeoutMs}`,
    '-c lock_timeout=2000',
  ]
    .filter(Boolean)
    .join(' ');

  // One connection makes the session-level read-only contract observable and
  // prevents a pool from opening an accidentally unguarded connection.
  parsed.searchParams.set('connection_limit', '1');
  parsed.searchParams.set('options', enforcedOptions);
  return parsed.toString();
}

function createSourceReport(classification) {
  return {
    classification,
    rowsScanned: 0,
    rowsWithReferenceSignals: 0,
    exactReferences: 0,
    validReferences: 0,
    autoBindCandidateReferences: 0,
    reviewOnlyReferences: 0,
    reasonCounts: {},
  };
}

function createSourcesReport() {
  return {
    normalized_chat_relation: createSourceReport('PRIMARY_AUTO_BIND_CANDIDATE'),
    task_comment_evidence_url: createSourceReport(
      'PRIMARY_AUTO_BIND_CANDIDATE',
    ),
    chat_message_body: createSourceReport('SECONDARY_REVIEW_ONLY'),
    staff_task_fields: createSourceReport('SECONDARY_REVIEW_ONLY'),
    checklist_run_answers: createSourceReport('SECONDARY_REVIEW_ONLY'),
    knowledge_article_current: createSourceReport('SECONDARY_REVIEW_ONLY'),
    knowledge_article_version: createSourceReport('SECONDARY_REVIEW_ONLY'),
    shift_regulation_current: createSourceReport('SECONDARY_REVIEW_ONLY'),
    shift_regulation_version: createSourceReport('SECONDARY_REVIEW_ONLY'),
    training_course_steps: createSourceReport('SECONDARY_REVIEW_ONLY'),
    onboarding_plan_steps: createSourceReport('SECONDARY_REVIEW_ONLY'),
  };
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function recordReason(report, sourceName, reasonCode, amount = 1) {
  if (amount <= 0) {
    return;
  }
  increment(report.sources[sourceName].reasonCounts, reasonCode, amount);
  increment(report.reasonCounts, reasonCode, amount);
}

function mergeReasonCounts(report, sourceName, reasonCounts) {
  for (const [reasonCode, amount] of Object.entries(reasonCounts)) {
    recordReason(report, sourceName, reasonCode, amount);
  }
}

export function parseExactAttachmentReference(value, allowedOrigins) {
  if (typeof value !== 'string' || value.length === 0) {
    return { match: null, reasonCode: null };
  }

  const relative = ATTACHMENT_PATH_RE.exec(value);
  if (relative) {
    return {
      match: {
        attachmentId: relative[1],
        referenceForm: 'RELATIVE',
      },
      reasonCode: null,
    };
  }

  if (!ATTACHMENT_ROUTE_MARKER_RE.test(value)) {
    return { match: null, reasonCode: null };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return {
      match: null,
      reasonCode: 'REFERENCE_LIKE_VALUE_NOT_EXACT',
    };
  }

  const exactPath = ATTACHMENT_PATH_RE.exec(parsed.pathname);
  const reviewAttachmentId = exactPath?.[1] ?? null;

  if (parsed.protocol !== 'https:') {
    return {
      match: null,
      reasonCode: 'ABSOLUTE_REFERENCE_NOT_HTTPS',
      reviewAttachmentId,
    };
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return {
      match: null,
      reasonCode: 'ABSOLUTE_REFERENCE_NOT_EXACT',
      reviewAttachmentId,
    };
  }

  if (!exactPath) {
    return {
      match: null,
      reasonCode: 'ABSOLUTE_REFERENCE_NOT_EXACT',
      reviewAttachmentId: null,
    };
  }

  if (!allowedOrigins.has(parsed.origin)) {
    return {
      match: null,
      reasonCode: 'ABSOLUTE_REFERENCE_ORIGIN_NOT_ALLOWLISTED',
      reviewAttachmentId,
    };
  }

  return {
    match: {
      attachmentId: exactPath[1],
      referenceForm: 'ABSOLUTE_HTTPS',
    },
    reasonCode: null,
  };
}

function collectEmbeddedReferences(value, allowedOrigins) {
  const matches = [];
  const reasonCounts = {};

  if (typeof value !== 'string' || value.length === 0) {
    return { matches, reasonCounts };
  }

  const looksLikeStandaloneReference =
    value.startsWith('/staff/attachments/') ||
    value.startsWith('/api/staff/attachments/') ||
    /^https?:\/\/[^\s"'<>]+$/i.test(value);
  if (looksLikeStandaloneReference) {
    const direct = parseExactAttachmentReference(value, allowedOrigins);
    if (direct.match) {
      matches.push(direct.match);
      return { matches, reasonCounts };
    }
    if (direct.reasonCode) {
      increment(reasonCounts, direct.reasonCode);
      return { matches, reasonCounts };
    }
  }

  EMBEDDED_RELATIVE_RE.lastIndex = 0;
  let relativeMatch;
  while (
    matches.length < MAX_REFERENCES_PER_ROW &&
    (relativeMatch = EMBEDDED_RELATIVE_RE.exec(value)) !== null
  ) {
    matches.push({
      attachmentId: relativeMatch[3],
      referenceForm: 'RELATIVE_EMBEDDED',
    });
  }

  const inspectAbsoluteTokens = (expression, protocol) => {
    expression.lastIndex = 0;
    let token;
    while (
      matches.length < MAX_REFERENCES_PER_ROW &&
      (token = expression.exec(value)) !== null
    ) {
      if (!ATTACHMENT_ROUTE_MARKER_RE.test(token[0])) {
        continue;
      }

      if (protocol !== 'https:') {
        increment(reasonCounts, 'ABSOLUTE_REFERENCE_NOT_HTTPS');
        continue;
      }

      const parsed = parseExactAttachmentReference(token[0], allowedOrigins);
      if (parsed.match) {
        matches.push({
          ...parsed.match,
          referenceForm: 'ABSOLUTE_HTTPS_EMBEDDED',
        });
      } else if (parsed.reasonCode) {
        increment(reasonCounts, parsed.reasonCode);
      }
    }
  };

  inspectAbsoluteTokens(EMBEDDED_HTTPS_RE, 'https:');
  inspectAbsoluteTokens(EMBEDDED_HTTP_RE, 'http:');

  if (
    matches.length === 0 &&
    Object.keys(reasonCounts).length === 0 &&
    ATTACHMENT_ROUTE_MARKER_RE.test(value)
  ) {
    increment(reasonCounts, 'REFERENCE_LIKE_TEXT_NOT_EXACT');
  }

  return { matches, reasonCounts };
}

function collectRecursiveReferences(value, allowedOrigins) {
  const matches = [];
  const reasonCounts = {};
  const stack = [value];
  let visitedNodes = 0;

  while (stack.length > 0) {
    if (visitedNodes >= MAX_NODES_PER_VALUE) {
      increment(reasonCounts, 'SOURCE_VALUE_NODE_LIMIT_REACHED');
      break;
    }
    visitedNodes += 1;

    const current = stack.pop();
    if (typeof current === 'string') {
      const extracted = collectEmbeddedReferences(current, allowedOrigins);
      for (const match of extracted.matches) {
        if (matches.length >= MAX_REFERENCES_PER_ROW) {
          increment(reasonCounts, 'SOURCE_ROW_REFERENCE_LIMIT_REACHED');
          break;
        }
        matches.push(match);
      }
      for (const [reasonCode, amount] of Object.entries(
        extracted.reasonCounts,
      )) {
        increment(reasonCounts, reasonCode, amount);
      }
      continue;
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
      continue;
    }

    if (current && typeof current === 'object') {
      const values = Object.values(current);
      for (let index = values.length - 1; index >= 0; index -= 1) {
        stack.push(values[index]);
      }
    }
  }

  return { matches, reasonCounts };
}

function collectSecondaryFields(values, allowedOrigins) {
  const matches = [];
  const reasonCounts = {};

  for (const value of values) {
    const extracted = collectRecursiveReferences(value, allowedOrigins);
    for (const match of extracted.matches) {
      if (matches.length >= MAX_REFERENCES_PER_ROW) {
        increment(reasonCounts, 'SOURCE_ROW_REFERENCE_LIMIT_REACHED');
        break;
      }
      matches.push(match);
    }
    for (const [reasonCode, amount] of Object.entries(extracted.reasonCounts)) {
      increment(reasonCounts, reasonCode, amount);
    }
  }

  return { matches, reasonCounts };
}

function makeOccurrence({
  attachmentId,
  sourceTenantId,
  parentTenantId,
  resourceKind,
  resourceId,
  resourceStoreId,
  resourceStoreTenantId,
  tier,
  referenceForm,
  parentShapeValid = true,
}) {
  return {
    attachmentId,
    sourceTenantId,
    parentTenantId,
    resourceKind,
    resourceId,
    resourceStoreId,
    resourceStoreTenantId,
    tier,
    referenceForm,
    parentShapeValid,
  };
}

function buildOccurrenceFromMatch(match, context) {
  return makeOccurrence({
    ...context,
    attachmentId: match.attachmentId,
    referenceForm: match.referenceForm,
  });
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function candidateRecord(candidateRecords, attachmentId) {
  let record = candidateRecords.get(attachmentId);
  if (!record) {
    record = {
      found: false,
      primaryParents: new Set(),
      secondaryParents: new Set(),
      primaryOccurrences: 0,
      secondaryOccurrences: 0,
      invalidOccurrences: 0,
    };
    candidateRecords.set(attachmentId, record);
  }
  return record;
}

async function validateOccurrences({
  prisma,
  occurrences,
  report,
  sourceName,
  candidateRecords,
  snapshotAt,
  batchSize,
}) {
  if (occurrences.length === 0) {
    return;
  }

  const sourceReport = report.sources[sourceName];
  sourceReport.exactReferences += occurrences.length;

  const uniqueIds = [
    ...new Set(
      occurrences
        .map((occurrence) => occurrence.attachmentId)
        .filter((id) => UUID_EXACT_RE.test(id)),
    ),
  ];
  const attachmentsById = new Map();

  for (const ids of chunk(uniqueIds, batchSize)) {
    const rows = await prisma.staffAttachment.findMany({
      where: {
        id: { in: ids },
        createdAt: { lte: snapshotAt },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });
    for (const row of rows) {
      attachmentsById.set(row.id, row);
    }
  }

  for (const occurrence of occurrences) {
    const candidate = candidateRecord(
      candidateRecords,
      occurrence.attachmentId,
    );

    if (!UUID_EXACT_RE.test(occurrence.attachmentId)) {
      candidate.invalidOccurrences += 1;
      recordReason(report, sourceName, 'NORMALIZED_ATTACHMENT_ID_NOT_UUID');
      continue;
    }

    const attachment = attachmentsById.get(occurrence.attachmentId);
    if (attachment) {
      candidate.found = true;
    }

    if (!occurrence.parentShapeValid) {
      candidate.invalidOccurrences += 1;
      recordReason(report, sourceName, 'PARENT_SHAPE_INCONSISTENT');
      continue;
    }

    if (occurrence.sourceTenantId !== occurrence.parentTenantId) {
      candidate.invalidOccurrences += 1;
      recordReason(report, sourceName, 'SOURCE_PARENT_TENANT_MISMATCH');
      continue;
    }

    if (
      occurrence.resourceStoreId &&
      occurrence.resourceStoreTenantId !== occurrence.sourceTenantId
    ) {
      candidate.invalidOccurrences += 1;
      recordReason(report, sourceName, 'PARENT_STORE_TENANT_MISMATCH');
      continue;
    }

    if (!attachment) {
      candidate.invalidOccurrences += 1;
      recordReason(report, sourceName, 'ATTACHMENT_NOT_FOUND');
      continue;
    }

    if (attachment.tenantId !== occurrence.sourceTenantId) {
      candidate.invalidOccurrences += 1;
      recordReason(report, sourceName, 'ATTACHMENT_TENANT_MISMATCH');
      continue;
    }

    sourceReport.validReferences += 1;
    const parentKey = `${occurrence.resourceKind}:${occurrence.resourceId}`;

    if (occurrence.tier === 'PRIMARY') {
      candidate.primaryOccurrences += 1;
      candidate.primaryParents.add(parentKey);
      sourceReport.autoBindCandidateReferences += 1;
      recordReason(
        report,
        sourceName,
        occurrence.referenceForm === 'NORMALIZED_RELATION'
          ? 'NORMALIZED_RELATION_VALID'
          : 'PRIMARY_EXACT_REFERENCE_VALID',
      );
    } else {
      candidate.secondaryOccurrences += 1;
      candidate.secondaryParents.add(parentKey);
      sourceReport.reviewOnlyReferences += 1;
      recordReason(report, sourceName, 'SECONDARY_EXACT_REFERENCE_REVIEW_ONLY');
    }
  }
}

async function scanKeysetSource({
  prisma,
  report,
  sourceName,
  batchSize,
  snapshotAt,
  candidateRecords,
  fetchPage,
  analyzeRow,
}) {
  let cursor = null;

  for (;;) {
    const rows = await fetchPage(cursor);
    if (rows.length === 0) {
      break;
    }

    report.sources[sourceName].rowsScanned += rows.length;
    const occurrences = [];

    for (const row of rows) {
      const analysis = analyzeRow(row);
      mergeReasonCounts(report, sourceName, analysis.reasonCounts ?? {});
      if (
        analysis.occurrences.length > 0 ||
        Object.keys(analysis.reasonCounts ?? {}).length > 0
      ) {
        report.sources[sourceName].rowsWithReferenceSignals += 1;
      }
      occurrences.push(...analysis.occurrences);
    }

    await validateOccurrences({
      prisma,
      occurrences,
      report,
      sourceName,
      candidateRecords,
      snapshotAt,
      batchSize,
    });

    cursor = rows.at(-1).id;
  }
}

function keysetWhere(cursor, snapshotAt) {
  return {
    createdAt: { lte: snapshotAt },
    ...(cursor ? { id: { gt: cursor } } : {}),
  };
}

function analyzeSecondaryRow({
  row,
  values,
  allowedOrigins,
  resourceKind,
  resourceId,
  parentTenantId,
  resourceStoreId,
  resourceStoreTenantId,
  parentShapeValid = true,
  reasonCounts = {},
}) {
  const extracted = collectSecondaryFields(values, allowedOrigins);
  const context = {
    sourceTenantId: row.tenantId,
    parentTenantId,
    resourceKind,
    resourceId,
    resourceStoreId,
    resourceStoreTenantId,
    tier: 'SECONDARY',
    parentShapeValid,
  };
  const mergedReasonCounts = { ...reasonCounts };
  for (const [reasonCode, amount] of Object.entries(extracted.reasonCounts)) {
    increment(mergedReasonCounts, reasonCode, amount);
  }

  return {
    occurrences: extracted.matches.map((match) =>
      buildOccurrenceFromMatch(match, context),
    ),
    reasonCounts: mergedReasonCounts,
  };
}

function runSelfTests() {
  const attachmentId = '123e4567-e89b-12d3-a456-426614174000';
  const sources = createSourcesReport();
  const requiredSecondarySources = ['chat_message_body', 'staff_task_fields'];
  const fingerprintA = databaseTargetFingerprint(
    'postgresql://operator:first-secret@db.example.test:5432/leetplus?schema=public',
  );
  const fingerprintB = databaseTargetFingerprint(
    'postgresql://operator:second-secret@db.example.test:5432/leetplus?schema=public',
  );
  const fingerprintOtherSchema = databaseTargetFingerprint(
    'postgresql://operator:first-secret@db.example.test:5432/leetplus?schema=other',
  );

  if (
    !SHA256_RE.test(fingerprintA) ||
    fingerprintA !== fingerprintB ||
    fingerprintA === fingerprintOtherSchema
  ) {
    failContract(
      'SELF_TEST_DATABASE_FINGERPRINT_FAILED',
      'Database target fingerprints must exclude credentials and bind schema.',
    );
  }

  if (
    requiredSecondarySources.some(
      (sourceName) =>
        sources[sourceName]?.classification !== 'SECONDARY_REVIEW_ONLY',
    )
  ) {
    failContract(
      'SELF_TEST_SOURCE_CLASSIFICATION_FAILED',
      'Secondary inventory sources must remain review-only.',
    );
  }

  const analysis = analyzeSecondaryRow({
    row: { tenantId: 'tenant-a' },
    values: [
      `Copied link: /staff/attachments/${attachmentId}`,
      { nested: `/api/staff/attachments/${attachmentId}` },
    ],
    allowedOrigins: new Set(),
    resourceKind: 'STAFF_TASK',
    resourceId: 'task-a',
    parentTenantId: 'tenant-a',
    resourceStoreId: 'store-a',
    resourceStoreTenantId: 'tenant-a',
  });

  if (
    analysis.occurrences.length !== 2 ||
    analysis.occurrences.some(
      (occurrence) =>
        occurrence.tier !== 'SECONDARY' ||
        occurrence.resourceKind !== 'STAFF_TASK' ||
        occurrence.attachmentId !== attachmentId,
    )
  ) {
    failContract(
      'SELF_TEST_SECONDARY_EXTRACTION_FAILED',
      'Secondary attachment references were not classified safely.',
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      schemaVersion: REPORT_SCHEMA_VERSION,
      script: SCRIPT_NAME,
      status: 'passed',
      mode: 'SELF_TEST',
      rawIdentifiersEmitted: false,
    })}\n`,
  );
}

async function scanAttachmentInventory({
  prisma,
  report,
  batchSize,
  snapshotAt,
}) {
  let cursor = null;

  for (;;) {
    const rows = await prisma.staffAttachment.findMany({
      where: keysetWhere(cursor, snapshotAt),
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        state: true,
      },
    });
    if (rows.length === 0) {
      break;
    }

    report.attachmentInventory.rowsScanned += rows.length;
    for (const row of rows) {
      increment(report.attachmentInventory.stateCounts, row.state);
    }
    cursor = rows.at(-1).id;
  }
}

async function runInventory({
  prisma,
  batchSize,
  allowedOrigins,
  databaseTargetFingerprint,
  releaseSha,
  target,
  productionAttested,
  statementTimeoutMs,
  transactionTimeoutMs,
  pretty,
}) {
  const startedMonotonic = performance.now();
  const candidateRecords = new Map();
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    script: SCRIPT_NAME,
    status: 'completed',
    mode: 'READ_ONLY_DRY_RUN',
    snapshotStartedAt: null,
    safety: {
      target,
      productionAttested,
      releaseSha,
      databaseTargetFingerprint,
      databaseSessionReadOnly: false,
      singleConnection: true,
      snapshotIsolation: 'REPEATABLE READ',
      snapshotConsistent: false,
      batchSize,
      statementTimeoutMs,
      transactionTimeoutMs,
      allowedHttpsOriginCount: allowedOrigins.size,
      maximumNodesPerValue: MAX_NODES_PER_VALUE,
      maximumReferencesPerRow: MAX_REFERENCES_PER_ROW,
      rawIdentifiersEmitted: false,
      rawUrlsEmitted: false,
      fileNamesEmitted: false,
    },
    attachmentInventory: {
      rowsScanned: 0,
      stateCounts: {},
    },
    sources: createSourcesReport(),
    reasonCounts: {},
    classificationReasonCounts: {},
    totals: {},
  };

  await prisma.$transaction(
    async (tx) => {
      const snapshotRows = await tx.$queryRaw`
        SELECT
          transaction_timestamp() AS "snapshotAt",
          current_setting('default_transaction_read_only') AS "defaultReadOnly",
          current_setting('transaction_read_only') AS "transactionReadOnly",
          current_setting('transaction_isolation') AS "transactionIsolation"
      `;
      const snapshot = snapshotRows[0];
      const readOnly =
        snapshotRows.length === 1 &&
        snapshot?.defaultReadOnly === 'on' &&
        snapshot?.transactionReadOnly === 'on';
      if (!readOnly) {
        failContract(
          'DATABASE_SESSION_NOT_READ_ONLY',
          'PostgreSQL did not confirm the enforced read-only session.',
        );
      }
      if (snapshot?.transactionIsolation !== 'repeatable read') {
        failContract(
          'DATABASE_SNAPSHOT_ISOLATION_INVALID',
          'PostgreSQL did not confirm REPEATABLE READ snapshot isolation.',
        );
      }
      if (!(snapshot.snapshotAt instanceof Date)) {
        failContract(
          'DATABASE_SNAPSHOT_TIMESTAMP_INVALID',
          'PostgreSQL did not return a valid snapshot timestamp.',
        );
      }

      const snapshotAt = snapshot.snapshotAt;
      report.snapshotStartedAt = snapshotAt.toISOString();
      report.safety.databaseSessionReadOnly = true;
      report.safety.snapshotConsistent = true;

      await scanAttachmentInventory({
        prisma: tx,
        report,
        batchSize,
        snapshotAt,
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'normalized_chat_relation',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffChatMessageAttachment.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              attachmentId: true,
              messageId: true,
              message: {
                select: {
                  tenantId: true,
                  storeId: true,
                  store: { select: { tenantId: true } },
                  channel: {
                    select: {
                      tenantId: true,
                      scope: true,
                      storeId: true,
                    },
                  },
                },
              },
            },
          }),
        analyzeRow: (row) => {
          const messageStoreId = row.message.storeId;
          const channelStoreId = row.message.channel.storeId;
          const storeConflict =
            row.message.channel.scope === 'STORE' &&
            (!messageStoreId ||
              !channelStoreId ||
              messageStoreId !== channelStoreId);

          return {
            occurrences: [
              makeOccurrence({
                attachmentId: row.attachmentId,
                sourceTenantId: row.tenantId,
                parentTenantId: row.message.tenantId,
                resourceKind: 'CHAT_MESSAGE',
                resourceId: row.messageId,
                resourceStoreId: messageStoreId,
                resourceStoreTenantId: row.message.store?.tenantId,
                tier: 'PRIMARY',
                referenceForm: 'NORMALIZED_RELATION',
                parentShapeValid:
                  !storeConflict &&
                  row.message.channel.tenantId === row.message.tenantId,
              }),
            ],
            reasonCounts: storeConflict
              ? { CHAT_MESSAGE_STORE_CONFLICT: 1 }
              : {},
          };
        },
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'chat_message_body',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffChatMessage.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              body: true,
              store: { select: { tenantId: true } },
              channel: {
                select: {
                  tenantId: true,
                  scope: true,
                  storeId: true,
                },
              },
            },
          }),
        analyzeRow: (row) => {
          const storeConflict =
            row.channel.scope === 'STORE' &&
            (!row.storeId ||
              !row.channel.storeId ||
              row.storeId !== row.channel.storeId);
          const channelTenantConflict = row.channel.tenantId !== row.tenantId;

          return analyzeSecondaryRow({
            row,
            values: [row.body],
            allowedOrigins,
            resourceKind: 'CHAT_MESSAGE',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
            parentShapeValid: !storeConflict && !channelTenantConflict,
            reasonCounts: {
              ...(storeConflict ? { CHAT_MESSAGE_STORE_CONFLICT: 1 } : {}),
              ...(channelTenantConflict
                ? { CHAT_MESSAGE_CHANNEL_TENANT_CONFLICT: 1 }
                : {}),
            },
          });
        },
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'task_comment_evidence_url',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffTaskComment.findMany({
            where: {
              ...keysetWhere(cursor, snapshotAt),
              evidenceUrl: { not: null },
            },
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              taskId: true,
              evidenceUrl: true,
              task: {
                select: {
                  tenantId: true,
                  storeId: true,
                  store: { select: { tenantId: true } },
                },
              },
            },
          }),
        analyzeRow: (row) => {
          const parsed = parseExactAttachmentReference(
            row.evidenceUrl,
            allowedOrigins,
          );
          if (!parsed.match) {
            return {
              occurrences: [],
              reasonCounts: {
                [parsed.reasonCode ?? 'PRIMARY_VALUE_NOT_ATTACHMENT_REFERENCE']:
                  1,
              },
            };
          }

          return {
            occurrences: [
              buildOccurrenceFromMatch(parsed.match, {
                sourceTenantId: row.tenantId,
                parentTenantId: row.task.tenantId,
                resourceKind: 'STAFF_TASK',
                resourceId: row.taskId,
                resourceStoreId: row.task.storeId,
                resourceStoreTenantId: row.task.store?.tenantId,
                tier: 'PRIMARY',
              }),
            ],
            reasonCounts: {},
          };
        },
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'staff_task_fields',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffTask.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              description: true,
              checklist: true,
              store: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.description, row.checklist],
            allowedOrigins,
            resourceKind: 'STAFF_TASK',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'checklist_run_answers',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffChecklistRun.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              answers: true,
              store: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.answers],
            allowedOrigins,
            resourceKind: 'CHECKLIST_RUN',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'knowledge_article_current',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffKnowledgeArticle.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              content: true,
              materials: true,
              relatedLinks: true,
              store: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.content, row.materials, row.relatedLinks],
            allowedOrigins,
            resourceKind: 'KNOWLEDGE_ARTICLE',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'knowledge_article_version',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffKnowledgeArticleVersion.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              articleId: true,
              content: true,
              materials: true,
              relatedLinks: true,
              article: {
                select: {
                  tenantId: true,
                  storeId: true,
                  store: { select: { tenantId: true } },
                },
              },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.content, row.materials, row.relatedLinks],
            allowedOrigins,
            resourceKind: 'KNOWLEDGE_ARTICLE',
            resourceId: row.articleId,
            parentTenantId: row.article.tenantId,
            resourceStoreId: row.article.storeId,
            resourceStoreTenantId: row.article.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'shift_regulation_current',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffShiftRegulation.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              attachments: true,
              store: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.attachments],
            allowedOrigins,
            resourceKind: 'SHIFT_REGULATION',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'shift_regulation_version',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffShiftRegulationVersion.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              regulationId: true,
              storeId: true,
              attachments: true,
              store: { select: { tenantId: true } },
              regulation: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.attachments],
            allowedOrigins,
            resourceKind: 'SHIFT_REGULATION',
            resourceId: row.regulationId,
            parentTenantId: row.regulation.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'training_course_steps',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffTrainingCourse.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              steps: true,
              store: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.steps],
            allowedOrigins,
            resourceKind: 'TRAINING_COURSE',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });

      await scanKeysetSource({
        prisma: tx,
        report,
        sourceName: 'onboarding_plan_steps',
        batchSize,
        snapshotAt,
        candidateRecords,
        fetchPage: (cursor) =>
          tx.staffOnboardingPlan.findMany({
            where: keysetWhere(cursor, snapshotAt),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              steps: true,
              store: { select: { tenantId: true } },
            },
          }),
        analyzeRow: (row) =>
          analyzeSecondaryRow({
            row,
            values: [row.steps],
            allowedOrigins,
            resourceKind: 'ONBOARDING_PLAN',
            resourceId: row.id,
            parentTenantId: row.tenantId,
            resourceStoreId: row.storeId,
            resourceStoreTenantId: row.store?.tenantId,
          }),
      });
    },
    {
      isolationLevel: 'RepeatableRead',
      maxWait: 5_000,
      timeout: transactionTimeoutMs,
    },
  );

  let foundCandidateCount = 0;
  let missingCandidateCount = 0;
  for (const candidate of candidateRecords.values()) {
    if (candidate.found) {
      foundCandidateCount += 1;
    } else {
      missingCandidateCount += 1;
    }

    if (candidate.primaryParents.size === 1) {
      increment(
        report.classificationReasonCounts,
        'PRIMARY_UNIQUE_PARENT_ATTACHMENT',
      );
    } else if (candidate.primaryParents.size > 1) {
      increment(
        report.classificationReasonCounts,
        'PRIMARY_MULTIPLE_PARENTS_REVIEW',
      );
    } else if (candidate.secondaryParents.size > 0) {
      increment(
        report.classificationReasonCounts,
        'SECONDARY_ONLY_ATTACHMENT_REVIEW',
      );
    }

    if (
      candidate.primaryOccurrences > candidate.primaryParents.size &&
      candidate.primaryParents.size > 0
    ) {
      increment(
        report.classificationReasonCounts,
        'PRIMARY_DUPLICATE_COPY_SAME_PARENT',
      );
    }

    if (
      candidate.primaryParents.size > 0 &&
      candidate.secondaryParents.size > 0
    ) {
      increment(
        report.classificationReasonCounts,
        'PRIMARY_WITH_SECONDARY_COPIES',
      );
    }

    if (candidate.invalidOccurrences > 0) {
      increment(
        report.classificationReasonCounts,
        'CANDIDATE_WITH_INVALID_OCCURRENCE',
      );
    }
  }

  const sourceReports = Object.values(report.sources);
  report.totals = {
    sourceRowsScanned: sourceReports.reduce(
      (sum, source) => sum + source.rowsScanned,
      0,
    ),
    rowsWithReferenceSignals: sourceReports.reduce(
      (sum, source) => sum + source.rowsWithReferenceSignals,
      0,
    ),
    exactReferenceOccurrences: sourceReports.reduce(
      (sum, source) => sum + source.exactReferences,
      0,
    ),
    validReferenceOccurrences: sourceReports.reduce(
      (sum, source) => sum + source.validReferences,
      0,
    ),
    primaryAutoBindCandidateOccurrences: sourceReports.reduce(
      (sum, source) => sum + source.autoBindCandidateReferences,
      0,
    ),
    secondaryReviewOnlyOccurrences: sourceReports.reduce(
      (sum, source) => sum + source.reviewOnlyReferences,
      0,
    ),
    uniqueRecognizedAttachmentCandidates: candidateRecords.size,
    uniqueExistingAttachmentCandidates: foundCandidateCount,
    uniqueMissingAttachmentCandidates: missingCandidateCount,
    existingAttachmentsWithoutRecognizedReference: Math.max(
      report.attachmentInventory.rowsScanned - foundCandidateCount,
      0,
    ),
  };
  report.durationMs = Math.round(performance.now() - startedMonotonic);

  process.stdout.write(`${JSON.stringify(report, null, pretty ? 2 : 0)}\n`);
}

export async function main() {
  let prisma;

  try {
    const argumentsResult = parseArguments(process.argv.slice(2));
    if (argumentsResult.help) {
      process.stdout.write(`${HELP}\n`);
    } else if (argumentsResult.selfTest) {
      runSelfTests();
    } else if (argumentsResult.printDatabaseFingerprint) {
      process.stdout.write(
        `${JSON.stringify({
          schemaVersion: REPORT_SCHEMA_VERSION,
          script: SCRIPT_NAME,
          status: 'completed',
          mode: 'DATABASE_TARGET_FINGERPRINT',
          databaseTargetFingerprint: databaseTargetFingerprint(
            process.env.DATABASE_URL,
          ),
          credentialsEmitted: false,
        })}\n`,
      );
    } else {
      const target = parseTargetEnvironment();
      const allowedOrigins = parseAllowedOrigins();
      const batchSize = parseBoundedInteger(
        argumentsResult.batchSize ??
          process.env.STAFF_ATTACHMENT_BACKFILL_BATCH_SIZE,
        {
          code: 'BATCH_SIZE_INVALID',
          label: 'The backfill batch size',
          minimum: 1,
          maximum: MAX_BATCH_SIZE,
          fallback: DEFAULT_BATCH_SIZE,
        },
      );
      const statementTimeoutMs = parseBoundedInteger(
        process.env.STAFF_ATTACHMENT_BACKFILL_STATEMENT_TIMEOUT_MS,
        {
          code: 'STATEMENT_TIMEOUT_INVALID',
          label: 'The statement timeout',
          minimum: MIN_STATEMENT_TIMEOUT_MS,
          maximum: MAX_STATEMENT_TIMEOUT_MS,
          fallback: DEFAULT_STATEMENT_TIMEOUT_MS,
        },
      );
      const transactionTimeoutMs = parseBoundedInteger(
        process.env.STAFF_ATTACHMENT_BACKFILL_TRANSACTION_TIMEOUT_MS,
        {
          code: 'TRANSACTION_TIMEOUT_INVALID',
          label: 'The snapshot transaction timeout',
          minimum: MIN_TRANSACTION_TIMEOUT_MS,
          maximum: MAX_TRANSACTION_TIMEOUT_MS,
          fallback: DEFAULT_TRANSACTION_TIMEOUT_MS,
        },
      );
      const targetFingerprint = databaseTargetFingerprint(
        process.env.DATABASE_URL,
      );
      const operationalBinding = parseOperationalBinding({
        productionRequested: target.productionAttested,
        targetFingerprint,
      });
      const readOnlyUrl = buildReadOnlyDatabaseUrl(statementTimeoutMs);

      prisma = new PrismaClient({
        datasources: { db: { url: readOnlyUrl } },
        log: [],
      });
      await runInventory({
        prisma,
        batchSize,
        allowedOrigins,
        databaseTargetFingerprint:
          operationalBinding.databaseTargetFingerprint,
        releaseSha: operationalBinding.releaseSha,
        target: target.target,
        productionAttested: target.productionAttested,
        statementTimeoutMs,
        transactionTimeoutMs,
        pretty: argumentsResult.pretty,
      });
    }
  } catch (error) {
    const safeContractError =
      error?.safeContractError === true &&
      typeof error?.code === 'string' &&
      /^[A-Z][A-Z0-9_]{2,80}$/.test(error.code);
    const code = safeContractError
      ? error.code
      : 'ATTACHMENT_INVENTORY_FAILED';
    const safeMessage = safeContractError
      ? error.message
      : 'The read-only attachment inventory failed. Inspect protected operator logs; no row data was emitted.';

    process.stderr.write(
      `${JSON.stringify({
        schemaVersion: REPORT_SCHEMA_VERSION,
        script: SCRIPT_NAME,
        status: 'failed',
        error: { code, message: safeMessage },
      })}\n`,
    );
    process.exitCode = 1;
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        if (!process.exitCode) {
          process.stderr.write(
            `${JSON.stringify({
              schemaVersion: REPORT_SCHEMA_VERSION,
              script: SCRIPT_NAME,
              status: 'failed',
              error: {
                code: 'DATABASE_DISCONNECT_FAILED',
                message:
                  'The read-only database session could not be closed cleanly; no connection details were emitted.',
              },
            })}\n`,
          );
          process.exitCode = 1;
        }
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}

import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import {
  SHARED_BETA_ADMISSION_COLUMNS,
  SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS,
  SHARED_BETA_ADMISSION_DORMANT_RELATIONS,
  SHARED_BETA_ADMISSION_DORMANT_TYPES,
  SHARED_BETA_ADMISSION_FUNCTIONS,
  SHARED_BETA_ADMISSION_RELATIONS,
} from "./shared-beta-admission-provenance-catalog.mjs";
import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
} from "./staff-task-integrity-migration-state.mjs";
import { EXCLUDED_RUNTIME_RELEASE_FUNCTIONS } from "./runtime-function-enrollment.mjs";

const SCRIPT_NAME = "identity-legacy-backfill-inventory-smoke";
const SMOKE_CONFIRMATION = "run-identity-legacy-inventory-smoke";
const INVENTORY_CONFIRMATION = "run-identity-legacy-inventory";
const FAILURE_STAGES = new Set([
  "PRECONDITIONS",
  "INVENTORY_MODULE",
  "RELEASE_ARTIFACT",
  "CLUSTER_ADMISSION",
  "CLONE_PROVISIONING",
  "RESET_GUARD",
  "HEALTHY_SCENARIO",
  "HEALTHY_SUMMARY",
  "HEALTHY_SUMMARY_ADMISSION",
  "HEALTHY_SUMMARY_DECISION",
  "HEALTHY_SUMMARY_EVIDENCE",
  "HEALTHY_SUMMARY_RELEASE",
  "HEALTHY_SUMMARY_BLOCKING",
  "HEALTHY_SUMMARY_PROPOSAL",
  "HEALTHY_SUMMARY_REVIEW",
  "HEALTHY_METRICS",
  "HEALTHY_FINDINGS",
  "HEALTHY_EXIT_CODE",
  "HEALTHY_AUTHORITY_DRIFT",
  "SCENARIO_RESET",
  "SCENARIO_SEED",
  "SCENARIO_READER_GRANT",
  "SCENARIO_READER_ADMISSION",
  "SCENARIO_INVENTORY",
  "SCENARIO_REDACTION",
  "REVIEW_SCENARIO",
  "BLOCKED_SCENARIO",
  "CLEANUP",
]);
const FAILURE_STAGE_BY_ERROR = new WeakMap();
const FAILURE_DETAIL_BY_ERROR = new WeakMap();
const INVENTORY_MODULE_URL = new URL(
  "./identity-legacy-backfill-inventory.mjs",
  import.meta.url,
);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SOURCE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,59}_ci$/u;
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/u;
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ADMIN_CONNECT_TIMEOUT_SECONDS = 10;
const ADMIN_LOCK_TIMEOUT_MS = 5_000;
const ADMIN_STATEMENT_TIMEOUT_MS = 120_000;
const DISPOSABLE_RESET_TRUNCATE_GUARDS = Object.freeze([
  Object.freeze({
    relationName: "IdentityMailDeliveryEvent",
    triggerName: "IdentityMailDeliveryEvent_truncate_guard_trigger",
  }),
  Object.freeze({
    relationName: "IdentityMailDeliveryTenantEnrollment",
    triggerName: "IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger",
  }),
]);
const CURRENT_174_NON_IDENTITY_RUNTIME_RELEASE_FUNCTIONS = Object.freeze([
  ...EXCLUDED_RUNTIME_RELEASE_FUNCTIONS,
]);
assert.equal(CURRENT_174_NON_IDENTITY_RUNTIME_RELEASE_FUNCTIONS.length, 20);
const READER_COLUMN_GRANTS = Object.freeze({
  IdentityEmailClaim: Object.freeze([
    "emailCanonical",
    "claimType",
    "tenantId",
    "subjectId",
    "revision",
  ]),
  User: Object.freeze([
    "id",
    "tenantId",
    "email",
    "identityClaimRevision",
    "isPlatformAdmin",
    "emailVerifiedAt",
  ]),
  UserInvite: Object.freeze([
    "id",
    "tenantId",
    "email",
    "acceptedAt",
    "acceptedByUserId",
    "revokedAt",
    "expiresAt",
    "identityClaimRevision",
  ]),
  _prisma_migrations: Object.freeze([
    "migration_name",
    "checksum",
    "finished_at",
    "rolled_back_at",
  ]),
});
const IDENTITY_FUNCTION_SIGNATURES = Object.freeze([
  'public."identity_email_claim_lock_v1"(text)',
  'public."identity_email_claim_revision_guard_v1"()',
  'public."identity_email_claim_reserve_invite_v1"(text,text,text)',
  'public."identity_email_claim_reserve_invite_v2"(text,text,text)',
  'public."identity_email_claim_assert_invite_v1"(text,text,text,integer)',
  'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)',
  'public."identity_email_claim_transition_v1"(text,text,text,text,integer,text,text)',
  'public."identity_email_claim_transition_v2"(text,text,text,text,integer,text,text)',
  'public."identity_email_claim_release_v1"(text,text,text,text,integer)',
  'public."identity_email_claim_release_v2"(text,text,text,text,integer)',
  'public."identity_mail_delivery_event_guard_v1"()',
  'public."identity_mail_delivery_event_truncate_guard_v1"()',
  'public."identity_mail_delivery_event_append_v1"()',
  'public."identity_mail_delivery_worker_assert_v1"(text)',
  'public."identity_mail_outbox_delivery_guard_v1"()',
  'public."identity_owner_invite_issue_command_immutable_v1"()',
  'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
  ...SHARED_BETA_ADMISSION_FUNCTIONS.map((entry) => entry.catalogSignature),
  ...CURRENT_174_NON_IDENTITY_RUNTIME_RELEASE_FUNCTIONS.map(
    (entry) => entry.catalogSignature,
  ),
]);

const HELP = `
${SCRIPT_NAME}

Destructive PostgreSQL fixture smoke for the read-only legacy identity
inventory. It creates three disposable clones and three least-privilege
reader roles, exercises a healthy zero-finding topology, proposal/review, and
adversarial datasets, and then removes every generated database and role.

Usage:
  node scripts/identity-legacy-backfill-inventory-smoke.mjs [options]

Options:
  --help       Show this help without reading environment variables or the DB.
  --self-test  Run offline safety checks without reading the DB.

Required environment:
  DATABASE_URL
    PostgreSQL URL targeting a loopback database whose name ends in _ci and
    whose only query parameter is schema=public.
  RELEASE_SHA
    Exact 40-character lowercase hexadecimal release commit.
  IDENTITY_LEGACY_INVENTORY_SMOKE_CONFIRM
    Must equal: ${SMOKE_CONFIRMATION}

Safety:
  NODE_ENV=production, remote PostgreSQL, non-*_ci databases, unsupported URL
  parameters, and missing confirmation are rejected. The source database is
  used only as a PostgreSQL template. Fixture DML is restricted to generated
  disposable clones. Cleanup always attempts DROP DATABASE ... WITH (FORCE)
  and DROP ROLE in a finally block.
`.trim();

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  error.safeContractError = true;
  throw error;
}

function withFailureStage(error, stage) {
  if (
    !FAILURE_STAGES.has(stage) ||
    error === null ||
    (typeof error !== "object" && typeof error !== "function")
  ) {
    return error;
  }
  FAILURE_STAGE_BY_ERROR.set(error, stage);
  return error;
}

function errorFailureStage(error) {
  const stage =
    error !== null && (typeof error === "object" || typeof error === "function")
      ? FAILURE_STAGE_BY_ERROR.get(error)
      : undefined;
  return FAILURE_STAGES.has(stage) ? stage : "PRECONDITIONS";
}

function withFailureDetail(error, detail) {
  if (
    error !== null &&
    (typeof error === "object" || typeof error === "function") &&
    Array.isArray(detail) &&
    detail.every((entry) => isSafeFailureDetail(entry))
  ) {
    FAILURE_DETAIL_BY_ERROR.set(error, [...new Set(detail)].sort());
  }
  return error;
}

function isSafeFailureDetail(entry) {
  if (typeof entry !== "string" || entry.length > 4096) {
    return false;
  }
  if (
    (entry.startsWith("SUMMARY_DEBUG:") ||
      entry.startsWith("CATALOG_FUNCTION_DEBUG:")) &&
    !/[\u0000-\u001F\u007F]/u.test(entry)
  ) {
    return true;
  }
  return /^[A-Z0-9_]{1,96}$/u.test(entry);
}

function errorFailureDetail(error) {
  return error !== null &&
    (typeof error === "object" || typeof error === "function")
    ? (FAILURE_DETAIL_BY_ERROR.get(error) ?? [])
    : [];
}

function withFallbackFailureStage(error, fallbackStage) {
  return errorFailureStage(error) === "PRECONDITIONS"
    ? withFailureStage(error, fallbackStage)
    : error;
}

function parseArguments(argv) {
  if (argv.includes("--help")) {
    return { help: true, selfTest: false };
  }
  const supported = new Set(["--self-test"]);
  for (const argument of argv) {
    if (!supported.has(argument)) {
      contractError("CLI_ARGUMENT_UNSUPPORTED");
    }
  }
  return { help: false, selfTest: argv.includes("--self-test") };
}

function quoteIdentifier(value) {
  if (!SQL_IDENTIFIER.test(String(value))) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseSourceDatabaseUrl(rawValue) {
  let parsed;
  try {
    parsed = new URL(String(rawValue ?? ""));
  } catch {
    contractError("DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, ""))
  ) {
    contractError("LOOPBACK_POSTGRES_REQUIRED");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/u, ""));
  if (
    !SOURCE_DATABASE_PATTERN.test(databaseName) ||
    databaseName === "postgres"
  ) {
    contractError("CI_SOURCE_DATABASE_REQUIRED");
  }
  if (!parsed.username || parsed.hash) {
    contractError("DATABASE_URL_INVALID");
  }
  const parameterNames = [...parsed.searchParams.keys()];
  if (
    parameterNames.length !== 1 ||
    parameterNames[0] !== "schema" ||
    parsed.searchParams.get("schema") !== "public"
  ) {
    contractError("DATABASE_URL_PARAMETERS_INVALID");
  }
  return { databaseName, parsed };
}

function databaseUrlFor(sourceUrl, databaseName, credentials = null) {
  if (!SAFE_IDENTIFIER.test(databaseName)) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  target.hash = "";
  target.search = "";
  target.searchParams.set("schema", "public");
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set(
    "connect_timeout",
    String(ADMIN_CONNECT_TIMEOUT_SECONDS),
  );
  target.searchParams.set(
    "application_name",
    "leetplus_identity_inventory_smoke",
  );
  target.searchParams.set(
    "options",
    [
      `-c lock_timeout=${ADMIN_LOCK_TIMEOUT_MS}`,
      `-c statement_timeout=${ADMIN_STATEMENT_TIMEOUT_MS}`,
    ].join(" "),
  );
  if (credentials) {
    target.username = credentials.username;
    target.password = credentials.password;
  }
  return target.toString();
}

function cloneDescriptor(suffix, scenario) {
  const databaseName = `lp_idinv_${scenario}_${suffix}_ci`;
  const roleName = `lp_idinv_${scenario}_${suffix}_reader`;
  assert.match(databaseName, SOURCE_DATABASE_PATTERN);
  assert.match(roleName, SAFE_IDENTIFIER);
  return {
    databaseName,
    roleName,
    password: randomBytes(32).toString("hex"),
    scenario,
  };
}

function inventoryEnvironment(environment, databaseUrl, databaseName, hmacKey) {
  return {
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
    RELEASE_SHA: environment.RELEASE_SHA,
    IDENTITY_LEGACY_INVENTORY_TARGET: "development",
    IDENTITY_LEGACY_INVENTORY_CONFIRM: INVENTORY_CONFIRMATION,
    IDENTITY_LEGACY_INVENTORY_EXPECTED_DATABASE: databaseName,
    IDENTITY_LEGACY_INVENTORY_HMAC_KEY: hmacKey,
    IDENTITY_LEGACY_INVENTORY_HMAC_KEY_VERSION: "v1",
  };
}

async function loadInventoryModule() {
  const inventory = await import(INVENTORY_MODULE_URL.href);
  for (const exportName of [
    "FINDING_MANIFEST",
    "REQUIRED_COLUMN_SELECTS",
    "exitCodeForReport",
    "inspectDatabase",
    "loadExpectedMigrationArtifact",
    "parseRuntimeContract",
  ]) {
    if (!(exportName in inventory)) {
      contractError("INVENTORY_EXPORT_CONTRACT_MISMATCH");
    }
  }
  if (
    typeof inventory.parseRuntimeContract !== "function" ||
    typeof inventory.inspectDatabase !== "function" ||
    typeof inventory.loadExpectedMigrationArtifact !== "function" ||
    typeof inventory.exitCodeForReport !== "function"
  ) {
    contractError("INVENTORY_EXPORT_CONTRACT_MISMATCH");
  }
  assert.deepEqual(inventory.REQUIRED_COLUMN_SELECTS, READER_COLUMN_GRANTS);
  return inventory;
}

function findingManifestCodes(manifest) {
  const values = Array.isArray(manifest)
    ? manifest
    : manifest && typeof manifest === "object"
      ? Object.entries(manifest).map(([code, value]) => ({ code, ...value }))
      : [];
  const codes = new Set(
    values
      .map((value) =>
        typeof value === "string"
          ? value
          : value && typeof value.code === "string"
            ? value.code
            : null,
      )
      .filter(Boolean),
  );
  if (codes.size === 0) {
    contractError("INVENTORY_FINDING_MANIFEST_INVALID");
  }
  return codes;
}

function assertManifestIncludes(codes, requiredCodes) {
  for (const code of requiredCodes) {
    assert.equal(codes.has(code), true, `Finding manifest is missing ${code}.`);
  }
}

function findingOccurrences(report, code) {
  const finding = Array.isArray(report?.findings)
    ? report.findings.find((candidate) => candidate?.code === code)
    : null;
  if (!finding) {
    return 0;
  }
  for (const key of ["occurrences", "count", "total"]) {
    if (Number.isSafeInteger(finding[key]) && finding[key] >= 0) {
      return finding[key];
    }
  }
  return 0;
}

function appendCountMismatchDetail(details, code, actual, expected) {
  if (
    !Number.isSafeInteger(actual) ||
    !Number.isSafeInteger(expected) ||
    actual !== expected
  ) {
    details.push(code);
  }
}

function appendZeroCountDetail(details, code, value) {
  if (!Number.isSafeInteger(value) || value !== 0) {
    details.push(code);
  }
}

function catalogAdmissionDetails(report) {
  const catalog = report?.database?.catalog;
  if (!catalog || catalog.ready === true) {
    return [];
  }
  const details = ["CATALOG_STATE_MISMATCH"];
  appendCountMismatchDetail(
    details,
    "CATALOG_RELATION_COUNT_MISMATCH",
    catalog.matchedRelationCount,
    catalog.expectedRelationCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_RELATION_OWNER_MISMATCH",
    catalog.dormantRelationOwnerMismatchCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_RELATION_ACL_MISMATCH",
    catalog.dormantRelationNonownerAclCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_COLUMN_ACL_MISMATCH",
    catalog.dormantColumnNonownerAclCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_FUNCTION_OWNER_MISMATCH",
    catalog.dormantFunctionOwnerMismatchCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_FUNCTION_ACL_MISMATCH",
    catalog.dormantFunctionNonownerAclCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_TYPE_OWNER_MISMATCH",
    catalog.dormantTypeOwnerMismatchCount,
  );
  appendZeroCountDetail(
    details,
    "CATALOG_DORMANT_TYPE_ACL_MISMATCH",
    catalog.dormantTypeNonownerAclCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_COLUMN_COUNT_MISMATCH",
    catalog.matchedColumnCount,
    catalog.expectedColumnCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_EXACT_IDENTITY_COLUMN_COUNT_MISMATCH",
    catalog.actualExactIdentityColumnCount,
    catalog.expectedExactIdentityColumnCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_CONSTRAINT_COUNT_MISMATCH",
    catalog.actualConstraintCount,
    catalog.expectedConstraintCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_CONSTRAINT_MATCH_COUNT_MISMATCH",
    catalog.matchedConstraintCount,
    catalog.expectedConstraintCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_INDEX_COUNT_MISMATCH",
    catalog.actualIndexCount,
    catalog.expectedIndexCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_INDEX_MATCH_COUNT_MISMATCH",
    catalog.matchedIndexCount,
    catalog.expectedIndexCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_FUNCTION_COUNT_MISMATCH",
    catalog.actualFunctionCount,
    catalog.expectedFunctionCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_FUNCTION_MATCH_COUNT_MISMATCH",
    catalog.matchedFunctionCount,
    catalog.expectedFunctionCount,
  );
  if (
    Array.isArray(catalog.unmatchedFunctionCatalog) &&
    catalog.unmatchedFunctionCatalog.length > 0
  ) {
    details.push(
      `CATALOG_FUNCTION_DEBUG:${JSON.stringify(
        catalog.unmatchedFunctionCatalog,
      )}`,
    );
  }
  appendCountMismatchDetail(
    details,
    "CATALOG_ENUM_LABEL_COUNT_MISMATCH",
    catalog.matchedEnumLabelCount,
    catalog.totalEnumLabelCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_TRIGGER_COUNT_MISMATCH",
    catalog.actualIdentityTriggerCount,
    catalog.expectedTriggerCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_TRIGGER_MATCH_COUNT_MISMATCH",
    catalog.matchedTriggerCount,
    catalog.expectedTriggerCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_RI_TRIGGER_COUNT_MISMATCH",
    catalog.actualRiTriggerCount,
    catalog.expectedRiTriggerCount,
  );
  appendCountMismatchDetail(
    details,
    "CATALOG_RI_TRIGGER_MATCH_COUNT_MISMATCH",
    catalog.matchedRiTriggerCount,
    catalog.expectedRiTriggerCount,
  );
  return details;
}

function assertSummary(
  report,
  expected,
  setFailureStage = () => {},
  extraDetails = [],
) {
  setFailureStage("HEALTHY_SUMMARY_ADMISSION");
  if (report?.summary?.inventoryExecuted !== true) {
    const detail = [
      ...(report?.summary?.admissionRejectionCodes ?? []),
      ...(report?.summary?.schemaRejectionCodes ?? []),
      ...catalogAdmissionDetails(report),
      ...extraDetails,
    ].map((entry) => String(entry));
    if (detail.length === 0) {
      detail.push(
        `SUMMARY_DEBUG:${JSON.stringify({
          blockingTotal: report?.summary?.blockingTotal,
          catalogReady: report?.database?.catalog?.ready,
          decision: report?.summary?.decision,
          inventoryExecuted: report?.summary?.inventoryExecuted,
          privilegeReady: report?.database?.privileges?.ready,
          proposalTotal: report?.summary?.proposalTotal,
          reviewTotal: report?.summary?.reviewTotal,
        })}`,
      );
    }
    throw withFailureDetail(new Error("Inventory admission failed."), detail);
  }
  assert.equal(
    report?.summary?.inventoryExecuted,
    true,
    `Inventory admission failed: ${JSON.stringify({
      admissionRejectionCodes: report?.summary?.admissionRejectionCodes,
      catalog: report?.database?.catalog,
      decision: report?.summary?.decision,
      privileges: report?.database?.privileges,
      schemaRejectionCodes: report?.summary?.schemaRejectionCodes,
    })}`,
  );
  setFailureStage("HEALTHY_SUMMARY_DECISION");
  assert.equal(report?.summary?.decision, expected.decision);
  setFailureStage("HEALTHY_SUMMARY_EVIDENCE");
  assert.equal(report?.summary?.evidenceScope, "SYNTHETIC_FIXTURE");
  setFailureStage("HEALTHY_SUMMARY_RELEASE");
  assert.equal(report?.safety?.releaseArtifactBound, false);
  setFailureStage("HEALTHY_SUMMARY_BLOCKING");
  assert.equal(report?.summary?.blockingTotal, expected.blockingTotal);
  setFailureStage("HEALTHY_SUMMARY_PROPOSAL");
  assert.equal(report?.summary?.proposalTotal, expected.proposalTotal);
  if (expected.reviewTotal !== undefined) {
    setFailureStage("HEALTHY_SUMMARY_REVIEW");
    assert.equal(report?.summary?.reviewTotal, expected.reviewTotal);
  }
}

function serializedReport(report) {
  const serialized = JSON.stringify(report);
  assert.ok(serialized, "Inventory report must be serializable.");
  return serialized;
}

function assertSensitiveValuesAbsent(report, sensitiveValues) {
  const serialized = serializedReport(report);
  const folded = serialized.toLowerCase();
  for (const rawValue of sensitiveValues) {
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue;
    }
    const value = String(rawValue);
    assert.equal(
      serialized.includes(value),
      false,
      "Inventory report exposed a fixture secret or identifier.",
    );
    assert.equal(
      folded.includes(value.toLowerCase()),
      false,
      "Inventory report exposed a case-folded fixture value.",
    );
  }
}

function collectSensitive(state, ...values) {
  for (const value of values.flat(Infinity)) {
    if (value !== null && value !== undefined && value !== "") {
      state.sensitive.add(String(value));
    }
  }
}

async function createTenant(prisma, state, label) {
  const id = randomUUID();
  await prisma.tenant.create({
    data: {
      id,
      name: `Identity inventory fixture ${label}`,
      slug: `idinv-${label}-${state.suffix}`,
      status: "SUSPENDED",
      customerStage: "INTERNAL",
      onboardingStatus: "PROVISIONING",
    },
  });
  collectSensitive(state, id);
  return id;
}

async function createUser(
  prisma,
  state,
  {
    tenantId,
    email,
    id = randomUUID(),
    identityClaimRevision = null,
    isActive = true,
    isPlatformAdmin = false,
    emailVerifiedAt = new Date(),
    passwordHash = `fixture-password-${randomBytes(12).toString("hex")}`,
  },
) {
  await prisma.user.create({
    data: {
      id,
      tenantId,
      email,
      passwordHash,
      role: "OWNER",
      accessScope: "NETWORK",
      isActive,
      isPlatformAdmin,
      emailVerifiedAt,
      identityClaimRevision,
    },
  });
  collectSensitive(
    state,
    id,
    tenantId,
    email,
    email.trim().toLowerCase(),
    passwordHash,
  );
  return { email, id, passwordHash, tenantId };
}

async function createInvite(
  prisma,
  state,
  {
    tenantId,
    email,
    id = randomUUID(),
    acceptedAt = null,
    acceptedByUserId = null,
    revokedAt = null,
    expiresAt,
    identityClaimRevision = null,
    tokenHash = `fixture-token-${randomBytes(12).toString("hex")}`,
  },
) {
  await prisma.userInvite.create({
    data: {
      id,
      tenantId,
      email,
      role: "MANAGER",
      accessScope: "NETWORK",
      storeIds: [],
      tokenHash,
      expiresAt,
      acceptedAt,
      acceptedByUserId,
      revokedAt,
      identityClaimRevision,
    },
  });
  collectSensitive(
    state,
    id,
    tenantId,
    email,
    typeof email === "string" ? email.trim().toLowerCase() : null,
    acceptedByUserId,
    tokenHash,
  );
  return { email, id, tenantId, tokenHash };
}

async function createClaim(
  prisma,
  state,
  {
    emailCanonical,
    claimType,
    tenantId,
    subjectId,
    workflowLocator = subjectId,
    revision = 1,
  },
) {
  await prisma.identityEmailClaim.create({
    data: {
      emailCanonical,
      claimType,
      tenantId,
      subjectId,
      workflowLocator,
      revision,
    },
  });
  collectSensitive(state, emailCanonical, tenantId, subjectId);
}

async function createLegacyClaimBypassingRevisionGuard(prisma, state, claim) {
  const trigger = '"IdentityEmailClaim_revision_guard_trigger"';
  await prisma.$executeRawUnsafe(
    `ALTER TABLE public."IdentityEmailClaim" DISABLE TRIGGER ${trigger}`,
  );
  try {
    await createClaim(prisma, state, claim);
  } finally {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE public."IdentityEmailClaim" ENABLE TRIGGER ${trigger}`,
    );
  }
}

async function transitionClaim(
  prisma,
  state,
  { emailCanonical, claimType, subjectId, revision },
) {
  await prisma.identityEmailClaim.update({
    where: { emailCanonical },
    data: { claimType, subjectId, revision },
  });
  collectSensitive(state, emailCanonical, subjectId);
}

async function seedHealthyScenario(prisma, state) {
  const tenantId = await createTenant(prisma, state, "healthy");
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const liveInvite = await createInvite(prisma, state, {
    tenantId,
    email: `healthy-live.${state.suffix}@example.test`,
    expiresAt: future,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: liveInvite.email,
    claimType: "INVITE",
    tenantId,
    subjectId: liveInvite.id,
  });

  const acceptedEmail = `healthy-accepted.${state.suffix}@example.test`;
  const acceptedUser = await createUser(prisma, state, {
    tenantId,
    email: acceptedEmail,
    identityClaimRevision: 2,
  });
  const acceptedInvite = await createInvite(prisma, state, {
    tenantId,
    email: acceptedEmail,
    acceptedAt: past,
    acceptedByUserId: acceptedUser.id,
    expiresAt: future,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: acceptedEmail,
    claimType: "INVITE",
    tenantId,
    subjectId: acceptedInvite.id,
  });
  await transitionClaim(prisma, state, {
    emailCanonical: acceptedEmail,
    claimType: "USER",
    subjectId: acceptedUser.id,
    revision: 2,
  });

  await createInvite(prisma, state, {
    tenantId,
    email: `healthy-revoked.${state.suffix}@example.test`,
    revokedAt: past,
    expiresAt: past,
    identityClaimRevision: 1,
  });

  const expiredInvite = await createInvite(prisma, state, {
    tenantId,
    email: `healthy-expired.${state.suffix}@example.test`,
    expiresAt: past,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: expiredInvite.email,
    claimType: "INVITE",
    tenantId,
    subjectId: expiredInvite.id,
  });

  return {
    expected: {
      blockingTotal: 0,
      decision: "PASS",
      proposalTotal: 0,
      reviewTotal: 0,
    },
    expectedMetrics: {
      ACCEPTED_INVITE_TOTAL: 1,
      EXPIRED_INVITE_TOTAL: 1,
      IDENTITY_CLAIM_TOTAL: 3,
      INVALID_INVITE_STATE_TOTAL: 0,
      LIVE_INVITE_TOTAL: 1,
      REVOKED_INVITE_TOTAL: 1,
      USER_TOTAL: 1,
    },
  };
}

async function seedProposalReviewScenario(prisma, state) {
  const tenantId = await createTenant(prisma, state, "proposal");
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  await createUser(prisma, state, {
    tenantId,
    email: `inactive.${state.suffix}@example.test`,
    isActive: false,
    isPlatformAdmin: false,
    emailVerifiedAt: new Date(),
  });
  await createInvite(prisma, state, {
    tenantId,
    email: `live.${state.suffix}@example.test`,
    expiresAt: future,
  });

  const acceptedUser = await createUser(prisma, state, {
    tenantId,
    email: `accepted.${state.suffix}@example.test`,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: acceptedUser.email,
    claimType: "USER",
    tenantId,
    subjectId: acceptedUser.id,
  });
  await createInvite(prisma, state, {
    tenantId,
    email: acceptedUser.email,
    acceptedAt: past,
    acceptedByUserId: acceptedUser.id,
    expiresAt: future,
  });
  await createInvite(prisma, state, {
    tenantId,
    email: `revoked.${state.suffix}@example.test`,
    revokedAt: past,
    expiresAt: past,
  });
  await createInvite(prisma, state, {
    tenantId,
    email: `expired.${state.suffix}@example.test`,
    expiresAt: past,
  });

  return {
    expected: {
      blockingTotal: 0,
      decision: "REVIEW",
      proposalTotal: 2,
      reviewTotal: 4,
    },
    requiredCodes: [
      "ACCEPTED_INVITE_NULL_PROVENANCE_HISTORY",
      "EXPIRED_INVITE_NULL_PROVENANCE_HISTORY",
      "USER_CLAIM_CREATE_CANDIDATE",
      "LIVE_INVITE_CLAIM_CREATE_CANDIDATE",
      "LIVE_INVITE_LEGACY_TOKEN_REVIEW",
      "REVOKED_INVITE_NULL_PROVENANCE_HISTORY",
    ],
    requiredOccurrences: {
      ACCEPTED_INVITE_NULL_PROVENANCE_HISTORY: 1,
      EXPIRED_INVITE_NULL_PROVENANCE_HISTORY: 1,
      LIVE_INVITE_CLAIM_CREATE_CANDIDATE: 1,
      LIVE_INVITE_LEGACY_TOKEN_REVIEW: 1,
      REVOKED_INVITE_NULL_PROVENANCE_HISTORY: 1,
      USER_CLAIM_CREATE_CANDIDATE: 1,
    },
  };
}

async function seedAdversarialScenario(prisma, state) {
  const tenantA = await createTenant(prisma, state, "adversarial-a");
  const tenantB = await createTenant(prisma, state, "adversarial-b");
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const multiUserEmail = `multi-user.${state.suffix}@example.test`;
  await createUser(prisma, state, {
    tenantId: tenantA,
    email: multiUserEmail,
  });
  await createUser(prisma, state, {
    tenantId: tenantB,
    email: `  ${multiUserEmail.toUpperCase()}  `,
  });

  const userInviteEmail = `user-invite.${state.suffix}@example.test`;
  await createUser(prisma, state, {
    tenantId: tenantA,
    email: userInviteEmail,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: userInviteEmail.toUpperCase(),
    expiresAt: future,
  });

  const multiInviteEmail = `multi-invite.${state.suffix}@example.test`;
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: multiInviteEmail,
    expiresAt: future,
  });
  await createInvite(prisma, state, {
    tenantId: tenantB,
    email: multiInviteEmail.toUpperCase(),
    expiresAt: future,
  });

  await createUser(prisma, state, {
    tenantId: tenantA,
    email: `invalid user ${state.suffix}`,
  });
  await createUser(prisma, state, {
    tenantId: tenantA,
    email: `invalid-subject.${state.suffix}@example.test`,
    id: `legacy-invalid-${state.suffix}`,
  });
  const platformEmail = `platform.${state.suffix}@example.test`;
  await createUser(prisma, state, {
    tenantId: tenantA,
    email: platformEmail,
    isPlatformAdmin: true,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: platformEmail.toUpperCase(),
    expiresAt: future,
  });
  const unverifiedEmail = `unverified.${state.suffix}@example.test`;
  await createUser(prisma, state, {
    tenantId: tenantA,
    email: unverifiedEmail,
    emailVerifiedAt: null,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: unverifiedEmail.toUpperCase(),
    expiresAt: future,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: null,
    expiresAt: future,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: `invalid-live-${state.suffix}`,
    expiresAt: future,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: `invalid-live-subject.${state.suffix}@example.test`,
    id: `legacy-invite-${state.suffix}`,
    expiresAt: future,
  });

  await createUser(prisma, state, {
    tenantId: tenantA,
    email: `revision-without-claim.${state.suffix}@example.test`,
    identityClaimRevision: 1,
  });

  const boundNull = await createUser(prisma, state, {
    tenantId: tenantA,
    email: `bound-null.${state.suffix}@example.test`,
  });
  await createClaim(prisma, state, {
    emailCanonical: boundNull.email,
    claimType: "USER",
    tenantId: tenantA,
    subjectId: boundNull.id,
  });

  const wrongType = await createUser(prisma, state, {
    tenantId: tenantA,
    email: `wrong-type.${state.suffix}@example.test`,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: wrongType.email,
    claimType: "INVITE",
    tenantId: tenantA,
    subjectId: wrongType.id,
  });

  const wrongTenant = await createUser(prisma, state, {
    tenantId: tenantA,
    email: `wrong-tenant.${state.suffix}@example.test`,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: wrongTenant.email,
    claimType: "USER",
    tenantId: tenantB,
    subjectId: wrongTenant.id,
  });

  const wrongSubject = await createUser(prisma, state, {
    tenantId: tenantA,
    email: `wrong-subject.${state.suffix}@example.test`,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: wrongSubject.email,
    claimType: "USER",
    tenantId: tenantA,
    subjectId: randomUUID(),
  });

  const wrongRevision = await createUser(prisma, state, {
    tenantId: tenantA,
    email: `wrong-revision.${state.suffix}@example.test`,
    identityClaimRevision: 2,
  });
  await createClaim(prisma, state, {
    emailCanonical: wrongRevision.email,
    claimType: "USER",
    tenantId: tenantA,
    subjectId: wrongRevision.id,
  });

  const acceptedLineageEmail = `accepted-lineage.${state.suffix}@example.test`;
  const acceptedLineageUser = await createUser(prisma, state, {
    tenantId: tenantA,
    email: acceptedLineageEmail,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: acceptedLineageEmail,
    claimType: "USER",
    tenantId: tenantA,
    subjectId: acceptedLineageUser.id,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: acceptedLineageEmail,
    acceptedAt: past,
    acceptedByUserId: acceptedLineageUser.id,
    expiresAt: future,
    identityClaimRevision: 1,
  });

  const liveOwnerEmail = `live-owner.${state.suffix}@example.test`;
  const expiredClaimOwner = await createInvite(prisma, state, {
    tenantId: tenantA,
    email: liveOwnerEmail,
    expiresAt: past,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: liveOwnerEmail,
    claimType: "INVITE",
    tenantId: tenantA,
    subjectId: expiredClaimOwner.id,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: liveOwnerEmail,
    expiresAt: future,
  });

  const liveRevision = await createInvite(prisma, state, {
    tenantId: tenantA,
    email: `live-revision.${state.suffix}@example.test`,
    expiresAt: future,
    identityClaimRevision: 2,
  });
  await createClaim(prisma, state, {
    emailCanonical: liveRevision.email,
    claimType: "INVITE",
    tenantId: tenantA,
    subjectId: liveRevision.id,
  });

  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: `live-revision-without-claim.${state.suffix}@example.test`,
    expiresAt: future,
    identityClaimRevision: 1,
  });

  await createClaim(prisma, state, {
    emailCanonical: `orphan-user.${state.suffix}@example.test`,
    claimType: "USER",
    tenantId: tenantA,
    subjectId: randomUUID(),
  });
  await createClaim(prisma, state, {
    emailCanonical: `orphan-invite.${state.suffix}@example.test`,
    claimType: "INVITE",
    tenantId: tenantA,
    subjectId: randomUUID(),
  });
  await createLegacyClaimBypassingRevisionGuard(prisma, state, {
    emailCanonical: `email-change.${state.suffix}@example.test`,
    claimType: "EMAIL_CHANGE",
    tenantId: tenantA,
    subjectId: `legacy-claim-${state.suffix}`,
    workflowLocator: randomUUID(),
  });

  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: null,
    expiresAt: past,
    identityClaimRevision: 1,
  });

  const admittedTarget = await createUser(prisma, state, {
    tenantId: tenantB,
    email: `accepted-target.${state.suffix}@example.test`,
    identityClaimRevision: 1,
  });
  await createClaim(prisma, state, {
    emailCanonical: admittedTarget.email,
    claimType: "USER",
    tenantId: tenantB,
    subjectId: admittedTarget.id,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: `accepted-mismatch.${state.suffix}@example.test`,
    acceptedAt: past,
    acceptedByUserId: admittedTarget.id,
    expiresAt: future,
  });
  await createInvite(prisma, state, {
    tenantId: tenantA,
    email: `state-mismatch.${state.suffix}@example.test`,
    acceptedByUserId: admittedTarget.id,
    expiresAt: future,
  });

  return {
    expected: {
      decision: "BLOCKED",
      proposalTotal: 0,
    },
    minimumBlockingTotal: 12,
    requiredBlockingCodes: [
      "ACCEPTED_INVITE_BINDING_MISMATCH",
      "ACCEPTED_INVITE_CLAIM_LINEAGE_MISMATCH",
      "ACTIVE_IDENTITY_CANONICAL_COLLISION",
      "BOUND_CLAIM_NULL_PROVENANCE",
      "CLAIM_SUBJECT_ID_INVALID",
      "EMAIL_CHANGE_CLAIM_PRESENT",
      "INVITE_STATE_MISMATCH",
      "LIVE_INVITE_CLAIM_OWNER_MISMATCH",
      "LIVE_INVITE_CLAIM_REVISION_MISMATCH",
      "LIVE_INVITE_EMAIL_MISSING_OR_UNSUPPORTED",
      "LIVE_INVITE_REVISION_WITHOUT_EXACT_CLAIM",
      "LIVE_INVITE_SUBJECT_ID_INVALID",
      "ORPHAN_INVITE_CLAIM",
      "ORPHAN_USER_CLAIM",
      "USER_CLAIM_OWNER_MISMATCH",
      "USER_CLAIM_REVISION_MISMATCH",
      "USER_EMAIL_UNSUPPORTED",
      "USER_REVISION_WITHOUT_EXACT_CLAIM",
      "USER_SUBJECT_ID_INVALID",
    ],
    requiredOccurrences: {
      ACCEPTED_INVITE_CLAIM_LINEAGE_MISMATCH: 1,
      CLAIM_SUBJECT_ID_INVALID: 1,
      LIVE_INVITE_CLAIM_OWNER_MISMATCH: 1,
      LIVE_INVITE_CLAIM_REVISION_MISMATCH: 1,
      LIVE_INVITE_REVISION_WITHOUT_EXACT_CLAIM: 1,
      LIVE_INVITE_SUBJECT_ID_INVALID: 1,
      TERMINAL_INVITE_EMAIL_UNSUPPORTED: 1,
      USER_SENSITIVE_IDENTITY_REVIEW: 2,
    },
  };
}

async function expectPermissionDenied(label, operation) {
  let caught = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: reader unexpectedly obtained excess access.`);
  const errorText = [
    caught?.code,
    caught?.message,
    caught?.meta?.code,
    caught?.meta?.message,
    caught?.cause?.code,
    caught?.cause?.message,
  ]
    .filter((value) => value !== null && value !== undefined)
    .join(" ");
  assert.match(errorText, /42501|permission denied/iu);
}

async function assertReaderRole(admin, reader, descriptor) {
  const [roleState] = await admin.$queryRawUnsafe(
    `
      SELECT
        role_state.rolcanlogin AS can_login,
        role_state.rolinherit AS can_inherit,
        role_state.rolsuper AS is_superuser,
        role_state.rolcreatedb AS can_create_database,
        role_state.rolcreaterole AS can_create_role,
        role_state.rolreplication AS can_replicate,
        role_state.rolbypassrls AS can_bypass_rls
      FROM pg_catalog.pg_roles AS role_state
      WHERE role_state.rolname = $1
    `,
    descriptor.roleName,
  );
  assert.deepEqual(roleState, {
    can_bypass_rls: false,
    can_create_database: false,
    can_create_role: false,
    can_inherit: false,
    can_login: true,
    can_replicate: false,
    is_superuser: false,
  });

  const actualColumnGrants = await admin.$queryRawUnsafe(
    `
      SELECT
        columns.table_name,
        columns.column_name,
        columns.is_grantable
      FROM information_schema.column_privileges AS columns
      WHERE columns.table_schema = 'public'
        AND columns.grantee = $1
      ORDER BY
        columns.table_name COLLATE "C",
        columns.column_name COLLATE "C"
    `,
    descriptor.roleName,
  );
  const expectedColumnGrants = Object.entries(READER_COLUMN_GRANTS)
    .flatMap(([tableName, columns]) =>
      columns.map((columnName) => ({
        column_name: columnName,
        is_grantable: "NO",
        table_name: tableName,
      })),
    )
    .sort((left, right) => {
      const leftKey = `${left.table_name}.${left.column_name}`;
      const rightKey = `${right.table_name}.${right.column_name}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  assert.deepEqual(actualColumnGrants, expectedColumnGrants);

  const tableGrants = await admin.$queryRawUnsafe(
    `
      SELECT privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND grantee = $1
    `,
    descriptor.roleName,
  );
  assert.deepEqual(tableGrants, []);

  const [databasePrivileges] = await admin.$queryRawUnsafe(
    `
      SELECT
        has_database_privilege($1, current_database(), 'CREATE') AS can_create,
        has_database_privilege($1, current_database(), 'TEMPORARY') AS can_temp,
        has_schema_privilege($1, 'public', 'CREATE') AS can_create_schema_object
    `,
    descriptor.roleName,
  );
  assert.deepEqual(databasePrivileges, {
    can_create: false,
    can_create_schema_object: false,
    can_temp: false,
  });

  const functionPrivileges = await admin.$queryRawUnsafe(
    `
      SELECT
        function_signature,
        has_function_privilege($1, function_signature, 'EXECUTE') AS can_execute
      FROM unnest($2::text[]) AS signatures(function_signature)
      ORDER BY function_signature
    `,
    descriptor.roleName,
    IDENTITY_FUNCTION_SIGNATURES,
  );
  assert.equal(
    functionPrivileges.every((entry) => entry.can_execute === false),
    true,
  );
  const typePrivileges = await admin.$queryRawUnsafe(
    `
      SELECT
        type_name,
        has_type_privilege(
          $1,
          format('%I.%I', 'public', type_name),
          'USAGE'
        ) AS can_use
      FROM unnest($2::text[]) AS type_names(type_name)
      ORDER BY type_name COLLATE "C"
    `,
    descriptor.roleName,
    SHARED_BETA_ADMISSION_DORMANT_TYPES,
  );
  assert.equal(
    typePrivileges.length,
    SHARED_BETA_ADMISSION_DORMANT_TYPES.length,
  );
  assert.equal(
    typePrivileges.every((entry) => entry.can_use === false),
    true,
  );

  await reader.$queryRawUnsafe(
    'SELECT "id", "email" FROM public."User" LIMIT 0',
  );
  await reader.$queryRawUnsafe(
    'SELECT "acceptedByUserId" FROM public."UserInvite" LIMIT 0',
  );
  await reader.$queryRawUnsafe(
    'SELECT "migration_name", "checksum" FROM public."_prisma_migrations" LIMIT 0',
  );
  await expectPermissionDenied("full User SELECT", () =>
    reader.$queryRawUnsafe('SELECT * FROM public."User" LIMIT 0'),
  );
  await expectPermissionDenied("passwordHash SELECT", () =>
    reader.$queryRawUnsafe('SELECT "passwordHash" FROM public."User" LIMIT 0'),
  );
  await expectPermissionDenied("tokenHash SELECT", () =>
    reader.$queryRawUnsafe(
      'SELECT "tokenHash" FROM public."UserInvite" LIMIT 0',
    ),
  );
  await expectPermissionDenied("Tenant SELECT", () =>
    reader.$queryRawUnsafe('SELECT * FROM public."Tenant" LIMIT 0'),
  );
  await expectPermissionDenied("owner invite command SELECT", () =>
    reader.$queryRawUnsafe(
      'SELECT * FROM public."IdentityOwnerInviteIssueCommand" LIMIT 0',
    ),
  );
  await expectPermissionDenied("mail outbox SELECT", () =>
    reader.$queryRawUnsafe('SELECT * FROM public."IdentityMailOutbox" LIMIT 0'),
  );
  await expectPermissionDenied("mail ciphertext SELECT", () =>
    reader.$queryRawUnsafe(
      'SELECT "secretCiphertext" FROM public."IdentityMailOutbox" LIMIT 0',
    ),
  );
  for (const relationName of SHARED_BETA_ADMISSION_RELATIONS) {
    await expectPermissionDenied(`${relationName} full SELECT`, () =>
      reader.$queryRawUnsafe(
        `SELECT * FROM public.${quoteIdentifier(relationName)} LIMIT 0`,
      ),
    );
  }
  for (const [relationName, columnName] of SHARED_BETA_ADMISSION_COLUMNS) {
    await expectPermissionDenied(`${relationName}.${columnName} SELECT`, () =>
      reader.$queryRawUnsafe(
        `SELECT ${quoteIdentifier(columnName)}
          FROM public.${quoteIdentifier(relationName)}
          LIMIT 0`,
      ),
    );
  }
  for (const tableName of Object.keys(READER_COLUMN_GRANTS)) {
    await expectPermissionDenied(`${tableName} full SELECT`, () =>
      reader.$queryRawUnsafe(
        `SELECT * FROM public.${quoteIdentifier(tableName)} LIMIT 0`,
      ),
    );
    await expectPermissionDenied(`${tableName} DELETE`, () =>
      reader.$executeRawUnsafe(
        `DELETE FROM public.${quoteIdentifier(tableName)} WHERE FALSE`,
      ),
    );
  }
  await expectPermissionDenied("User UPDATE", () =>
    reader.$executeRawUnsafe(
      'UPDATE public."User" SET "email" = "email" WHERE FALSE',
    ),
  );
  await expectPermissionDenied("claim INSERT", () =>
    reader.$executeRawUnsafe(
      `INSERT INTO public."IdentityEmailClaim" (
        "emailCanonical",
        "claimType",
        "tenantId",
        "subjectId"
      ) VALUES (
        'forbidden@example.test',
        'USER'::public."IdentityEmailClaimType",
        '${randomUUID()}',
        '${randomUUID()}'
      )`,
    ),
  );
  await expectPermissionDenied("persistent DDL", () =>
    reader.$executeRawUnsafe(
      'CREATE TABLE public."IdentityInventoryForbidden" ("id" integer)',
    ),
  );
  await expectPermissionDenied("temporary DDL", () =>
    reader.$executeRawUnsafe(
      'CREATE TEMPORARY TABLE "IdentityInventoryForbidden" ("id" integer)',
    ),
  );
}

async function grantReaderRole(admin, descriptor) {
  const role = quoteIdentifier(descriptor.roleName);
  const database = quoteIdentifier(descriptor.databaseName);
  await admin.$executeRawUnsafe(
    `REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM PUBLIC`,
  );
  await admin.$executeRawUnsafe(
    `GRANT CONNECT ON DATABASE ${database} TO ${role}`,
  );
  await admin.$executeRawUnsafe(
    "REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC",
  );
  await admin.$executeRawUnsafe(
    "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC",
  );
  await admin.$executeRawUnsafe(
    "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC",
  );
  await admin.$executeRawUnsafe(
    "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC",
  );
  await admin.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
  for (const [tableName, columns] of Object.entries(READER_COLUMN_GRANTS)) {
    const quotedColumns = columns.map((column) => quoteIdentifier(column));
    await admin.$executeRawUnsafe(
      `GRANT SELECT (${quotedColumns.join(", ")}) ON TABLE public.${quoteIdentifier(
        tableName,
      )} TO ${role}`,
    );
  }
}

async function inspectDisposableResetTruncateGuards(database) {
  return database.$queryRawUnsafe(`
    WITH expected_guard(relation_name, trigger_name) AS (
      VALUES
        (
          'IdentityMailDeliveryEvent',
          'IdentityMailDeliveryEvent_truncate_guard_trigger'
        ),
        (
          'IdentityMailDeliveryTenantEnrollment',
          'IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger'
        )
    )
    SELECT
      expected_guard.relation_name,
      expected_guard.trigger_name,
      trigger_row.tgenabled::text AS enabled
    FROM expected_guard
    LEFT JOIN pg_catalog.pg_class AS relation_row
      ON relation_row.relnamespace = 'public'::regnamespace
     AND relation_row.relname = expected_guard.relation_name
     AND relation_row.relkind = 'r'
    LEFT JOIN pg_catalog.pg_trigger AS trigger_row
      ON trigger_row.tgrelid = relation_row.oid
     AND trigger_row.tgname = expected_guard.trigger_name
     AND NOT trigger_row.tgisinternal
    ORDER BY
      expected_guard.relation_name COLLATE "C",
      expected_guard.trigger_name COLLATE "C"
  `);
}

async function assertDisposableResetTruncateGuardsEnabled(database) {
  const guards = await inspectDisposableResetTruncateGuards(database);
  assert.deepEqual(
    guards,
    DISPOSABLE_RESET_TRUNCATE_GUARDS.map((guard) => ({
      enabled: "O",
      relation_name: guard.relationName,
      trigger_name: guard.triggerName,
    })),
  );
}

async function assertDisposableResetRejectsDisabledGuard(
  sourceUrl,
  descriptor,
) {
  const adminUrl = databaseUrlFor(sourceUrl, descriptor.databaseName);
  const admin = new PrismaClient({ datasourceUrl: adminUrl, log: [] });
  const guard = DISPOSABLE_RESET_TRUNCATE_GUARDS.at(-1);
  try {
    await admin.$executeRawUnsafe(
      `ALTER TABLE public.${quoteIdentifier(
        guard.relationName,
      )} DISABLE TRIGGER ${quoteIdentifier(guard.triggerName)}`,
    );
    await assert.rejects(
      () => resetDisposableClone(admin),
      assert.AssertionError,
    );
    assert.deepEqual(
      await inspectDisposableResetTruncateGuards(admin),
      DISPOSABLE_RESET_TRUNCATE_GUARDS.map((entry) => ({
        enabled: entry === guard ? "D" : "O",
        relation_name: entry.relationName,
        trigger_name: entry.triggerName,
      })),
    );
  } finally {
    await admin
      .$executeRawUnsafe(
        `ALTER TABLE public.${quoteIdentifier(
          guard.relationName,
        )} ENABLE TRIGGER ${quoteIdentifier(guard.triggerName)}`,
      )
      .finally(() => admin.$disconnect());
  }
}

async function resetDisposableClone(admin) {
  await admin.$transaction(
    async (transaction) => {
      await assertDisposableResetTruncateGuardsEnabled(transaction);
      for (const guard of DISPOSABLE_RESET_TRUNCATE_GUARDS) {
        await transaction.$executeRawUnsafe(
          `ALTER TABLE public.${quoteIdentifier(
            guard.relationName,
          )} DISABLE TRIGGER ${quoteIdentifier(guard.triggerName)}`,
        );
      }
      await transaction.$executeRawUnsafe(`
        TRUNCATE TABLE
          public."IdentityEmailClaim",
          public."UserInvite",
          public."User",
          public."Tenant"
        CASCADE
      `);
      for (const guard of [...DISPOSABLE_RESET_TRUNCATE_GUARDS].reverse()) {
        await transaction.$executeRawUnsafe(
          `ALTER TABLE public.${quoteIdentifier(
            guard.relationName,
          )} ENABLE TRIGGER ${quoteIdentifier(guard.triggerName)}`,
        );
      }
      await assertDisposableResetTruncateGuardsEnabled(transaction);
    },
    {
      maxWait: ADMIN_LOCK_TIMEOUT_MS,
      timeout: ADMIN_STATEMENT_TIMEOUT_MS,
    },
  );
}

async function runScenario(
  inventory,
  environment,
  sourceUrl,
  descriptor,
  seed,
  state,
  expectedMigrationArtifact,
) {
  const adminUrl = databaseUrlFor(sourceUrl, descriptor.databaseName);
  const readerUrl = databaseUrlFor(sourceUrl, descriptor.databaseName, {
    username: descriptor.roleName,
    password: descriptor.password,
  });
  const admin = new PrismaClient({ datasourceUrl: adminUrl, log: [] });
  const reader = new PrismaClient({ datasourceUrl: readerUrl, log: [] });
  const hmacKey = `identity-inventory-smoke-${randomBytes(48).toString("hex")}`;
  collectSensitive(
    state,
    descriptor.databaseName,
    descriptor.roleName,
    descriptor.password,
    hmacKey,
  );
  let failureStage = "SCENARIO_RESET";
  try {
    // CURRENT_176 makes the delivery-event ledger and tenant enrollment
    // non-truncatable. This setup is restricted to generated disposable
    // clones, so suspend only those two exact statement guards inside the
    // reset transaction. Any failure rolls the trigger state back.
    await resetDisposableClone(admin);
    const [emptyState] = await admin.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::integer FROM public."IdentityEmailClaim")
          AS identity_claim_count,
        (SELECT COUNT(*)::integer FROM public."UserInvite")
          AS invite_count,
        (SELECT COUNT(*)::integer FROM public."User") AS user_count,
        (SELECT COUNT(*)::integer FROM public."Tenant") AS tenant_count
    `);
    assert.deepEqual(emptyState, {
      identity_claim_count: 0,
      invite_count: 0,
      tenant_count: 0,
      user_count: 0,
    });
    failureStage = "SCENARIO_SEED";
    const expectations = await seed(admin, state);
    failureStage = "SCENARIO_READER_GRANT";
    await grantReaderRole(admin, descriptor);
    failureStage = "SCENARIO_READER_ADMISSION";
    await assertReaderRole(admin, reader, descriptor);
    const scopedEnvironment = inventoryEnvironment(
      environment,
      readerUrl,
      descriptor.databaseName,
      hmacKey,
    );
    const config = inventory.parseRuntimeContract(scopedEnvironment);
    failureStage = "SCENARIO_INVENTORY";
    const report = await inventory.inspectDatabase(scopedEnvironment, config, {
      expectedMigrationArtifact,
    });
    failureStage = "SCENARIO_REDACTION";
    assertSensitiveValuesAbsent(report, state.sensitive);
    return { config, expectations, report };
  } catch (error) {
    throw withFailureStage(error, failureStage);
  } finally {
    await Promise.allSettled([reader.$disconnect(), admin.$disconnect()]);
  }
}

async function assertAuthorityAndCatalogDriftRejected(
  inventory,
  environment,
  sourceUrl,
  descriptor,
  hmacKey,
  expectedMigrationArtifact,
  sensitive,
  roleCreationAttempts,
) {
  assert.ok(Array.isArray(roleCreationAttempts));
  const adminUrl = databaseUrlFor(sourceUrl, descriptor.databaseName);
  const readerUrl = databaseUrlFor(sourceUrl, descriptor.databaseName, {
    username: descriptor.roleName,
    password: descriptor.password,
  });
  const admin = new PrismaClient({ datasourceUrl: adminUrl, log: [] });
  const cleanupActions = [];
  const registerCleanup = (label, action) => {
    cleanupActions.push({ action, label });
  };
  const drainCleanupActions = async () => {
    const errors = [];
    while (cleanupActions.length > 0) {
      const cleanup = cleanupActions.pop();
      try {
        await cleanup.action();
      } catch (error) {
        errors.push(
          new Error(`Authority fixture cleanup failed: ${cleanup.label}`, {
            cause: error,
          }),
        );
      }
    }
    return errors;
  };
  const requireCleanCheckpoint = async () => {
    const errors = await drainCleanupActions();
    if (errors.length > 0) {
      throw new AggregateError(errors, "Authority fixture cleanup failed.");
    }
  };
  let operationError = null;
  try {
    const inspect = async () => {
      const scopedEnvironment = inventoryEnvironment(
        environment,
        readerUrl,
        descriptor.databaseName,
        hmacKey,
      );
      const config = inventory.parseRuntimeContract(scopedEnvironment);
      const report = await inventory.inspectDatabase(
        scopedEnvironment,
        config,
        { expectedMigrationArtifact },
      );
      assertSensitiveValuesAbsent(report, sensitive);
      return { config, report };
    };
    const readerRole = quoteIdentifier(descriptor.roleName);
    const admissionRelationName = SHARED_BETA_ADMISSION_DORMANT_RELATIONS[0];
    const admissionColumn = SHARED_BETA_ADMISSION_COLUMNS.find(
      ([relationName]) => relationName === admissionRelationName,
    );
    const admissionFunction = SHARED_BETA_ADMISSION_FUNCTIONS.find((entry) =>
      SHARED_BETA_ADMISSION_DORMANT_FUNCTIONS.includes(entry.name),
    );
    const profileDigestFunction = SHARED_BETA_ADMISSION_FUNCTIONS.find(
      (entry) => entry.volatility === "s" && entry.language === "sql",
    );
    const runtimeReleaseFunction =
      CURRENT_174_NON_IDENTITY_RUNTIME_RELEASE_FUNCTIONS.find(
        (entry) => entry.key === "shared_beta_runtime_digest_v1",
      );
    const admissionTypeName = SHARED_BETA_ADMISSION_DORMANT_TYPES[0];
    assert.equal(typeof admissionRelationName, "string");
    assert.ok(Array.isArray(admissionColumn));
    assert.equal(typeof admissionFunction?.catalogSignature, "string");
    assert.equal(typeof profileDigestFunction?.catalogSignature, "string");
    assert.equal(typeof runtimeReleaseFunction?.catalogSignature, "string");
    assert.equal(typeof admissionTypeName, "string");
    const quotedAdmissionRelation = quoteIdentifier(admissionRelationName);
    const quotedAdmissionColumn = quoteIdentifier(admissionColumn[1]);
    const admissionFunctionSignature = admissionFunction.catalogSignature;
    const profileDigestFunctionSignature =
      profileDigestFunction.catalogSignature;
    const quotedAdmissionType = quoteIdentifier(admissionTypeName);
    const latestMigrationName = expectedMigrationArtifact.migrationNames.at(-1);
    const expectedLatestChecksum =
      expectedMigrationArtifact.migrationChecksums.at(-1);
    const [migrationRow] = await admin.$queryRawUnsafe(
      `
        SELECT "checksum"::text AS checksum
        FROM public."_prisma_migrations"
        WHERE "migration_name" = $1
      `,
      latestMigrationName,
    );
    assert.equal(migrationRow?.checksum, expectedLatestChecksum);
    const changedChecksum =
      migrationRow.checksum[0] === "0"
        ? `1${migrationRow.checksum.slice(1)}`
        : `0${migrationRow.checksum.slice(1)}`;
    sensitive.add(migrationRow.checksum);
    sensitive.add(changedChecksum);
    await admin.$executeRawUnsafe(
      `
        UPDATE public."_prisma_migrations"
        SET "checksum" = $1
        WHERE "migration_name" = $2
      `,
      changedChecksum,
      latestMigrationName,
    );
    registerCleanup("restore reviewed migration checksum", () =>
      admin.$executeRawUnsafe(
        `
          UPDATE public."_prisma_migrations"
          SET "checksum" = $1
          WHERE "migration_name" = $2
        `,
        migrationRow.checksum,
        latestMigrationName,
      ),
    );
    const checksumDrift = await inspect();
    assert.equal(checksumDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(checksumDrift.report?.summary?.inventoryExecuted, false);
    assert.equal(
      checksumDrift.report?.database?.migrations?.orderedNamesMatched,
      true,
    );
    assert.equal(
      checksumDrift.report?.database?.migrations?.orderedChecksumsMatched,
      false,
    );
    assert.equal(
      checksumDrift.report?.database?.migrations?.checksumMismatchCount,
      1,
    );
    assert.equal(
      checksumDrift.report?.database?.migrations?.invalidChecksumCount,
      0,
    );
    assert.deepEqual(checksumDrift.report?.summary?.schemaRejectionCodes, [
      "MIGRATION_STATE_MISMATCH",
    ]);
    await requireCleanCheckpoint();

    const thirdPartyRoleName = `lp_idinv_acl_${createHash("sha256")
      .update(descriptor.databaseName)
      .digest("hex")
      .slice(0, 16)}`;
    const thirdPartyRole = quoteIdentifier(thirdPartyRoleName);
    await admin.$executeRawUnsafe(
      `CREATE ROLE ${thirdPartyRole}
        NOLOGIN
        NOINHERIT
        NOSUPERUSER
        NOCREATEDB
        NOCREATEROLE
        NOREPLICATION
        NOBYPASSRLS`,
    );
    roleCreationAttempts.push(thirdPartyRoleName);
    registerCleanup("remove dormant ACL third-party role", async () => {
      await admin.$executeRawUnsafe(
        `ALTER TABLE public.${quotedAdmissionRelation}
        OWNER TO CURRENT_USER`,
      );
      await admin.$executeRawUnsafe(
        `ALTER FUNCTION ${admissionFunctionSignature}
        OWNER TO CURRENT_USER`,
      );
      await admin.$executeRawUnsafe(
        `ALTER TYPE public.${quotedAdmissionType}
        OWNER TO CURRENT_USER`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON TABLE public.${quotedAdmissionRelation}
        FROM ${thirdPartyRole}`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE SELECT (${quotedAdmissionColumn})
        ON TABLE public.${quotedAdmissionRelation}
        FROM ${thirdPartyRole}`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES
        ON FUNCTION ${admissionFunctionSignature}
        FROM ${thirdPartyRole}`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES
        ON FUNCTION ${runtimeReleaseFunction.catalogSignature}
        FROM ${thirdPartyRole}`,
      );
      await admin.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES
        ON TYPE public.${quotedAdmissionType}
        FROM ${thirdPartyRole}`,
      );
      await admin.$executeRawUnsafe(`DROP ROLE IF EXISTS ${thirdPartyRole}`);
    });

    await admin.$executeRawUnsafe(
      `GRANT SELECT
      ON TABLE public.${quotedAdmissionRelation}
      TO ${thirdPartyRole}`,
    );
    const thirdPartyTableAclDrift = await inspect();
    assert.equal(
      thirdPartyTableAclDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyTableAclDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      thirdPartyTableAclDrift.report?.database?.catalog
        ?.dormantRelationNonownerAclCount > 0,
    );
    assert.equal(
      thirdPartyTableAclDrift.report?.database?.migrations?.checked,
      false,
    );
    await admin.$executeRawUnsafe(
      `REVOKE SELECT
      ON TABLE public.${quotedAdmissionRelation}
      FROM ${thirdPartyRole}`,
    );

    await admin.$executeRawUnsafe(
      `GRANT SELECT (${quotedAdmissionColumn})
      ON TABLE public.${quotedAdmissionRelation}
      TO ${thirdPartyRole}`,
    );
    const thirdPartyColumnAclDrift = await inspect();
    assert.equal(
      thirdPartyColumnAclDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyColumnAclDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      thirdPartyColumnAclDrift.report?.database?.catalog
        ?.dormantColumnNonownerAclCount > 0,
    );
    await admin.$executeRawUnsafe(
      `REVOKE SELECT (${quotedAdmissionColumn})
      ON TABLE public.${quotedAdmissionRelation}
      FROM ${thirdPartyRole}`,
    );

    await admin.$executeRawUnsafe(
      `GRANT EXECUTE
      ON FUNCTION ${admissionFunctionSignature}
      TO ${thirdPartyRole}`,
    );
    const thirdPartyFunctionAclDrift = await inspect();
    assert.equal(
      thirdPartyFunctionAclDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyFunctionAclDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      thirdPartyFunctionAclDrift.report?.database?.catalog
        ?.dormantFunctionNonownerAclCount > 0,
    );
    await admin.$executeRawUnsafe(
      `REVOKE EXECUTE
      ON FUNCTION ${admissionFunctionSignature}
      FROM ${thirdPartyRole}`,
    );

    await admin.$executeRawUnsafe(
      `GRANT EXECUTE
      ON FUNCTION ${runtimeReleaseFunction.catalogSignature}
      TO ${thirdPartyRole}`,
    );
    const thirdPartyRuntimeReleaseAclDrift = await inspect();
    assert.equal(
      thirdPartyRuntimeReleaseAclDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyRuntimeReleaseAclDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      thirdPartyRuntimeReleaseAclDrift.report?.database?.catalog
        ?.dormantFunctionNonownerAclCount > 0,
    );
    await admin.$executeRawUnsafe(
      `REVOKE EXECUTE
      ON FUNCTION ${runtimeReleaseFunction.catalogSignature}
      FROM ${thirdPartyRole}`,
    );

    await admin.$executeRawUnsafe(
      `ALTER FUNCTION ${admissionFunctionSignature}
      OWNER TO ${thirdPartyRole}`,
    );
    const thirdPartyFunctionOwnerDrift = await inspect();
    assert.equal(
      thirdPartyFunctionOwnerDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyFunctionOwnerDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.equal(
      thirdPartyFunctionOwnerDrift.report?.database?.catalog
        ?.dormantFunctionOwnerMismatchCount,
      1,
    );
    await admin.$executeRawUnsafe(
      `ALTER FUNCTION ${admissionFunctionSignature}
      OWNER TO CURRENT_USER`,
    );

    await admin.$executeRawUnsafe(
      `ALTER TABLE public.${quotedAdmissionRelation}
      OWNER TO ${thirdPartyRole}`,
    );
    const thirdPartyRelationOwnerDrift = await inspect();
    assert.equal(
      thirdPartyRelationOwnerDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyRelationOwnerDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.equal(
      thirdPartyRelationOwnerDrift.report?.database?.catalog
        ?.dormantRelationOwnerMismatchCount,
      1,
    );
    await admin.$executeRawUnsafe(
      `ALTER TABLE public.${quotedAdmissionRelation}
      OWNER TO CURRENT_USER`,
    );

    await admin.$executeRawUnsafe(
      `GRANT USAGE
      ON TYPE public.${quotedAdmissionType}
      TO ${thirdPartyRole}`,
    );
    const thirdPartyTypeAclDrift = await inspect();
    assert.equal(
      thirdPartyTypeAclDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyTypeAclDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      thirdPartyTypeAclDrift.report?.database?.catalog
        ?.dormantTypeNonownerAclCount > 0,
    );
    await admin.$executeRawUnsafe(
      `REVOKE USAGE
      ON TYPE public.${quotedAdmissionType}
      FROM ${thirdPartyRole}`,
    );

    await admin.$executeRawUnsafe(
      `ALTER TYPE public.${quotedAdmissionType}
      OWNER TO ${thirdPartyRole}`,
    );
    const thirdPartyTypeOwnerDrift = await inspect();
    assert.equal(
      thirdPartyTypeOwnerDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      thirdPartyTypeOwnerDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.equal(
      thirdPartyTypeOwnerDrift.report?.database?.catalog
        ?.dormantTypeOwnerMismatchCount,
      1,
    );
    await admin.$executeRawUnsafe(
      `ALTER TYPE public.${quotedAdmissionType}
      OWNER TO CURRENT_USER`,
    );
    await requireCleanCheckpoint();
    const [thirdPartyResidue] = await admin.$queryRawUnsafe(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_roles
          WHERE rolname = $1
        ) AS role_exists
      `,
      thirdPartyRoleName,
    );
    assert.equal(thirdPartyResidue?.role_exists, false);

    await admin.$executeRawUnsafe(
      "CREATE EXTENSION IF NOT EXISTS postgres_fdw",
    );
    registerCleanup("drop postgres_fdw", () =>
      admin.$executeRawUnsafe("DROP EXTENSION IF EXISTS postgres_fdw"),
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE ON FOREIGN DATA WRAPPER postgres_fdw TO ${readerRole}`,
    );
    registerCleanup("revoke postgres_fdw usage", () =>
      admin.$executeRawUnsafe(
        `REVOKE USAGE ON FOREIGN DATA WRAPPER postgres_fdw FROM ${readerRole}`,
      ),
    );
    await admin.$executeRawUnsafe(
      `GRANT SET ON PARAMETER work_mem TO ${readerRole}`,
    );
    registerCleanup("revoke work_mem parameter privilege", () =>
      admin.$executeRawUnsafe(
        `REVOKE SET ON PARAMETER work_mem FROM ${readerRole}`,
      ),
    );
    await admin.$executeRawUnsafe(
      `GRANT CREATE ON SCHEMA pg_catalog TO ${readerRole}`,
    );
    registerCleanup("revoke pg_catalog schema create", () =>
      admin.$executeRawUnsafe(
        `REVOKE CREATE ON SCHEMA pg_catalog FROM ${readerRole}`,
      ),
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA pg_toast TO ${readerRole}`,
    );
    registerCleanup("revoke pg_toast schema usage", () =>
      admin.$executeRawUnsafe(
        `REVOKE USAGE ON SCHEMA pg_toast FROM ${readerRole}`,
      ),
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT ON TABLE pg_catalog.pg_authid TO ${readerRole}`,
    );
    registerCleanup("revoke pg_authid select", () =>
      admin.$executeRawUnsafe(
        `REVOKE SELECT ON TABLE pg_catalog.pg_authid FROM ${readerRole}`,
      ),
    );
    await admin.$executeRawUnsafe(
      `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO ${readerRole}`,
    );
    registerCleanup("revoke pg_read_file execute", () =>
      admin.$executeRawUnsafe(
        `REVOKE EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) FROM ${readerRole}`,
      ),
    );
    const authorityDrift = await inspect();
    assert.equal(
      authorityDrift.report?.summary?.decision,
      "ADMISSION_MISMATCH",
    );
    assert.equal(authorityDrift.report?.summary?.inventoryExecuted, false);
    assert.ok(
      authorityDrift.report?.database?.privileges
        ?.foreignDataWrapperUsageCount > 0,
    );
    assert.ok(
      authorityDrift.report?.database?.privileges?.parameterPrivilegeCount > 0,
    );
    assert.ok(
      authorityDrift.report?.database?.privileges?.systemSchemaCreateCount > 0,
    );
    assert.ok(
      authorityDrift.report?.database?.privileges?.systemSchemaPrivilegeCount >=
        2,
    );
    assert.ok(
      authorityDrift.report?.database?.privileges?.systemObjectPrivilegeCount >=
        2,
    );
    assert.equal(authorityDrift.report?.database?.migrations?.checked, false);
    assert.equal(
      inventory.exitCodeForReport(
        authorityDrift.report,
        authorityDrift.config.hmacKey,
      ),
      3,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(
      "GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO PUBLIC",
    );
    registerCleanup("revoke public pg_read_file execute", () =>
      admin.$executeRawUnsafe(
        "REVOKE EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) FROM PUBLIC",
      ),
    );
    const publicAuthorityDrift = await inspect();
    assert.equal(
      publicAuthorityDrift.report?.summary?.decision,
      "ADMISSION_MISMATCH",
    );
    assert.equal(
      publicAuthorityDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      publicAuthorityDrift.report?.database?.privileges
        ?.systemObjectPrivilegeCount > 0,
    );
    await requireCleanCheckpoint();

    const definerFunctionName = `lp_idinv_definer_${createHash("sha256")
      .update(descriptor.roleName)
      .digest("hex")
      .slice(0, 16)}`;
    const quotedDefinerFunction = quoteIdentifier(definerFunctionName);
    await admin.$executeRawUnsafe(`
      CREATE FUNCTION pg_catalog.${quotedDefinerFunction}()
      RETURNS integer
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS 'SELECT 1'
    `);
    registerCleanup("drop system security definer function", () =>
      admin.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS pg_catalog.${quotedDefinerFunction}()`,
      ),
    );
    const definerAuthorityDrift = await inspect();
    assert.equal(
      definerAuthorityDrift.report?.summary?.decision,
      "ADMISSION_MISMATCH",
    );
    assert.equal(
      definerAuthorityDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.ok(
      definerAuthorityDrift.report?.database?.privileges
        ?.systemSecurityDefinerFunctionCount > 0,
    );
    assert.ok(
      definerAuthorityDrift.report?.database?.privileges
        ?.systemHighOidExecutableFunctionCount > 0,
    );
    await requireCleanCheckpoint();

    const invokerFunctionName = `lp_idinv_invoker_${createHash("sha256")
      .update(descriptor.databaseName)
      .digest("hex")
      .slice(0, 16)}`;
    const quotedInvokerFunction = quoteIdentifier(invokerFunctionName);
    await admin.$executeRawUnsafe(`
      CREATE FUNCTION pg_catalog.${quotedInvokerFunction}()
      RETURNS integer
      LANGUAGE sql
      SECURITY INVOKER
      SET search_path = pg_catalog
      AS 'SELECT 1'
    `);
    registerCleanup("drop system security invoker function", () =>
      admin.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS pg_catalog.${quotedInvokerFunction}()`,
      ),
    );
    const invokerAuthorityDrift = await inspect();
    assert.equal(
      invokerAuthorityDrift.report?.summary?.decision,
      "ADMISSION_MISMATCH",
    );
    assert.equal(
      invokerAuthorityDrift.report?.summary?.inventoryExecuted,
      false,
    );
    assert.equal(
      invokerAuthorityDrift.report?.database?.privileges
        ?.systemSecurityDefinerFunctionCount,
      0,
    );
    assert.ok(
      invokerAuthorityDrift.report?.database?.privileges
        ?.systemHighOidExecutableFunctionCount > 0,
    );
    await requireCleanCheckpoint();

    const [runtimeReleaseDefinition] = await admin.$queryRawUnsafe(`
      SELECT pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(
          'public."shared_beta_runtime_digest_v1"(text,jsonb)'
        )
      ) AS definition
    `);
    assert.equal(typeof runtimeReleaseDefinition?.definition, "string");
    await admin.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public."shared_beta_runtime_digest_v1"(
        domain text,
        candidate jsonb
      )
      RETURNS text
      LANGUAGE sql
      IMMUTABLE
      STRICT
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS 'SELECT pg_catalog.repeat(''0'', 64)'
    `);
    registerCleanup("restore runtime-release function definition", () =>
      admin.$executeRawUnsafe(runtimeReleaseDefinition.definition),
    );
    const runtimeReleaseDefinitionDrift = await inspect();
    assert.equal(
      runtimeReleaseDefinitionDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      runtimeReleaseDefinitionDrift.report?.database?.catalog
        ?.matchedFunctionCount,
      45,
    );
    assert.equal(
      runtimeReleaseDefinitionDrift.report?.database?.catalog
        ?.actualFunctionCount,
      46,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      ALTER FUNCTION
        public."shared_beta_runtime_database_identity_digest_v1"(text)
      RENAME TO "shared_beta_runtime_database_identity_digest_drift_v1"
    `);
    registerCleanup("restore runtime-release function name", () =>
      admin.$executeRawUnsafe(`
        ALTER FUNCTION
          public."shared_beta_runtime_database_identity_digest_drift_v1"(text)
        RENAME TO "shared_beta_runtime_database_identity_digest_v1"
      `),
    );
    const runtimeReleaseMissingDrift = await inspect();
    assert.equal(
      runtimeReleaseMissingDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      runtimeReleaseMissingDrift.report?.database?.catalog
        ?.matchedFunctionCount,
      45,
    );
    assert.equal(
      runtimeReleaseMissingDrift.report?.database?.catalog?.actualFunctionCount,
      46,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      CREATE FUNCTION public."shared_beta_runtime_digest_v1"(text)
      RETURNS text
      LANGUAGE sql
      SECURITY INVOKER
      SET search_path = pg_catalog
      AS 'SELECT $1'
    `);
    await admin.$executeRawUnsafe(`
      REVOKE ALL
      ON FUNCTION public."shared_beta_runtime_digest_v1"(text)
      FROM PUBLIC
    `);
    registerCleanup("drop unexpected runtime-release overload", () =>
      admin.$executeRawUnsafe(`
        DROP FUNCTION IF EXISTS
          public."shared_beta_runtime_digest_v1"(text)
      `),
    );
    const runtimeReleaseOverloadDrift = await inspect();
    assert.equal(
      runtimeReleaseOverloadDrift.report?.summary?.decision,
      "SCHEMA_MISMATCH",
    );
    assert.equal(
      runtimeReleaseOverloadDrift.report?.database?.catalog
        ?.actualFunctionCount,
      47,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      ALTER TABLE public."IdentityMailOutbox"
      ADD COLUMN "catalogDriftProbe" integer
    `);
    registerCleanup("drop identity outbox catalog probe column", () =>
      admin.$executeRawUnsafe(`
        ALTER TABLE public."IdentityMailOutbox"
        DROP COLUMN "catalogDriftProbe"
      `),
    );
    const columnDrift = await inspect();
    assert.equal(columnDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(
      columnDrift.report?.database?.catalog?.actualExactIdentityColumnCount,
      155,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      ALTER TABLE public."IdentityMailOutbox"
      ADD CONSTRAINT "IdentityMailOutbox_catalog_drift_check"
      CHECK ("envelopeVersion" > 0)
    `);
    registerCleanup("drop identity outbox catalog probe constraint", () =>
      admin.$executeRawUnsafe(`
        ALTER TABLE public."IdentityMailOutbox"
        DROP CONSTRAINT "IdentityMailOutbox_catalog_drift_check"
      `),
    );
    const constraintDrift = await inspect();
    assert.equal(constraintDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(
      constraintDrift.report?.database?.catalog?.actualConstraintCount,
      84,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      CREATE INDEX "identity_mail_outbox_catalog_drift_idx"
      ON public."IdentityMailOutbox" ("createdAt")
    `);
    registerCleanup("drop identity outbox catalog probe index", () =>
      admin.$executeRawUnsafe(`
        DROP INDEX public."identity_mail_outbox_catalog_drift_idx"
      `),
    );
    const indexDrift = await inspect();
    assert.equal(indexDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(indexDrift.report?.database?.catalog?.actualIndexCount, 49);
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      ALTER TABLE public."IdentityMailOutbox"
      DISABLE TRIGGER "IdentityMailOutbox_delivery_guard_trigger"
    `);
    registerCleanup("enable identity outbox delivery guard trigger", () =>
      admin.$executeRawUnsafe(`
        ALTER TABLE public."IdentityMailOutbox"
        ENABLE TRIGGER "IdentityMailOutbox_delivery_guard_trigger"
      `),
    );
    const triggerDrift = await inspect();
    assert.equal(triggerDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(
      triggerDrift.report?.database?.catalog?.matchedTriggerCount,
      8,
    );
    assert.equal(
      triggerDrift.report?.database?.catalog?.actualIdentityTriggerCount,
      9,
    );
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(`
      ALTER TYPE public."IdentityMailOutboxStatus"
      RENAME VALUE 'HOLD' TO 'HOLD_DRIFT'
    `);
    registerCleanup("restore identity outbox status enum label", () =>
      admin.$executeRawUnsafe(`
        ALTER TYPE public."IdentityMailOutboxStatus"
        RENAME VALUE 'HOLD_DRIFT' TO 'HOLD'
      `),
    );
    const enumDrift = await inspect();
    assert.equal(enumDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(
      enumDrift.report?.database?.catalog?.matchedEnumLabelCount,
      14,
    );
    assert.equal(enumDrift.report?.database?.catalog?.totalEnumLabelCount, 15);
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(
      `ALTER TYPE public."IdentityMailTemplate" OWNER TO ${readerRole}`,
    );
    registerCleanup("restore identity mail template enum owner", () =>
      admin.$executeRawUnsafe(
        'ALTER TYPE public."IdentityMailTemplate" OWNER TO CURRENT_USER',
      ),
    );
    const typeOwnerDrift = await inspect();
    assert.equal(typeOwnerDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(typeOwnerDrift.report?.summary?.inventoryExecuted, false);
    assert.ok(typeOwnerDrift.report?.database?.privileges?.ownedTypeCount > 0);
    assert.ok(
      typeOwnerDrift.report?.database?.privileges?.ownershipDependencyCount > 0,
    );
    assert.equal(typeOwnerDrift.report?.database?.migrations?.checked, false);
    await requireCleanCheckpoint();

    await admin.$executeRawUnsafe(
      `ALTER FUNCTION ${profileDigestFunctionSignature} VOLATILE`,
    );
    registerCleanup("restore shared-beta profile digest volatility", () =>
      admin.$executeRawUnsafe(`
        ALTER FUNCTION ${profileDigestFunctionSignature} STABLE
      `),
    );
    const { config, report } = await inspect();
    assert.equal(report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(report?.summary?.inventoryExecuted, false);
    assert.deepEqual(report?.summary?.schemaRejectionCodes, [
      "CATALOG_STATE_MISMATCH",
    ]);
    assert.equal(inventory.exitCodeForReport(report, config.hmacKey), 3);
    await requireCleanCheckpoint();

    const [riTrigger] = await admin.$queryRawUnsafe(`
      SELECT trigger_row.tgname AS trigger_name
      FROM pg_catalog.pg_constraint AS constraint_row
      JOIN pg_catalog.pg_trigger AS trigger_row
        ON trigger_row.tgconstraint = constraint_row.oid
       AND trigger_row.tgisinternal
       AND trigger_row.tgtype = 5
      JOIN pg_catalog.pg_class AS relation_row
        ON relation_row.oid = trigger_row.tgrelid
      WHERE constraint_row.conname =
          'IdentityMailOutbox_issueCommand_fkey'
        AND relation_row.relnamespace = 'public'::regnamespace
        AND relation_row.relname = 'IdentityMailOutbox'
    `);
    assert.equal(typeof riTrigger?.trigger_name, "string");
    const quotedRiTrigger = quoteIdentifier(riTrigger.trigger_name);
    await admin.$executeRawUnsafe(
      `ALTER TABLE public."IdentityMailOutbox" DISABLE TRIGGER ${quotedRiTrigger}`,
    );
    registerCleanup("re-enable IdentityMailOutbox RI trigger", () =>
      admin.$executeRawUnsafe(
        `ALTER TABLE public."IdentityMailOutbox" ENABLE TRIGGER ${quotedRiTrigger}`,
      ),
    );
    const riTriggerDrift = await inspect();
    assert.equal(riTriggerDrift.report?.summary?.decision, "SCHEMA_MISMATCH");
    assert.equal(riTriggerDrift.report?.summary?.inventoryExecuted, false);
    assert.equal(
      riTriggerDrift.report?.database?.catalog?.matchedRiTriggerCount,
      55,
    );
    assert.equal(
      riTriggerDrift.report?.database?.catalog?.actualRiTriggerCount,
      56,
    );
    await requireCleanCheckpoint();
  } catch (error) {
    operationError = error;
  }

  const cleanupErrors = await drainCleanupActions();
  try {
    await admin.$disconnect();
  } catch (error) {
    cleanupErrors.push(
      new Error("Authority fixture disconnect failed.", { cause: error }),
    );
  }
  if (operationError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [operationError, ...cleanupErrors],
      "Authority fixture failed and cleanup was incomplete.",
    );
  }
  if (operationError) {
    throw operationError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "Authority fixture cleanup failed.",
    );
  }
}

export function runSelfTest() {
  assert.equal(
    errorFailureStage(
      withFailureStage(new Error("fixture"), "HEALTHY_SCENARIO"),
    ),
    "HEALTHY_SCENARIO",
  );
  assert.equal(
    errorFailureStage(
      withFailureStage(new Error("fixture"), "UNTRUSTED_STAGE"),
    ),
    "PRECONDITIONS",
  );
  assert.deepEqual(parseArguments(["--help", "--apply"]), {
    help: true,
    selfTest: false,
  });
  assert.deepEqual(parseArguments(["--self-test"]), {
    help: false,
    selfTest: true,
  });
  for (const forbidden of ["--apply", "--fix", "--email=x@example.test"]) {
    assert.throws(() => parseArguments([forbidden]), {
      code: "CLI_ARGUMENT_UNSUPPORTED",
    });
  }
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres:test@db.example.test/leetplus_ci?schema=public",
      ),
    { code: "LOOPBACK_POSTGRES_REQUIRED" },
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1/leetplus?schema=public",
      ),
    { code: "CI_SOURCE_DATABASE_REQUIRED" },
  );
  assert.throws(
    () =>
      parseSourceDatabaseUrl(
        "postgresql://postgres:test@127.0.0.1/leetplus_ci?schema=public&options=unsafe",
      ),
    { code: "DATABASE_URL_PARAMETERS_INVALID" },
  );
  assert.equal(
    quoteIdentifier("lp_idinv_empty_deadbeef_ci"),
    '"lp_idinv_empty_deadbeef_ci"',
  );
  assert.throws(
    () => quoteIdentifier('unsafe"; DROP DATABASE leetplus_ci; --'),
    { code: "DATABASE_IDENTIFIER_INVALID" },
  );
  assert.throws(
    () =>
      assertSensitiveValuesAbsent(
        { finding: "private@example.test" },
        new Set(["private@example.test"]),
      ),
    assert.AssertionError,
  );
  assert.deepEqual(Object.keys(READER_COLUMN_GRANTS).sort(), [
    "IdentityEmailClaim",
    "User",
    "UserInvite",
    "_prisma_migrations",
  ]);
  assert.equal(READER_COLUMN_GRANTS.User.includes("passwordHash"), false);
  assert.equal(READER_COLUMN_GRANTS.UserInvite.includes("tokenHash"), false);
  assert.equal(
    READER_COLUMN_GRANTS._prisma_migrations.includes("checksum"),
    true,
  );
  assert.equal(
    Object.hasOwn(READER_COLUMN_GRANTS, "IdentityMailOutbox"),
    false,
  );
  assert.equal(
    Object.hasOwn(READER_COLUMN_GRANTS, "IdentityOwnerInviteIssueCommand"),
    false,
  );
  assert.equal(
    SHARED_BETA_ADMISSION_RELATIONS.every(
      (relationName) => !Object.hasOwn(READER_COLUMN_GRANTS, relationName),
    ),
    true,
  );
  assert.deepEqual(
    [...SHARED_BETA_ADMISSION_DORMANT_RELATIONS].sort(),
    [...SHARED_BETA_ADMISSION_RELATIONS].sort(),
  );
  assert.equal(CURRENT_EXPECTED_MIGRATION_COUNT, 188);
  assert.equal(
    CURRENT_EXPECTED_LATEST_MIGRATION,
    "20260828190000_guest_support_bug_reports",
  );
  assert.deepEqual(DISPOSABLE_RESET_TRUNCATE_GUARDS, [
    {
      relationName: "IdentityMailDeliveryEvent",
      triggerName: "IdentityMailDeliveryEvent_truncate_guard_trigger",
    },
    {
      relationName: "IdentityMailDeliveryTenantEnrollment",
      triggerName:
        "IdentityMailDeliveryTenantEnrollment_truncate_guard_trigger",
    },
  ]);
  assert.equal(
    IDENTITY_FUNCTION_SIGNATURES.includes(
      'public."identity_email_claim_assert_invite_locator_v1"(text,text,text,integer)',
    ),
    true,
  );
  assert.equal(IDENTITY_FUNCTION_SIGNATURES.length, 46);
  assert.equal(
    IDENTITY_FUNCTION_SIGNATURES.includes(
      'public."identity_mail_delivery_worker_assert_v1"(text)',
    ),
    true,
  );
  assert.equal(
    IDENTITY_FUNCTION_SIGNATURES.includes(
      'public."identity_owner_invite_issue_hold_v1"(text,text,text,integer,text,text,text,text,text,text,text,text,bytea,timestamp with time zone)',
    ),
    true,
  );
  assert.equal(
    SHARED_BETA_ADMISSION_FUNCTIONS.some(
      (entry) =>
        entry.volatility === "s" &&
        entry.language === "sql" &&
        IDENTITY_FUNCTION_SIGNATURES.includes(entry.catalogSignature),
    ),
    true,
  );
  assert.equal(
    CURRENT_174_NON_IDENTITY_RUNTIME_RELEASE_FUNCTIONS.every((entry) =>
      IDENTITY_FUNCTION_SIGNATURES.includes(entry.catalogSignature),
    ),
    true,
  );
  const boundedAdminUrl = new URL(
    databaseUrlFor(
      new URL(
        "postgresql://postgres:test@127.0.0.1:5432/leetplus_ci?schema=public",
      ),
      "postgres",
    ),
  );
  assert.equal(
    boundedAdminUrl.searchParams.get("connect_timeout"),
    String(ADMIN_CONNECT_TIMEOUT_SECONDS),
  );
  assert.match(
    boundedAdminUrl.searchParams.get("options") ?? "",
    /lock_timeout=5000/u,
  );
  assert.match(
    boundedAdminUrl.searchParams.get("options") ?? "",
    /statement_timeout=120000/u,
  );
  return {
    checks: 25,
    destructiveTarget: "generated-clones-only",
    script: SCRIPT_NAME,
    sourceDatabaseWrites: false,
    status: "PASS",
  };
}

export async function runSmoke(environment = process.env) {
  let failureStage = "PRECONDITIONS";
  if (
    String(environment.NODE_ENV ?? "")
      .trim()
      .toLowerCase() === "production"
  ) {
    contractError("PRODUCTION_EXECUTION_PROHIBITED");
  }
  if (
    environment.IDENTITY_LEGACY_INVENTORY_SMOKE_CONFIRM !== SMOKE_CONFIRMATION
  ) {
    contractError("SMOKE_CONFIRMATION_REQUIRED");
  }
  if (!RELEASE_SHA_PATTERN.test(String(environment.RELEASE_SHA ?? ""))) {
    contractError("RELEASE_SHA_INVALID");
  }
  const { databaseName: sourceDatabaseName, parsed: sourceUrl } =
    parseSourceDatabaseUrl(environment.DATABASE_URL);
  failureStage = "INVENTORY_MODULE";
  const inventory = await loadInventoryModule();
  const manifestCodes = findingManifestCodes(inventory.FINDING_MANIFEST);
  assertManifestIncludes(manifestCodes, [
    "LIVE_INVITE_CLAIM_CREATE_CANDIDATE",
    "LIVE_INVITE_LEGACY_TOKEN_REVIEW",
    "USER_CLAIM_CREATE_CANDIDATE",
  ]);

  failureStage = "RELEASE_ARTIFACT";
  const expectedMigrationArtifact =
    await inventory.loadExpectedMigrationArtifact(environment.RELEASE_SHA);
  assert.equal(
    expectedMigrationArtifact.migrationNames.length,
    CURRENT_EXPECTED_MIGRATION_COUNT,
  );
  assert.equal(
    expectedMigrationArtifact.migrationNames.at(-1),
    CURRENT_EXPECTED_LATEST_MIGRATION,
  );
  const suffix = randomBytes(16).toString("hex");
  const descriptors = [
    cloneDescriptor(suffix, "healthy"),
    cloneDescriptor(suffix, "review"),
    cloneDescriptor(suffix, "blocked"),
  ];
  const maintenanceUrl = databaseUrlFor(sourceUrl, "postgres");
  const maintenance = new PrismaClient({
    datasourceUrl: maintenanceUrl,
    log: [],
  });
  const databaseCreationAttempts = [];
  const roleCreationAttempts = [];
  let primaryError = null;
  let smokeResult = null;
  let cleanupResidue = null;
  const cleanupErrors = [];
  const stateByScenario = new Map(
    descriptors.map((descriptor) => [
      descriptor.scenario,
      { sensitive: new Set(), suffix },
    ]),
  );

  try {
    failureStage = "CLUSTER_ADMISSION";
    const [server] = await maintenance.$queryRawUnsafe(`
      SELECT
        current_database() AS database_name,
        (
          SELECT control.system_identifier::text
          FROM pg_catalog.pg_control_system() AS control
        ) AS system_identifier,
        current_setting('server_version_num')::integer AS server_version_number,
        role_state.rolsuper AS is_superuser,
        role_state.rolcreatedb AS can_create_database,
        role_state.rolcreaterole AS can_create_role
      FROM pg_catalog.pg_roles AS role_state
      WHERE role_state.rolname = CURRENT_USER
    `);
    assert.equal(server.database_name, "postgres");
    assert.equal(Math.floor(server.server_version_number / 10_000), 16);
    assert.equal(server.is_superuser, true);
    assert.equal(server.can_create_database, true);
    assert.equal(server.can_create_role, true);
    for (const state of stateByScenario.values()) {
      collectSensitive(
        state,
        environment.DATABASE_URL,
        sourceDatabaseName,
        server.system_identifier,
      );
    }

    failureStage = "CLONE_PROVISIONING";
    for (const descriptor of descriptors) {
      const quotedDatabase = quoteIdentifier(descriptor.databaseName);
      const quotedSource = quoteIdentifier(sourceDatabaseName);
      const quotedRole = quoteIdentifier(descriptor.roleName);
      const [collision] = await maintenance.$queryRawUnsafe(
        `
          SELECT
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_database
              WHERE datname = $1
            ) AS database_exists,
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_roles
              WHERE rolname = $2
            ) AS role_exists
        `,
        descriptor.databaseName,
        descriptor.roleName,
      );
      assert.deepEqual(collision, {
        database_exists: false,
        role_exists: false,
      });
      databaseCreationAttempts.push(descriptor.databaseName);
      await maintenance.$executeRawUnsafe(
        `CREATE DATABASE ${quotedDatabase} TEMPLATE ${quotedSource}`,
      );
      await maintenance.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON DATABASE ${quotedDatabase} FROM PUBLIC`,
      );
      roleCreationAttempts.push(descriptor.roleName);
      await maintenance.$executeRawUnsafe(
        `CREATE ROLE ${quotedRole}
          LOGIN PASSWORD ${quoteLiteral(descriptor.password)}
          NOINHERIT
          NOSUPERUSER
          NOCREATEDB
          NOCREATEROLE
          NOREPLICATION
          NOBYPASSRLS`,
      );
    }

    failureStage = "RESET_GUARD";
    await assertDisposableResetRejectsDisabledGuard(sourceUrl, descriptors[0]);

    failureStage = "HEALTHY_SCENARIO";
    const healthy = await runScenario(
      inventory,
      environment,
      sourceUrl,
      descriptors[0],
      seedHealthyScenario,
      stateByScenario.get("healthy"),
      expectedMigrationArtifact,
    );
    failureStage = "HEALTHY_SUMMARY";
    assertSummary(healthy.report, healthy.expectations.expected, (stage) => {
      failureStage = stage;
    });
    failureStage = "HEALTHY_METRICS";
    assert.deepEqual(
      healthy.report.metrics,
      healthy.expectations.expectedMetrics,
    );
    failureStage = "HEALTHY_FINDINGS";
    assert.equal(
      healthy.report.findings.every((finding) => finding.count === 0),
      true,
    );
    failureStage = "HEALTHY_EXIT_CODE";
    assert.equal(
      inventory.exitCodeForReport(healthy.report, healthy.config.hmacKey),
      0,
    );
    failureStage = "HEALTHY_AUTHORITY_DRIFT";
    await assertAuthorityAndCatalogDriftRejected(
      inventory,
      environment,
      sourceUrl,
      descriptors[0],
      healthy.config.hmacKey,
      expectedMigrationArtifact,
      stateByScenario.get("healthy").sensitive,
      roleCreationAttempts,
    );

    failureStage = "REVIEW_SCENARIO";
    const review = await runScenario(
      inventory,
      environment,
      sourceUrl,
      descriptors[1],
      seedProposalReviewScenario,
      stateByScenario.get("review"),
      expectedMigrationArtifact,
    );
    assertSummary(review.report, review.expectations.expected);
    assert.equal(
      inventory.exitCodeForReport(review.report, review.config.hmacKey),
      2,
    );
    assertManifestIncludes(manifestCodes, review.expectations.requiredCodes);
    for (const [code, occurrences] of Object.entries(
      review.expectations.requiredOccurrences,
    )) {
      assert.equal(findingOccurrences(review.report, code), occurrences);
    }

    failureStage = "BLOCKED_SCENARIO";
    const blocked = await runScenario(
      inventory,
      environment,
      sourceUrl,
      descriptors[2],
      seedAdversarialScenario,
      stateByScenario.get("blocked"),
      expectedMigrationArtifact,
    );
    assert.equal(blocked.report?.summary?.inventoryExecuted, true);
    assert.equal(blocked.report?.summary?.decision, "BLOCKED");
    assert.equal(blocked.report?.summary?.proposalTotal, 0);
    assert.ok(
      blocked.report?.summary?.blockingTotal >=
        blocked.expectations.minimumBlockingTotal,
    );
    for (const code of blocked.expectations.requiredBlockingCodes) {
      assert.ok(
        findingOccurrences(blocked.report, code) > 0,
        `Adversarial fixture did not exercise ${code}.`,
      );
    }
    assertManifestIncludes(
      manifestCodes,
      Object.keys(blocked.expectations.requiredOccurrences),
    );
    for (const [code, occurrences] of Object.entries(
      blocked.expectations.requiredOccurrences,
    )) {
      assert.equal(findingOccurrences(blocked.report, code), occurrences);
    }
    for (const code of [
      "LIVE_INVITE_CLAIM_CREATE_CANDIDATE",
      "USER_CLAIM_CREATE_CANDIDATE",
    ]) {
      assert.equal(findingOccurrences(blocked.report, code), 0);
    }
    assert.equal(
      findingOccurrences(blocked.report, "USER_SENSITIVE_IDENTITY_REVIEW"),
      2,
    );
    assert.equal(
      inventory.exitCodeForReport(blocked.report, blocked.config.hmacKey),
      2,
    );

    const reports = [healthy.report, review.report, blocked.report];
    for (const report of reports) {
      assert.equal(report?.summary?.evidenceScope, "SYNTHETIC_FIXTURE");
      assert.equal(report?.safety?.releaseArtifactBound, false);
      for (const state of stateByScenario.values()) {
        assertSensitiveValuesAbsent(report, state.sensitive);
      }
    }

    smokeResult = {
      adversarialBlocked: true,
      clones: 3,
      disabledResetGuardDriftRejected: true,
      authorityDriftRejected: true,
      catalogDriftRejected: true,
      dormantAclDriftRejected: true,
      dormantTypeDriftRejected: true,
      exactColumnReaderRoles: 3,
      healthyDecision: healthy.report.summary.decision,
      healthyTopologyZeroFindings: true,
      migrationChecksumDriftRejected: true,
      proposalCount: review.report.summary.proposalTotal,
      reviewDecision: review.report.summary.decision,
      script: SCRIPT_NAME,
      sensitiveValuesAbsent: true,
      sharedBetaDeniedColumns: SHARED_BETA_ADMISSION_COLUMNS.length,
      sharedBetaDeniedFunctions: SHARED_BETA_ADMISSION_FUNCTIONS.length,
      sharedBetaDeniedRelations: SHARED_BETA_ADMISSION_RELATIONS.length,
      sharedBetaDeniedTypes: SHARED_BETA_ADMISSION_DORMANT_TYPES.length,
      sourceDatabaseWrites: false,
      status: "PASS",
    };
  } catch (error) {
    primaryError = withFallbackFailureStage(error, failureStage);
  } finally {
    for (const databaseName of [...databaseCreationAttempts].reverse()) {
      try {
        await maintenance.$executeRawUnsafe(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    for (const roleName of [...roleCreationAttempts].reverse()) {
      try {
        const [roleState] = await maintenance.$queryRawUnsafe(
          `
            SELECT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_roles
              WHERE rolname = $1
            ) AS role_exists
          `,
          roleName,
        );
        if (roleState?.role_exists) {
          await maintenance.$executeRawUnsafe(
            `REVOKE SET ON PARAMETER work_mem FROM ${quoteIdentifier(roleName)}`,
          );
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        await maintenance.$executeRawUnsafe(
          `DROP ROLE IF EXISTS ${quoteIdentifier(roleName)}`,
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      [cleanupResidue] = await maintenance.$queryRawUnsafe(
        `
          SELECT
            (
              SELECT COUNT(*)::integer
              FROM pg_catalog.pg_database
              WHERE datname = ANY($1::text[])
            ) AS database_count,
            (
              SELECT COUNT(*)::integer
              FROM pg_catalog.pg_roles
              WHERE rolname = ANY($2::text[])
            ) AS role_count,
            (
              SELECT COUNT(*)::integer
              FROM pg_catalog.pg_parameter_acl AS parameter_row
              CROSS JOIN LATERAL pg_catalog.aclexplode(
                parameter_row.paracl
              ) AS privilege_row
              JOIN pg_catalog.pg_roles AS role_row
                ON role_row.oid = privilege_row.grantee
              WHERE role_row.rolname = ANY($2::text[])
            ) AS parameter_acl_count
        `,
        databaseCreationAttempts,
        roleCreationAttempts,
      );
      assert.deepEqual(cleanupResidue, {
        database_count: 0,
        parameter_acl_count: 0,
        role_count: 0,
      });
    } catch (error) {
      cleanupErrors.push(error);
    }
    await maintenance.$disconnect().catch((error) => {
      cleanupErrors.push(error);
    });
  }

  if (primaryError && cleanupErrors.length > 0) {
    throw withFailureStage(
      new AggregateError(
        [primaryError, ...cleanupErrors],
        "Smoke failed and cleanup was incomplete.",
      ),
      errorFailureStage(primaryError),
    );
  }
  if (primaryError) {
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw withFailureStage(
      new AggregateError(cleanupErrors, "Smoke cleanup failed."),
      "CLEANUP",
    );
  }
  assert.ok(smokeResult);
  return {
    ...smokeResult,
    cleanup: {
      databaseCount: cleanupResidue.database_count,
      parameterAclCount: cleanupResidue.parameter_acl_count,
      roleCount: cleanupResidue.role_count,
    },
    clusterAclRestored: true,
  };
}

export async function main(
  argv = process.argv.slice(2),
  environment = process.env,
) {
  try {
    const options = parseArguments(argv);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    const result = options.selfTest
      ? runSelfTest()
      : await runSmoke(environment);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const code = error?.safeContractError
      ? String(error.code)
      : "IDENTITY_LEGACY_INVENTORY_SMOKE_FAILED";
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code,
          detail: errorFailureDetail(error),
          stage: errorFailureStage(error),
        },
        script: SCRIPT_NAME,
        status: "ERROR",
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}

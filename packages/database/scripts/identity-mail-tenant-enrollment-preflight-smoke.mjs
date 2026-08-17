import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT,
  parseIdentityMailTenantEnrollmentProposal,
} from "./identity-mail-tenant-enrollment-contract.mjs";
import {
  checkIdentityMailTenantEnrollmentPreflight,
  inspectIdentityMailTenantEnrollmentPreflight,
  parseIdentityMailTenantEnrollmentPreflightConfig,
} from "./identity-mail-tenant-enrollment-preflight-database.mjs";
import {
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION,
  IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT,
  identityMailTenantEnrollmentPreflightProhibitedDataFindings,
} from "./identity-mail-tenant-enrollment-preflight.mjs";

const SCRIPT_NAME = "identity-mail-tenant-enrollment-preflight-smoke";
const REQUIRED_CONFIRMATION =
  "run-identity-mail-tenant-enrollment-preflight-smoke";
const CONFIRMATION_ENVIRONMENT =
  "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_SMOKE_CONFIRM";
const CLONE_PREFIX = "lp_imtep_";
const CLONE_PATTERN = /^lp_imtep_[0-9a-f]{32}_ci$/u;
const SAFE_SOURCE_DATABASE_PATTERN = /^[a-z][a-z0-9_]{0,54}_ci$/u;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const NONEXISTENT_WORKER_OID = 4_000_000_000;

const PREFLIGHT_PROTECTED_RELATIONS = Object.freeze([
  "IdentityMailDeliveryEvent",
  "IdentityMailDeliveryTenantEnrollment",
  "IdentityMailOutbox",
  "SharedBetaBuildProvenance",
  "SharedBetaRuntimeInstanceAnchor",
  "SharedBetaRuntimeReleaseChallenge",
  "SharedBetaRuntimeReleaseMarker",
  "SharedBetaRuntimeReleaseState",
  "SharedBetaTenantActivationCommand",
  "Tenant",
  "_prisma_migrations",
]);

const HELP = `
${SCRIPT_NAME}

Read-only PostgreSQL 16 evidence for the protected mail-worker tenant
enrollment preflight. The smoke clones an exact CURRENT_183 loopback *_ci
database, creates two PII-free tenant fixtures only in that clone, and proves:
  - one DISABLED enrollment and one ABSENT enrollment are tenant-isolated;
  - inspect/check use REPEATABLE READ and READ ONLY transaction metadata;
  - reports remain non-authorizing, non-mutating and free of prohibited data;
  - every relation inspected by the preflight is unchanged by all checks;
  - the source database fingerprint is unchanged; and
  - the generated clone is force-dropped in cleanup.

Usage:
  node scripts/${SCRIPT_NAME}.mjs
  node scripts/${SCRIPT_NAME}.mjs --self-test
  node scripts/${SCRIPT_NAME}.mjs --help

Required for the real smoke:
  NODE_ENV=test
  DATABASE_URL=<numeric-loopback PostgreSQL 16 dedicated *_ci CURRENT_183>
  ${CONFIRMATION_ENVIRONMENT}=${REQUIRED_CONFIRMATION}

The connection must be the source database owner and a disposable test
superuser. No SMTP, network provider, user, invitation or production route is
used. The source database is never mutated.
`.trim();

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArguments(argv) {
  if (!Array.isArray(argv)) contractError("CLI_ARGUMENTS_INVALID");
  if (argv.length === 0) return { help: false, selfTest: false };
  if (argv.length === 1 && argv[0] === "--help") {
    return { help: true, selfTest: false };
  }
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { help: false, selfTest: true };
  }
  contractError("CLI_ARGUMENT_UNSUPPORTED");
}

function quoteIdentifier(value) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    contractError("DATABASE_IDENTIFIER_INVALID");
  }
  return `"${value}"`;
}

function parseSafeSourceDatabaseUrl(rawDatabaseUrl) {
  if (
    typeof rawDatabaseUrl !== "string" ||
    rawDatabaseUrl.length === 0 ||
    rawDatabaseUrl !== rawDatabaseUrl.trim() ||
    /[\u0000-\u001f\u007f]/u.test(rawDatabaseUrl)
  ) {
    contractError("DATABASE_URL_INVALID");
  }

  let parsed;
  try {
    parsed = new URL(rawDatabaseUrl);
  } catch {
    contractError("DATABASE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    contractError("POSTGRESQL_URL_REQUIRED");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!new Set(["127.0.0.1", "::1"]).has(hostname)) {
    contractError("LOOPBACK_POSTGRESQL_REQUIRED");
  }
  if (
    parsed.port !== "" &&
    (!/^[0-9]{1,5}$/u.test(parsed.port) ||
      Number(parsed.port) < 1 ||
      Number(parsed.port) > 65_535)
  ) {
    contractError("DATABASE_PORT_INVALID");
  }
  if (parsed.hash !== "") contractError("DATABASE_URL_FRAGMENT_INVALID");
  const databaseName = decodeURIComponent(
    parsed.pathname.replace(/^\/+|\/+$/gu, ""),
  );
  if (
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName) ||
    ["postgres", "template0", "template1"].includes(databaseName)
  ) {
    contractError("DEDICATED_CI_DATABASE_REQUIRED");
  }
  const queryEntries = [...parsed.searchParams.entries()];
  if (
    queryEntries.length !== 1 ||
    queryEntries[0][0] !== "schema" ||
    queryEntries[0][1] !== "public"
  ) {
    contractError("DATABASE_URL_QUERY_INVALID");
  }
  return Object.freeze({ databaseName, parsed });
}

function databaseUrlFor(sourceUrl, databaseName) {
  if (
    databaseName !== "postgres" &&
    !SAFE_SOURCE_DATABASE_PATTERN.test(databaseName) &&
    !CLONE_PATTERN.test(databaseName)
  ) {
    contractError("DATABASE_TARGET_INVALID");
  }
  const target = new URL(sourceUrl);
  target.pathname = `/${databaseName}`;
  return target.toString();
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function newPrisma(databaseUrl) {
  return new PrismaClient({ datasourceUrl: databaseUrl, log: [] });
}

function numberValue(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    return Number(value);
  }
  return typeof value === "number" ? value : Number.NaN;
}

async function databaseState(prisma, expectedDatabaseName) {
  const [row] = await prisma.$queryRawUnsafe(`
    SELECT
      database_row.datname AS database_name,
      database_row.oid::BIGINT AS database_oid,
      database_owner.rolname = CURRENT_USER AS current_is_database_owner,
      pg_catalog.current_setting('server_version_num')::INTEGER
        AS server_version_number,
      pg_catalog.count(*) FILTER (
        WHERE migration.finished_at IS NOT NULL
          AND migration.rolled_back_at IS NULL
      )::INTEGER AS migration_count,
      pg_catalog.count(*) FILTER (
        WHERE migration.finished_at IS NULL
          AND migration.rolled_back_at IS NULL
      )::INTEGER AS unfinished_migration_count,
      (
        SELECT latest.migration_name
        FROM public."_prisma_migrations" AS latest
        WHERE latest.finished_at IS NOT NULL
          AND latest.rolled_back_at IS NULL
        ORDER BY latest.migration_name DESC
        LIMIT 1
      ) AS migration_head
    FROM pg_catalog.pg_database AS database_row
    INNER JOIN pg_catalog.pg_roles AS database_owner
      ON database_owner.oid = database_row.datdba
    CROSS JOIN public."_prisma_migrations" AS migration
    WHERE database_row.datname = pg_catalog.current_database()
    GROUP BY
      database_row.datname,
      database_row.oid,
      database_owner.rolname
  `);
  assert.ok(row, "Database state is unavailable.");
  assert.equal(row.database_name, expectedDatabaseName);
  assert.equal(row.current_is_database_owner, true);
  assert.equal(Math.floor(Number(row.server_version_number) / 10_000), 16);
  assert.equal(
    row.migration_head,
    IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION,
  );
  assert.equal(
    Number(row.migration_count),
    IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_MIGRATION_COUNT,
  );
  assert.equal(Number(row.unfinished_migration_count), 0);
  return Object.freeze({
    databaseName: row.database_name,
    databaseOid: numberValue(row.database_oid),
    migrationCount: Number(row.migration_count),
    migrationHead: row.migration_head,
    postgresMajor: Math.floor(Number(row.server_version_number) / 10_000),
  });
}

async function relationFingerprint(
  prisma,
  relationName,
  whereClause = "",
  tenantIds = undefined,
) {
  if (!PREFLIGHT_PROTECTED_RELATIONS.includes(relationName)) {
    contractError("FINGERPRINT_RELATION_INVALID");
  }
  if (
    whereClause !== "" &&
    whereClause !== 'WHERE row_value."id" = ANY($1::TEXT[])' &&
    whereClause !== 'WHERE row_value."tenantId" = ANY($1::TEXT[])'
  ) {
    contractError("FINGERPRINT_FILTER_INVALID");
  }
  if (
    whereClause !== "" &&
    (!Array.isArray(tenantIds) ||
      tenantIds.length !== 2 ||
      tenantIds.some((tenantId) => typeof tenantId !== "string"))
  ) {
    contractError("FINGERPRINT_TENANT_IDS_INVALID");
  }
  const parameters = whereClause === "" ? [] : [tenantIds];
  const [row] = await prisma.$queryRawUnsafe(
    `
      SELECT
        pg_catalog.count(*)::BIGINT AS row_count,
        pg_catalog.md5(
          COALESCE(
            pg_catalog.string_agg(
              row_digest,
              '' ORDER BY row_digest
            ),
            ''
          )
        ) AS content_digest
      FROM (
        SELECT
          pg_catalog.md5(pg_catalog.to_jsonb(row_value)::TEXT) AS row_digest
        FROM public.${quoteIdentifier(relationName)} AS row_value
        ${whereClause}
      ) AS digests
    `,
    ...parameters,
  );
  const rowCount = numberValue(row?.row_count);
  assert.ok(Number.isSafeInteger(rowCount) && rowCount >= 0);
  assert.match(row?.content_digest ?? "", /^[0-9a-f]{32}$/u);
  return Object.freeze({
    count: rowCount,
    digest: sha256(`${rowCount}:${row.content_digest}`),
  });
}

async function protectedFingerprint(prisma) {
  const entries = [];
  for (const relationName of PREFLIGHT_PROTECTED_RELATIONS) {
    entries.push([
      relationName,
      await relationFingerprint(prisma, relationName),
    ]);
  }
  return Object.freeze(Object.fromEntries(entries));
}

async function fixtureFingerprint(prisma, tenantIds) {
  assert.equal(tenantIds.length, 2);
  return Object.freeze({
    enrollments: await relationFingerprint(
      prisma,
      "IdentityMailDeliveryTenantEnrollment",
      'WHERE row_value."tenantId" = ANY($1::TEXT[])',
      tenantIds,
    ),
    tenants: await relationFingerprint(
      prisma,
      "Tenant",
      'WHERE row_value."id" = ANY($1::TEXT[])',
      tenantIds,
    ),
  });
}

function policyEnvironment(databaseUrl, providerAuthorityDigest, policy) {
  return {
    DATABASE_URL: databaseUrl,
    IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST:
      providerAuthorityDigest,
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_ACKNOWLEDGE_SECONDS: String(
      policy.acknowledgeSeconds,
    ),
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_BASE_RETRY_SECONDS: String(
      policy.baseRetrySeconds,
    ),
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_LEASE_SECONDS: String(
      policy.leaseSeconds,
    ),
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS: String(
      policy.maxAttempts,
    ),
    IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS: String(
      policy.maxRetrySeconds,
    ),
  };
}

function buildProposal({
  action,
  databaseName,
  databaseOid,
  deploymentMarkerDigest,
  expectedRevision,
  expectedState,
  now,
  policy,
  providerAuthorityDigest,
  tenantId,
  workerRoleName,
}) {
  return {
    action,
    contract: IDENTITY_MAIL_TENANT_ENROLLMENT_CONTRACT,
    deploymentMarkerDigest,
    expectedDatabaseName: databaseName,
    expectedDatabaseOid: databaseOid,
    expectedRevision,
    expectedState,
    expiresAt: new Date(now.valueOf() + 10 * 60 * 1_000).toISOString(),
    nextRevision: expectedRevision + 1,
    policy: { ...policy },
    providerAuthorityDigest,
    releaseSha: sha256("preflight-smoke-release").slice(0, 40),
    requestId: randomUUID(),
    requestedAt: now.toISOString(),
    runtimeConfigDigest: sha256(
      `preflight-smoke-runtime:${tenantId}:${providerAuthorityDigest}`,
    ),
    tenantId,
    workerRoleName,
    workerRoleOid: NONEXISTENT_WORKER_OID,
  };
}

async function seedFixtures(
  prisma,
  { disabled, absent, suffix, workerRoleName },
) {
  const createdAt = new Date();
  const disabledAt = new Date(createdAt.valueOf() + 1_000);
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `
        INSERT INTO public."Tenant" (
          "id",
          "name",
          "slug",
          "status",
          "customerStage",
          "onboardingStatus",
          "entitlementProfileRevision",
          "executionRevision",
          "createdAt",
          "updatedAt"
        ) VALUES
          (
            $1,
            $2,
            $3,
            'SUSPENDED'::public."TenantLifecycleStatus",
            'BETA'::public."TenantCustomerStage",
            'PROVISIONING'::public."TenantOnboardingStatus",
            0,
            0,
            $4,
            $4
          ),
          (
            $5,
            $6,
            $7,
            'SUSPENDED'::public."TenantLifecycleStatus",
            'BETA'::public."TenantCustomerStage",
            'PROVISIONING'::public."TenantOnboardingStatus",
            0,
            0,
            $4,
            $4
          )
      `,
      disabled.tenantId,
      `preflight-disabled-${suffix}`,
      `preflight-disabled-${suffix}`,
      createdAt,
      absent.tenantId,
      `preflight-absent-${suffix}`,
      `preflight-absent-${suffix}`,
    );
    await transaction.$executeRawUnsafe(
      `
        INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
          "tenantId",
          "workerRoleName",
          "workerRoleOid",
          "policyRevision",
          "enabled",
          "maxAttempts",
          "leaseSeconds",
          "acknowledgeSeconds",
          "baseRetrySeconds",
          "maxRetrySeconds",
          "providerAuthorityDigest",
          "enabledAt",
          "disabledAt",
          "createdAt",
          "updatedAt"
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          false,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $11,
          $12
        )
      `,
      disabled.tenantId,
      workerRoleName,
      BigInt(NONEXISTENT_WORKER_OID),
      disabled.expectedRevision,
      disabled.policy.maxAttempts,
      disabled.policy.leaseSeconds,
      disabled.policy.acknowledgeSeconds,
      disabled.policy.baseRetrySeconds,
      disabled.policy.maxRetrySeconds,
      disabled.providerAuthorityDigest,
      createdAt,
      disabledAt,
    );
  });
}

function assertTenantIsolated(disabledCheck, absentCheck, fixture) {
  assert.equal(disabledCheck.snapshot.tenant.exists, true);
  assert.equal(disabledCheck.snapshot.tenant.id, fixture.disabled.tenantId);
  assert.equal(
    disabledCheck.snapshot.enrollment?.tenantId,
    fixture.disabled.tenantId,
  );
  assert.equal(disabledCheck.result.observed?.enrollment.state, "DISABLED");
  assert.equal(
    disabledCheck.result.observed?.enrollment.revision,
    fixture.disabled.expectedRevision,
  );

  assert.equal(absentCheck.snapshot.tenant.exists, true);
  assert.equal(absentCheck.snapshot.tenant.id, fixture.absent.tenantId);
  assert.equal(absentCheck.snapshot.enrollment, null);
  assert.equal(absentCheck.result.observed?.enrollment.state, "ABSENT");
  assert.equal(absentCheck.result.observed?.enrollment.revision, 0);

  const disabledOutput = JSON.stringify(disabledCheck);
  const absentOutput = JSON.stringify(absentCheck);
  assert.equal(disabledOutput.includes(fixture.absent.tenantId), false);
  assert.equal(absentOutput.includes(fixture.disabled.tenantId), false);
}

function assertReadOnlyResult(check) {
  assert.deepEqual(check.snapshot.transaction, {
    isolation: "REPEATABLE_READ",
    readOnly: true,
  });
  assert.equal(check.result.authorization, false);
  assert.equal(check.result.canMutate, false);
  assert.equal(check.result.inspectionDecision, "BLOCKED");
  assert.ok(check.result.findings.includes("WORKER_ROLE_MISSING"));
  assert.deepEqual(
    identityMailTenantEnrollmentPreflightProhibitedDataFindings(check),
    [],
  );
}

async function verifyTargetPreflight(target, targetUrl, targetState, suffix) {
  const workerRoleName = `lp_imtep_worker_${suffix}`;
  const [roleCollision] = await target.$queryRawUnsafe(
    `
      SELECT pg_catalog.count(*)::INTEGER AS role_count
      FROM pg_catalog.pg_roles
      WHERE rolname = $1
    `,
    workerRoleName,
  );
  assert.equal(Number(roleCollision?.role_count ?? -1), 0);

  const disabledPolicy = Object.freeze({
    acknowledgeSeconds: 90,
    baseRetrySeconds: 10,
    leaseSeconds: 120,
    maxAttempts: 4,
    maxRetrySeconds: 300,
  });
  const absentPolicy = Object.freeze({
    acknowledgeSeconds: 100,
    baseRetrySeconds: 15,
    leaseSeconds: 150,
    maxAttempts: 5,
    maxRetrySeconds: 450,
  });
  const fixture = Object.freeze({
    disabled: Object.freeze({
      expectedRevision: 7,
      policy: disabledPolicy,
      providerAuthorityDigest: sha256(`provider-disabled:${suffix}`),
      tenantId: randomUUID(),
    }),
    absent: Object.freeze({
      expectedRevision: 0,
      policy: absentPolicy,
      providerAuthorityDigest: sha256(`provider-absent:${suffix}`),
      tenantId: randomUUID(),
    }),
  });
  assert.notEqual(
    fixture.disabled.providerAuthorityDigest,
    fixture.absent.providerAuthorityDigest,
  );
  assert.notDeepEqual(fixture.disabled.policy, fixture.absent.policy);

  await seedFixtures(target, { ...fixture, suffix, workerRoleName });
  const tenantIds = [fixture.disabled.tenantId, fixture.absent.tenantId];
  const protectedBefore = await protectedFingerprint(target);
  const fixturesBefore = await fixtureFingerprint(target, tenantIds);
  assert.deepEqual(fixturesBefore, {
    enrollments: {
      count: 1,
      digest: fixturesBefore.enrollments.digest,
    },
    tenants: { count: 2, digest: fixturesBefore.tenants.digest },
  });

  const now = new Date();
  const deploymentMarkerDigest = sha256(`deployment-marker:${suffix}`);
  const disabledConfig = parseIdentityMailTenantEnrollmentPreflightConfig(
    policyEnvironment(
      targetUrl,
      fixture.disabled.providerAuthorityDigest,
      fixture.disabled.policy,
    ),
  );
  const absentConfig = parseIdentityMailTenantEnrollmentPreflightConfig(
    policyEnvironment(
      targetUrl,
      fixture.absent.providerAuthorityDigest,
      fixture.absent.policy,
    ),
  );
  const disabledProposal = buildProposal({
    action: "ENABLE",
    databaseName: targetState.databaseName,
    databaseOid: targetState.databaseOid,
    deploymentMarkerDigest,
    expectedRevision: fixture.disabled.expectedRevision,
    expectedState: "DISABLED",
    now,
    policy: fixture.disabled.policy,
    providerAuthorityDigest: fixture.disabled.providerAuthorityDigest,
    tenantId: fixture.disabled.tenantId,
    workerRoleName,
  });
  const absentProposal = buildProposal({
    action: "ENABLE",
    databaseName: targetState.databaseName,
    databaseOid: targetState.databaseOid,
    deploymentMarkerDigest,
    expectedRevision: fixture.absent.expectedRevision,
    expectedState: "ABSENT",
    now,
    policy: fixture.absent.policy,
    providerAuthorityDigest: fixture.absent.providerAuthorityDigest,
    tenantId: fixture.absent.tenantId,
    workerRoleName,
  });

  const parsedDisabled = parseIdentityMailTenantEnrollmentProposal(
    disabledProposal,
    { now },
  );
  const parsedAbsent = parseIdentityMailTenantEnrollmentProposal(
    absentProposal,
    { now },
  );
  const collectedDisabled = await inspectIdentityMailTenantEnrollmentPreflight(
    target,
    parsedDisabled,
    disabledConfig,
  );
  const checkedDisabled = await checkIdentityMailTenantEnrollmentPreflight(
    target,
    disabledProposal,
    disabledConfig,
    { now },
  );
  assert.deepEqual(collectedDisabled, checkedDisabled.snapshot);

  const collectedAbsent = await inspectIdentityMailTenantEnrollmentPreflight(
    target,
    parsedAbsent,
    absentConfig,
  );
  const checkedAbsent = await checkIdentityMailTenantEnrollmentPreflight(
    target,
    absentProposal,
    absentConfig,
    { now },
  );
  assert.deepEqual(collectedAbsent, checkedAbsent.snapshot);

  assertTenantIsolated(checkedDisabled, checkedAbsent, fixture);
  assertReadOnlyResult(checkedDisabled);
  assertReadOnlyResult(checkedAbsent);

  const protectedAfter = await protectedFingerprint(target);
  const fixturesAfter = await fixtureFingerprint(target, tenantIds);
  assert.deepEqual(protectedAfter, protectedBefore);
  assert.deepEqual(fixturesAfter, fixturesBefore);

  return Object.freeze({
    absentDecision: checkedAbsent.result.inspectionDecision,
    disabledDecision: checkedDisabled.result.inspectionDecision,
    enrollmentFixtureCount: fixturesAfter.enrollments.count,
    protectedRelationCount: Object.keys(protectedAfter).length,
    prohibitedFindingCount: 0,
    tenantFixtureCount: fixturesAfter.tenants.count,
    transaction: Object.freeze({
      isolation: checkedAbsent.snapshot.transaction.isolation,
      readOnly: checkedAbsent.snapshot.transaction.readOnly,
    }),
  });
}

export function runSelfTest() {
  assert.deepEqual(parseArguments([]), { help: false, selfTest: false });
  assert.deepEqual(parseArguments(["--help"]), {
    help: true,
    selfTest: false,
  });
  assert.deepEqual(parseArguments(["--self-test"]), {
    help: false,
    selfTest: true,
  });
  assert.throws(
    () => parseArguments(["--help", "--self-test"]),
    /CLI_ARGUMENT_UNSUPPORTED/u,
  );

  const safe = parseSafeSourceDatabaseUrl(
    "postgresql://operator@127.0.0.1/leetplus_ci?schema=public",
  );
  assert.equal(safe.databaseName, "leetplus_ci");
  assert.equal(
    databaseUrlFor(safe.parsed, "lp_imtep_0123456789abcdef0123456789abcdef_ci"),
    "postgresql://operator@127.0.0.1/lp_imtep_0123456789abcdef0123456789abcdef_ci?schema=public",
  );
  for (const unsafe of [
    "postgresql://db.example.com/leetplus_ci?schema=public",
    "postgresql://127.0.0.1/leetplus?schema=public",
    "postgresql://127.0.0.1/postgres?schema=public",
    "postgresql://127.0.0.1/leetplus_ci?schema=public&sslmode=disable",
  ]) {
    assert.throws(() => parseSafeSourceDatabaseUrl(unsafe));
  }
  assert.throws(() => quoteIdentifier('unsafe"name'));
  assert.equal(
    quoteIdentifier("IdentityMailDeliveryTenantEnrollment"),
    '"IdentityMailDeliveryTenantEnrollment"',
  );

  const now = new Date("2026-08-01T00:00:00.000Z");
  const policy = {
    acknowledgeSeconds: 90,
    baseRetrySeconds: 10,
    leaseSeconds: 120,
    maxAttempts: 4,
    maxRetrySeconds: 300,
  };
  const providerAuthorityDigest = sha256("self-test-provider");
  const config = parseIdentityMailTenantEnrollmentPreflightConfig(
    policyEnvironment(safe.parsed.toString(), providerAuthorityDigest, policy),
  );
  const proposal = buildProposal({
    action: "ENABLE",
    databaseName: "leetplus_ci",
    databaseOid: 16_384,
    deploymentMarkerDigest: sha256("self-test-marker"),
    expectedRevision: 0,
    expectedState: "ABSENT",
    now,
    policy,
    providerAuthorityDigest,
    tenantId: "11111111-1111-4111-8111-111111111111",
    workerRoleName: "lp_imtep_worker_self_test",
  });
  const parsedProposal = parseIdentityMailTenantEnrollmentProposal(proposal, {
    now,
  });
  assert.equal(parsedProposal.authorization, false);
  assert.equal(parsedProposal.canMutate, false);
  assert.match(parsedProposal.contentDigest, SHA_256_PATTERN);
  assert.deepEqual(config.targetPolicy, policy);

  return Object.freeze({
    checks: 20,
    cloneOnly: true,
    script: SCRIPT_NAME,
    sourceDatabaseWrites: false,
    status: "PASS",
  });
}

export async function runSmoke(environment = process.env) {
  assert.equal(environment.NODE_ENV, "test", "Smoke requires NODE_ENV=test.");
  assert.equal(
    environment[CONFIRMATION_ENVIRONMENT],
    REQUIRED_CONFIRMATION,
    `Set ${CONFIRMATION_ENVIRONMENT}=${REQUIRED_CONFIRMATION}.`,
  );

  const { databaseName: sourceDatabaseName, parsed: sourceUrl } =
    parseSafeSourceDatabaseUrl(environment.DATABASE_URL);
  const suffix = randomBytes(16).toString("hex");
  const cloneDatabaseName = `${CLONE_PREFIX}${suffix}_ci`;
  assert.match(cloneDatabaseName, CLONE_PATTERN);
  const sourceDatabaseUrl = sourceUrl.toString();
  const maintenanceUrl = databaseUrlFor(sourceUrl, "postgres");
  const targetUrl = databaseUrlFor(sourceUrl, cloneDatabaseName);
  const maintenance = newPrisma(maintenanceUrl);
  let source = null;
  let target = null;
  let sourceFingerprintBefore = null;
  let sourceFingerprintAfter = null;
  let targetEvidence = null;
  let cloneCreateAttempted = false;
  let cleanupResidue = null;
  let primaryError = null;
  const cleanupErrors = [];

  try {
    source = newPrisma(sourceDatabaseUrl);
    await databaseState(source, sourceDatabaseName);
    sourceFingerprintBefore = await protectedFingerprint(source);
    await source.$disconnect();
    source = null;

    const [maintenanceState] = await maintenance.$queryRawUnsafe(
      `
        SELECT
          pg_catalog.current_database() AS database_name,
          pg_catalog.current_setting('server_version_num')::INTEGER
            AS server_version_number,
          role_state.rolsuper AS is_superuser,
          role_state.rolcreatedb AS can_create_database,
          database_owner.rolname = CURRENT_USER AS source_owned_by_current,
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM pg_catalog.pg_stat_activity AS activity
            WHERE activity.datname = $1
          ) AS source_connection_count,
          (
            SELECT pg_catalog.count(*)::INTEGER
            FROM pg_catalog.pg_database AS collision
            WHERE collision.datname = $2
          ) AS clone_collision_count
        FROM pg_catalog.pg_roles AS role_state
        INNER JOIN pg_catalog.pg_database AS source_database
          ON source_database.datname = $1
        INNER JOIN pg_catalog.pg_roles AS database_owner
          ON database_owner.oid = source_database.datdba
        WHERE role_state.rolname = CURRENT_USER
      `,
      sourceDatabaseName,
      cloneDatabaseName,
    );
    assert.ok(maintenanceState);
    assert.equal(maintenanceState.database_name, "postgres");
    assert.equal(
      Math.floor(Number(maintenanceState.server_version_number) / 10_000),
      16,
    );
    assert.equal(maintenanceState.is_superuser, true);
    assert.equal(maintenanceState.can_create_database, true);
    assert.equal(maintenanceState.source_owned_by_current, true);
    assert.equal(Number(maintenanceState.source_connection_count), 0);
    assert.equal(Number(maintenanceState.clone_collision_count), 0);
    cloneCreateAttempted = true;
    await maintenance.$executeRawUnsafe(
      `CREATE DATABASE ${quoteIdentifier(cloneDatabaseName)} TEMPLATE ${quoteIdentifier(sourceDatabaseName)}`,
    );

    target = newPrisma(targetUrl);
    const targetState = await databaseState(target, cloneDatabaseName);
    targetEvidence = await verifyTargetPreflight(
      target,
      targetUrl,
      targetState,
      suffix,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    if (target !== null) {
      await target.$disconnect().catch((error) => cleanupErrors.push(error));
      target = null;
    }
    if (source !== null) {
      await source.$disconnect().catch((error) => cleanupErrors.push(error));
      source = null;
    }
    if (cloneCreateAttempted) {
      try {
        const [cloneState] = await maintenance.$queryRawUnsafe(
          `
            SELECT
              pg_catalog.count(*)::INTEGER AS database_count,
              pg_catalog.bool_and(
                database_owner.rolname = CURRENT_USER
                AND database_row.datistemplate = false
              ) AS safe_generated_target
            FROM pg_catalog.pg_database AS database_row
            INNER JOIN pg_catalog.pg_roles AS database_owner
              ON database_owner.oid = database_row.datdba
            WHERE database_row.datname = $1
          `,
          cloneDatabaseName,
        );
        const cloneDatabaseCount = Number(cloneState?.database_count ?? -1);
        assert.ok(cloneDatabaseCount === 0 || cloneDatabaseCount === 1);
        if (cloneDatabaseCount === 1) {
          assert.equal(cloneState.safe_generated_target, true);
          await maintenance.$executeRawUnsafe(
            `DROP DATABASE ${quoteIdentifier(cloneDatabaseName)} WITH (FORCE)`,
          );
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (sourceFingerprintBefore !== null) {
      try {
        source = newPrisma(sourceDatabaseUrl);
        await databaseState(source, sourceDatabaseName);
        sourceFingerprintAfter = await protectedFingerprint(source);
        assert.deepEqual(sourceFingerprintAfter, sourceFingerprintBefore);
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        if (source !== null) {
          await source
            .$disconnect()
            .catch((error) => cleanupErrors.push(error));
          source = null;
        }
      }
    }
    try {
      [cleanupResidue] = await maintenance.$queryRawUnsafe(
        `
          SELECT pg_catalog.count(*)::INTEGER AS database_count
          FROM pg_catalog.pg_database
          WHERE datname = $1
        `,
        cloneDatabaseName,
      );
      assert.equal(Number(cleanupResidue?.database_count ?? -1), 0);
    } catch (error) {
      cleanupErrors.push(error);
    }
    await maintenance.$disconnect().catch((error) => cleanupErrors.push(error));
  }

  if (primaryError !== null && cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      "Preflight smoke failed and cleanup was incomplete.",
    );
  }
  if (primaryError !== null) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Preflight smoke cleanup failed.");
  }
  assert.ok(targetEvidence);
  assert.ok(sourceFingerprintAfter);

  return Object.freeze({
    authorization: false,
    canMutate: false,
    cleanup: Object.freeze({ databaseCount: 0 }),
    decisions: Object.freeze({
      absent: targetEvidence.absentDecision,
      disabled: targetEvidence.disabledDecision,
    }),
    fixtures: Object.freeze({
      enrollmentCount: targetEvidence.enrollmentFixtureCount,
      tenantCount: targetEvidence.tenantFixtureCount,
    }),
    preflightWrites: 0,
    prohibitedFindingCount: targetEvidence.prohibitedFindingCount,
    protectedRelationCount: targetEvidence.protectedRelationCount,
    script: SCRIPT_NAME,
    sourceDatabaseWrites: false,
    status: "PASS",
    transaction: targetEvidence.transaction,
  });
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
  } catch {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_SMOKE_FAILED",
        },
        script: SCRIPT_NAME,
        status: "ERROR",
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = await main();
}

import {
  parseIdentityMailTenantEnrollmentProposal,
} from "./identity-mail-tenant-enrollment-contract.mjs";
import {
  evaluateIdentityMailTenantEnrollmentPreflight,
} from "./identity-mail-tenant-enrollment-preflight.mjs";
import {
  inspectIdentityMailWorkerEnrollment,
} from "./identity-mail-worker-enrollment.mjs";

const SHA_256_PATTERN = /^[0-9a-f]{64}$/u;
const SAFE_DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SYSTEM_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);
const POLICY_ENVIRONMENT = Object.freeze({
  acknowledgeSeconds:
    "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_ACKNOWLEDGE_SECONDS",
  baseRetrySeconds:
    "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_BASE_RETRY_SECONDS",
  leaseSeconds: "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_LEASE_SECONDS",
  maxAttempts: "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_ATTEMPTS",
  maxRetrySeconds:
    "IDENTITY_MAIL_TENANT_ENROLLMENT_POLICY_MAX_RETRY_SECONDS",
});
const POLICY_BOUNDS = Object.freeze({
  acknowledgeSeconds: Object.freeze([10, 900]),
  baseRetrySeconds: Object.freeze([1, 3_600]),
  leaseSeconds: Object.freeze([30, 900]),
  maxAttempts: Object.freeze([1, 20]),
  maxRetrySeconds: Object.freeze([1, 86_400]),
});
const TRANSACTION_OPTIONS = Object.freeze({
  isolationLevel: "RepeatableRead",
  maxWait: 5_000,
  timeout: 30_000,
});

export class IdentityMailTenantEnrollmentPreflightDatabaseError extends Error {
  constructor(code) {
    super(code);
    this.name = "IdentityMailTenantEnrollmentPreflightDatabaseError";
    this.code = code;
    this.reasonCode = code;
    this.exitCode = 3;
  }
}

function fail(code) {
  throw new IdentityMailTenantEnrollmentPreflightDatabaseError(code);
}

function requiredString(environment, key) {
  const value = environment?.[key];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    const suffix = key.replace(/^IDENTITY_MAIL_TENANT_ENROLLMENT_/u, "");
    fail(`IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_${suffix}_INVALID`);
  }
  return value;
}

function boundedIntegerEnvironment(environment, field) {
  const key = POLICY_ENVIRONMENT[field];
  const raw = requiredString(environment, key);
  if (!/^[1-9][0-9]*$/u.test(raw)) {
    fail(
      `IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_${key.replace(/^IDENTITY_MAIL_TENANT_ENROLLMENT_/u, "")}_INVALID`,
    );
  }
  const value = Number(raw);
  const [minimum, maximum] = POLICY_BOUNDS[field];
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(
      `IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_${key.replace(/^IDENTITY_MAIL_TENANT_ENROLLMENT_/u, "")}_INVALID`,
    );
  }
  return value;
}

export function parseIdentityMailTenantEnrollmentPreflightConfig(environment) {
  const databaseUrl = requiredString(environment, "DATABASE_URL");
  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    !parsedDatabaseUrl.hostname ||
    parsedDatabaseUrl.hash
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DATABASE_URL_INVALID");
  }
  let username;
  let password;
  let databaseName;
  try {
    username = decodeURIComponent(parsedDatabaseUrl.username);
    password = decodeURIComponent(parsedDatabaseUrl.password);
    databaseName = decodeURIComponent(
      parsedDatabaseUrl.pathname.replace(/^\/+/u, ""),
    );
  } catch {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DATABASE_URL_INVALID");
  }
  if (
    !username ||
    username !== username.trim() ||
    password !== password.trim() ||
    /[\u0000-\u001f\u007f]/u.test(username) ||
    /[\u0000-\u001f\u007f]/u.test(password) ||
    !SAFE_DATABASE_NAME_PATTERN.test(databaseName) ||
    SYSTEM_DATABASE_NAMES.has(databaseName)
  ) {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DATABASE_URL_INVALID");
  }
  const authorityStart = databaseUrl.indexOf("//") + 2;
  const authorityEnd = databaseUrl.indexOf("/", authorityStart);
  const rawAuthority = databaseUrl.slice(
    authorityStart,
    authorityEnd === -1 ? databaseUrl.length : authorityEnd,
  );
  const rawEndpoint = rawAuthority.slice(rawAuthority.lastIndexOf("@") + 1);
  const normalizedEndpoint = parsedDatabaseUrl.port
    ? `${parsedDatabaseUrl.hostname}:${parsedDatabaseUrl.port}`
    : parsedDatabaseUrl.hostname;
  const queryEntries = [...parsedDatabaseUrl.searchParams.entries()];
  if (
    !LOOPBACK_HOSTS.has(parsedDatabaseUrl.hostname) ||
    rawEndpoint !== normalizedEndpoint ||
    queryEntries.length !== 1 ||
    queryEntries[0][0] !== "schema" ||
    queryEntries[0][1] !== "public"
  ) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DATABASE_TRANSPORT_INVALID",
    );
  }

  const providerAuthorityDigest = requiredString(
    environment,
    "IDENTITY_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_DIGEST",
  );
  if (!SHA_256_PATTERN.test(providerAuthorityDigest)) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_PROVIDER_AUTHORITY_DIGEST_INVALID",
    );
  }

  const targetPolicy = Object.freeze({
    acknowledgeSeconds: boundedIntegerEnvironment(
      environment,
      "acknowledgeSeconds",
    ),
    baseRetrySeconds: boundedIntegerEnvironment(
      environment,
      "baseRetrySeconds",
    ),
    leaseSeconds: boundedIntegerEnvironment(environment, "leaseSeconds"),
    maxAttempts: boundedIntegerEnvironment(environment, "maxAttempts"),
    maxRetrySeconds: boundedIntegerEnvironment(
      environment,
      "maxRetrySeconds",
    ),
  });
  if (targetPolicy.maxRetrySeconds < targetPolicy.baseRetrySeconds) {
    fail(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_POLICY_RETRY_ORDER_INVALID",
    );
  }

  return Object.freeze({
    databaseName,
    databaseUrl,
    providerAuthorityDigest,
    targetPolicy,
    transportPolicy: "LOOPBACK_PLAINTEXT",
  });
}

function numberValue(value) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && /^[0-9]+$/u.test(value)) {
    return Number(value);
  }
  return typeof value === "number" ? value : null;
}

function isoValue(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function functionCatalogViolationCount(workerInspection) {
  let count = 0;
  for (const entry of [
    ...workerInspection.allowedFunctions,
    ...workerInspection.deniedFunctions,
  ]) {
    if (!entry.exists) count += 1;
    if (entry.ownerName !== workerInspection.server.databaseOwnerName) {
      count += 1;
    }
    if (entry.actualSecurityDefiner !== entry.securityDefiner) count += 1;
    if (entry.actualVolatility !== entry.volatility) count += 1;
    if (entry.actualLanguage !== entry.language) count += 1;
    if (
      entry.configuration.length !== 1 ||
      entry.configuration[0] !== "search_path=pg_catalog"
    ) {
      count += 1;
    }
  }
  return count;
}

function workerRoleSnapshot(workerInspection, roleName) {
  const role = workerInspection?.role;
  if (role === null || role === undefined) return null;
  const allFunctions = [
    ...workerInspection.allowedFunctions,
    ...workerInspection.deniedFunctions,
  ];
  return Object.freeze({
    name: roleName,
    oid: numberValue(role.oid),
    canLogin: role.canLogin,
    inherits: role.inherits,
    superuser: role.superuser,
    createsDatabase: role.createsDatabase,
    createsRole: role.createsRole,
    replication: role.replication,
    bypassesRls: role.bypassesRls,
    hasRoleConfiguration: role.hasRoleConfiguration,
    databaseConnect: role.databaseConnect,
    databaseCreate: role.databaseCreate,
    databaseTemporary: role.databaseTemporary,
    publicSchemaUsage: role.publicSchemaUsage,
    publicSchemaCreate: role.publicSchemaCreate,
    membershipCount: role.membershipCount,
    roleSettingCount: role.roleSettingCount,
    ownedObjectCount: role.ownershipCount,
    liveActivationBindingCount: role.liveActivationBindingCount,
    liveMarkerBindingCount: role.liveMarkerBindingCount,
    directSchemaCreateCount: role.directSchemaCreateCount,
    effectiveSchemaUsageCount: role.effectiveSchemaUsageCount,
    directRelationPrivilegeCount: role.directRelationPrivilegeCount,
    effectiveRelationPrivilegeCount: role.effectiveRelationPrivilegeCount,
    directColumnPrivilegeCount: role.directColumnPrivilegeCount,
    effectiveColumnPrivilegeCount: role.effectiveColumnPrivilegeCount,
    directSequencePrivilegeCount: role.directSequencePrivilegeCount,
    effectiveSequencePrivilegeCount: role.effectiveSequencePrivilegeCount,
    directFunctionExecuteCount: role.directFunctionExecuteCount,
    effectiveFunctionExecuteCount: role.effectiveFunctionExecuteCount,
    deniedFunctionExecuteCount: workerInspection.deniedFunctions.filter(
      (entry) => entry.effectiveExecute || entry.directExecute,
    ).length,
    publicExecuteFunctionCount: allFunctions.filter(
      (entry) => entry.publicExecute,
    ).length,
    grantOptionFunctionCount: allFunctions.filter(
      (entry) => entry.directGrantOption,
    ).length,
    functionCatalogViolationCount:
      functionCatalogViolationCount(workerInspection),
  });
}

function enrollmentSnapshot(row) {
  if (row?.enrollment_tenant_id === null || row?.enrollment_tenant_id === undefined) {
    return null;
  }
  return Object.freeze({
    tenantId: row.enrollment_tenant_id,
    workerRoleName: row.worker_role_name,
    workerRoleOid: numberValue(row.worker_role_oid),
    policyRevision: Number(row.policy_revision),
    enabled: row.enabled === true,
    maxAttempts: Number(row.max_attempts),
    leaseSeconds: Number(row.lease_seconds),
    acknowledgeSeconds: Number(row.acknowledge_seconds),
    baseRetrySeconds: Number(row.base_retry_seconds),
    maxRetrySeconds: Number(row.max_retry_seconds),
    providerAuthorityDigest: row.provider_authority_digest,
    enabledAt: isoValue(row.enabled_at),
    disabledAt: isoValue(row.disabled_at),
  });
}

function markerSnapshot(row) {
  if (row?.marker_id === null || row?.marker_id === undefined) return null;
  return Object.freeze({
    current: row.marker_current === true,
    payloadDigest: row.marker_payload_digest,
    releaseSha: row.release_sha,
    migrationHead: row.marker_migration_head,
    migrationCount: Number(row.marker_migration_count),
    stateRevision: Number(row.marker_state_revision),
    revokedAt: isoValue(row.marker_revoked_at),
    validAtSnapshot: row.marker_valid_at_snapshot === true,
    validUntil: isoValue(row.marker_valid_until),
    payloadDigestMatches: row.payload_digest_matches === true,
    buildBindingMatches: row.build_binding_matches === true,
    challengeBindingMatches: row.challenge_binding_matches === true,
    databaseIdentityMatches: row.database_identity_matches === true,
    actualContextMatches: row.actual_context_matches === true,
  });
}

async function inspectInsideReadOnlyTransaction(
  transaction,
  parsedProposal,
  config,
) {
  await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  await transaction.$executeRawUnsafe(
    "SET LOCAL statement_timeout = '5000ms'",
  );
  await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '1000ms'");

  const [databaseRow] = await transaction.$queryRawUnsafe(`
    SELECT
      database_row.datname AS database_name,
      database_row.oid::BIGINT AS database_oid,
      pg_catalog.current_setting('server_version_num')::INTEGER
        AS server_version_number,
      pg_catalog.current_setting('transaction_isolation')
        AS transaction_isolation,
      pg_catalog.current_setting('transaction_read_only')::BOOLEAN
        AS transaction_read_only,
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
    CROSS JOIN public."_prisma_migrations" AS migration
    WHERE database_row.datname = pg_catalog.current_database()
    GROUP BY database_row.datname, database_row.oid
  `);

  const [roleExistsRow] = await transaction.$queryRawUnsafe(
    `
      SELECT pg_catalog.count(*)::INTEGER AS role_count
      FROM pg_catalog.pg_roles
      WHERE rolname = $1
    `,
    parsedProposal.workerRoleName,
  );
  let workerInspection = null;
  if (Number(roleExistsRow?.role_count ?? 0) === 1) {
    workerInspection = await inspectIdentityMailWorkerEnrollment(transaction, {
      databaseName: parsedProposal.expectedDatabaseName,
      roleName: parsedProposal.workerRoleName,
      roleOid: parsedProposal.workerRoleOid,
      skipTenantEnrollmentSummary: true,
      transportPolicy: "PREFLIGHT_READ_ONLY",
    });
  }

  const [tenantRow] = await transaction.$queryRawUnsafe(
    `
      SELECT
        tenant."id" IS NOT NULL AS tenant_exists,
        tenant."id" AS tenant_id,
        enrollment."tenantId" AS enrollment_tenant_id,
        enrollment."workerRoleName" AS worker_role_name,
        enrollment."workerRoleOid" AS worker_role_oid,
        enrollment."policyRevision" AS policy_revision,
        enrollment."enabled" AS enabled,
        enrollment."maxAttempts" AS max_attempts,
        enrollment."leaseSeconds" AS lease_seconds,
        enrollment."acknowledgeSeconds" AS acknowledge_seconds,
        enrollment."baseRetrySeconds" AS base_retry_seconds,
        enrollment."maxRetrySeconds" AS max_retry_seconds,
        enrollment."providerAuthorityDigest" AS provider_authority_digest,
        enrollment."enabledAt" AS enabled_at,
        enrollment."disabledAt" AS disabled_at,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."IdentityMailOutbox" AS outbox
          WHERE outbox."tenantId" = $1
            AND outbox."status" =
              'CLAIMED'::public."IdentityMailOutboxStatus"
        ) AS claimed_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."IdentityMailOutbox" AS outbox
          WHERE outbox."tenantId" = $1
            AND outbox."status" =
              'CLAIMED'::public."IdentityMailOutboxStatus"
            AND outbox."providerAttemptedAt" IS NULL
        ) AS unmarked_claimed_count,
        (
          SELECT pg_catalog.count(*)::INTEGER
          FROM public."IdentityMailOutbox" AS outbox
          WHERE outbox."tenantId" = $1
            AND outbox."status" =
              'CLAIMED'::public."IdentityMailOutboxStatus"
            AND outbox."providerAttemptedAt" IS NOT NULL
        ) AS marked_claimed_count
      FROM (SELECT $1::TEXT AS requested_tenant_id) AS requested
      LEFT JOIN public."Tenant" AS tenant
        ON tenant."id" = requested.requested_tenant_id
      LEFT JOIN public."IdentityMailDeliveryTenantEnrollment" AS enrollment
        ON enrollment."tenantId" = requested.requested_tenant_id
    `,
    parsedProposal.tenantId,
  );

  const [markerRow] = await transaction.$queryRawUnsafe(`
    SELECT
      marker."id" AS marker_id,
      (
        state."currentMarkerId" = marker."id"
        AND state."generation" = marker."generation"
      ) AS marker_current,
      marker."payloadDigest" AS marker_payload_digest,
      build."releaseSha" AS release_sha,
      marker."schemaHead" AS marker_migration_head,
      marker."migrationCount" AS marker_migration_count,
      marker."stateRevision" AS marker_state_revision,
      marker."revokedAt" AS marker_revoked_at,
      marker."validUntil" AS marker_valid_until,
      (
        marker."deployedAt" <= pg_catalog.statement_timestamp()
        AND marker."validUntil" > pg_catalog.statement_timestamp()
      ) AS marker_valid_at_snapshot,
      CASE WHEN marker."id" IS NULL THEN false ELSE
        marker."payloadDigest" = pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              public."shared_beta_runtime_canonical_json_v1"(
                marker."payload"
              ),
              'UTF8'
            )
          ),
          'hex'
        )
      END AS payload_digest_matches,
      CASE WHEN build."id" IS NULL THEN false ELSE
        marker."buildProvenanceId" = build."id"
        AND marker."buildPayloadDigest" = build."payloadDigest"
        AND marker."schemaHead" = build."schemaHead"
        AND marker."migrationCount" = build."migrationCount"
        AND marker."migrationManifestDigest" =
          build."migrationManifestDigest"
        AND build."stateRevision" = 1
        AND build."revokedAt" IS NULL
        AND build."validUntil" > pg_catalog.statement_timestamp()
        AND build."payloadDigest" = pg_catalog.encode(
          pg_catalog.sha256(
            pg_catalog.convert_to(
              public."shared_beta_runtime_canonical_json_v1"(
                build."payload"
              ),
              'UTF8'
            )
          ),
          'hex'
        )
      END AS build_binding_matches,
      CASE WHEN challenge."id" IS NULL THEN false ELSE
        marker."challengeId" = challenge."id"
        AND marker."buildProvenanceId" = challenge."buildProvenanceId"
        AND marker."environment" = challenge."environment"
        AND marker."generation" = challenge."candidateGeneration"
        AND marker."predecessorMarkerId" IS NOT DISTINCT FROM
          challenge."predecessorMarkerId"
        AND marker."predecessorMarkerDigest" =
          challenge."predecessorMarkerDigest"
        AND marker."activationDatabaseRole" =
          challenge."activationRoleName"
        AND marker."coordinatorRoleName" = challenge."activationRoleName"
        AND marker."coordinatorRoleOid" = challenge."activationRoleOid"
        AND marker."databaseChallengeDigest" =
          challenge."challengeDigest"
        AND marker."databaseIdentityDigest" =
          challenge."databaseIdentityDigest"
        AND marker."actualContextDigest" = challenge."actualContextDigest"
        AND challenge."stateRevision" = 2
        AND challenge."consumedAt" = marker."createdAt"
      END AS challenge_binding_matches,
      CASE WHEN challenge."id" IS NULL THEN false ELSE
        marker."databaseIdentityDigest" =
          challenge."databaseIdentityDigest"
        AND marker."databaseIdentityDigest" =
          public."shared_beta_runtime_database_identity_digest_v1"(
            challenge."creationNonce"
          )
      END AS database_identity_matches,
      CASE WHEN challenge."id" IS NULL THEN false ELSE
        marker."actualContextDigest" = challenge."actualContextDigest"
        AND marker."actualContextDigest" =
          public."shared_beta_runtime_actual_context_from_challenge_v1"(
            challenge."id"
          )
      END AS actual_context_matches
    FROM public."SharedBetaRuntimeReleaseState" AS state
    LEFT JOIN public."SharedBetaRuntimeReleaseMarker" AS marker
      ON marker."id" = state."currentMarkerId"
    LEFT JOIN public."SharedBetaBuildProvenance" AS build
      ON build."id" = marker."buildProvenanceId"
    LEFT JOIN public."SharedBetaRuntimeReleaseChallenge" AS challenge
      ON challenge."id" = marker."challengeId"
    WHERE state."id" = 'SHARED_BETA_RUNTIME_RELEASE'
  `);

  return Object.freeze({
    transaction: Object.freeze({
      isolation:
        typeof databaseRow?.transaction_isolation === "string"
          ? databaseRow.transaction_isolation.toUpperCase().replaceAll(" ", "_")
          : "UNKNOWN",
      readOnly: databaseRow?.transaction_read_only === true,
    }),
    database: Object.freeze({
      name: databaseRow?.database_name ?? null,
      oid: numberValue(databaseRow?.database_oid),
      postgresMajor: Math.floor(
        Number(databaseRow?.server_version_number ?? 0) / 10_000,
      ),
      migrationHead: databaseRow?.migration_head ?? null,
      migrationCount: Number(databaseRow?.migration_count ?? -1),
      unfinishedMigrationCount: Number(
        databaseRow?.unfinished_migration_count ?? -1,
      ),
    }),
    marker: markerSnapshot(markerRow),
    providerAuthorityDigest: config.providerAuthorityDigest,
    targetPolicy: config.targetPolicy,
    workerRole:
      workerInspection === null
        ? null
        : workerRoleSnapshot(
            workerInspection,
            parsedProposal.workerRoleName,
          ),
    tenant: Object.freeze({
      exists: tenantRow?.tenant_exists === true,
      id: tenantRow?.tenant_id ?? null,
    }),
    enrollment: enrollmentSnapshot(tenantRow),
    drain: Object.freeze({
      claimedCount: Number(tenantRow?.claimed_count ?? -1),
      unmarkedClaimedCount: Number(
        tenantRow?.unmarked_claimed_count ?? -1,
      ),
      markedClaimedCount: Number(tenantRow?.marked_claimed_count ?? -1),
    }),
  });
}

export async function inspectIdentityMailTenantEnrollmentPreflight(
  prisma,
  parsedProposal,
  config,
) {
  if (!prisma || typeof prisma.$transaction !== "function") {
    fail("IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_PRISMA_INVALID");
  }
  try {
    return await prisma.$transaction(
      (transaction) =>
        inspectInsideReadOnlyTransaction(
          transaction,
          parsedProposal,
          config,
        ),
      TRANSACTION_OPTIONS,
    );
  } catch (error) {
    if (error instanceof IdentityMailTenantEnrollmentPreflightDatabaseError) {
      throw error;
    }
    const wrapped = new IdentityMailTenantEnrollmentPreflightDatabaseError(
      "IDENTITY_MAIL_TENANT_ENROLLMENT_PREFLIGHT_DATABASE_INSPECTION_FAILED",
    );
    Object.defineProperty(wrapped, "cause", {
      configurable: false,
      enumerable: false,
      value: error,
      writable: false,
    });
    throw wrapped;
  }
}

export async function checkIdentityMailTenantEnrollmentPreflight(
  prisma,
  proposalInput,
  config,
  { now = new Date() } = {},
) {
  const parsedProposal = parseIdentityMailTenantEnrollmentProposal(
    proposalInput,
    { now },
  );
  const snapshot = await inspectIdentityMailTenantEnrollmentPreflight(
    prisma,
    parsedProposal,
    config,
  );
  const result = evaluateIdentityMailTenantEnrollmentPreflight(
    proposalInput,
    snapshot,
    { now },
  );
  return Object.freeze({ snapshot, result });
}

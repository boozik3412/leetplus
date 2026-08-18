import { createHash } from "node:crypto";

import {
  CURRENT_EXPECTED_LATEST_MIGRATION,
  CURRENT_EXPECTED_MIGRATION_COUNT,
} from "./staff-task-integrity-migration-state.mjs";
import {
  identityMailWorkerEnrollmentComplianceViolations,
  identityMailWorkerEnrollmentPreconditionViolations,
  inspectIdentityMailWorkerEnrollment,
} from "./identity-mail-worker-enrollment.mjs";

export const FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONTRACT =
  "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_V1";
export const FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_MODES = Object.freeze([
  "apply",
  "check",
  "disable",
  "plan",
]);
export const FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY = Object.freeze({
  acknowledgeSeconds: 300,
  baseRetrySeconds: 30,
  leaseSeconds: 60,
  maxAttempts: 5,
  maxRetrySeconds: 900,
});

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_DATABASE = /^[a-z][a-z0-9_]{0,62}$/u;
const SAFE_ROLE = /^[a-z_][a-z0-9_]{2,62}$/u;
const SAFE_ENVIRONMENT = /^(ci|production|staging)$/u;
const SAFE_VIOLATION_CODE = /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/u;
const MAX_POSTGRES_OID = 4_294_967_295n;
const LOCK_DOMAIN = "leetplus:founder-pilot:mail-tenant-enrollment:v1";
const ADAPTERS = new WeakSet();

export class FounderPilotMailTenantEnrollmentError extends Error {
  constructor(reasonCode, violationCodes = []) {
    super(reasonCode);
    this.name = "FounderPilotMailTenantEnrollmentError";
    this.reasonCode = reasonCode;
    this.safeContractError = true;
    this.violationCodes = Object.freeze(
      [...new Set(Array.isArray(violationCodes) ? violationCodes : [])]
        .filter(
          (candidate) =>
            typeof candidate === "string" &&
            SAFE_VIOLATION_CODE.test(candidate),
        )
        .sort()
        .slice(0, 64),
    );
  }
}

function fail(reasonCode, violationCodes) {
  throw new FounderPilotMailTenantEnrollmentError(reasonCode, violationCodes);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function digest(domain, value) {
  return createHash("sha256")
    .update(`${FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONTRACT}\0${domain}\0`)
    .update(stableJson(value))
    .digest("hex");
}

function exactObject(value, keys, reasonCode) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(reasonCode);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(reasonCode);
  }
  return value;
}

function string(value, pattern, reasonCode) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !pattern.test(value)
  ) {
    fail(reasonCode);
  }
  return value;
}

function oid(value) {
  let parsed;
  try {
    parsed = BigInt(value);
  } catch {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ROLE_OID_INVALID");
  }
  if (parsed < 1n || parsed > MAX_POSTGRES_OID) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ROLE_OID_INVALID");
  }
  return parsed;
}

function normalizeRequest(value) {
  exactObject(
    value,
    [
      "confirmation",
      "databaseName",
      "environment",
      "mode",
      "operationId",
      "providerAuthorityDigest",
      "releaseSha",
      "roleName",
      "roleOid",
      "tenantId",
      "transportPolicy",
    ],
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_REQUEST_INVALID",
  );
  if (!FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_MODES.includes(value.mode)) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_MODE_INVALID");
  }
  if (
    !["LOOPBACK_PLAINTEXT", "REMOTE_STRICT_TLS"].includes(value.transportPolicy)
  ) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_TRANSPORT_INVALID");
  }
  const request = Object.freeze({
    confirmation:
      value.confirmation === null
        ? null
        : string(
            value.confirmation,
            /^[A-Za-z0-9_ .:-]{32,1024}$/u,
            "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONFIRMATION_INVALID",
          ),
    databaseName: string(
      value.databaseName,
      SAFE_DATABASE,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_DATABASE_INVALID",
    ),
    environment: string(
      value.environment,
      SAFE_ENVIRONMENT,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ENVIRONMENT_INVALID",
    ),
    mode: value.mode,
    operationId: string(
      value.operationId,
      UUID,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_OPERATION_ID_INVALID",
    ),
    providerAuthorityDigest: string(
      value.providerAuthorityDigest,
      SHA256,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_PROVIDER_AUTHORITY_INVALID",
    ),
    releaseSha: string(
      value.releaseSha,
      SHA1,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_RELEASE_SHA_INVALID",
    ),
    roleName: string(
      value.roleName,
      SAFE_ROLE,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ROLE_INVALID",
    ),
    roleOid: oid(value.roleOid),
    tenantId: string(
      value.tenantId,
      UUID,
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_TENANT_ID_INVALID",
    ),
    transportPolicy: value.transportPolicy,
  });
  if (request.roleName === "public" || request.roleName.startsWith("pg_")) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ROLE_INVALID");
  }
  return request;
}

function planPayload(request) {
  return Object.freeze({
    contractVersion: FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONTRACT,
    databaseName: request.databaseName,
    environment: request.environment,
    migrationCount: CURRENT_EXPECTED_MIGRATION_COUNT,
    migrationHead: CURRENT_EXPECTED_LATEST_MIGRATION,
    operationId: request.operationId,
    policy: FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY,
    providerAuthorityDigest: request.providerAuthorityDigest,
    releaseSha: request.releaseSha,
    roleName: request.roleName,
    roleOid: request.roleOid.toString(),
    tenantId: request.tenantId,
  });
}

export function founderPilotMailTenantEnrollmentPlanDigest(value) {
  return digest("plan", planPayload(normalizeRequest(value)));
}

export function expectedFounderPilotMailTenantEnrollmentConfirmation(value) {
  const request = normalizeRequest({ ...value, confirmation: null });
  const verb = request.mode === "disable" ? "DISABLE" : "APPLY";
  if (!["apply", "disable"].includes(request.mode)) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_MODE_INVALID");
  }
  return [
    verb,
    FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONTRACT,
    request.databaseName,
    request.tenantId,
    request.roleName,
    request.roleOid.toString(),
    request.releaseSha,
    digest("plan", planPayload(request)),
  ].join(" ");
}

function assertConfirmation(request) {
  if (!["apply", "disable"].includes(request.mode)) {
    if (request.confirmation !== null) {
      fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONFIRMATION_UNEXPECTED");
    }
    return;
  }
  const expected = expectedFounderPilotMailTenantEnrollmentConfirmation({
    ...request,
    roleOid: request.roleOid.toString(),
  });
  if (request.confirmation !== expected) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONFIRMATION_INVALID");
  }
}

function workerViolations(snapshot, request) {
  const precondition = identityMailWorkerEnrollmentPreconditionViolations(
    {
      ...snapshot,
      enrollment: { enabledCount: 0, totalCount: 0 },
    },
    {
      databaseName: request.databaseName,
      roleName: request.roleName,
      roleOid: request.roleOid,
      transportPolicy: request.transportPolicy,
    },
  );
  return [
    ...precondition,
    ...identityMailWorkerEnrollmentComplianceViolations(snapshot),
  ];
}

function samePolicy(enrollment) {
  return Object.entries(FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY).every(
    ([key, value]) => enrollment[key] === value,
  );
}

function exactEnrollment(enrollment, request, enabled) {
  return (
    enrollment !== null &&
    enrollment.tenantId === request.tenantId &&
    enrollment.workerRoleName === request.roleName &&
    BigInt(enrollment.workerRoleOid) === request.roleOid &&
    enrollment.providerAuthorityDigest === request.providerAuthorityDigest &&
    enrollment.enabled === enabled &&
    Number.isInteger(enrollment.policyRevision) &&
    enrollment.policyRevision >= 1 &&
    samePolicy(enrollment) &&
    (enabled
      ? enrollment.enabledAt !== null && enrollment.disabledAt === null
      : enrollment.enabledAt !== null && enrollment.disabledAt !== null)
  );
}

function assertOperationalState(state, request) {
  if (state.tenant === null) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_TENANT_NOT_FOUND");
  }
  const tenant = state.tenant;
  if (
    tenant.status !== "ACTIVE" ||
    tenant.customerStage !== "PILOT" ||
    !["OWNER_INVITED", "ONBOARDING"].includes(tenant.onboardingStatus) ||
    tenant.trialStartsAt === null ||
    tenant.trialEndsAt === null ||
    new Date(tenant.trialEndsAt).valueOf() <= state.databaseNow.valueOf()
  ) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_TENANT_STATE_INVALID");
  }
  const activation = state.activation;
  const pendingDelivery =
    tenant.onboardingStatus === "OWNER_INVITED" &&
    activation?.inviteAcceptedAt === null &&
    activation?.inviteRevokedAt === null &&
    activation?.inviteExpiresAt !== null &&
    new Date(activation.inviteExpiresAt).valueOf() >
      state.databaseNow.valueOf() &&
    activation?.outboxStatus === "PENDING" &&
    activation?.outboxReleasedAt !== null &&
    activation?.outboxTerminalAt === null &&
    activation?.outboxHasCiphertext === true;
  const completedDelivery =
    activation?.inviteRevokedAt === null &&
    activation?.outboxStatus === "SENT" &&
    activation?.outboxReleasedAt !== null &&
    activation?.outboxTerminalAt !== null &&
    activation?.outboxHasCiphertext === false;
  if (
    activation === null ||
    activation.tenantId !== request.tenantId ||
    activation.releaseSha !== request.releaseSha ||
    activation.environment !== request.environment ||
    (!["check", "disable"].includes(request.mode)
      ? !pendingDelivery
      : !pendingDelivery && !completedDelivery)
  ) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ACTIVATION_STATE_INVALID");
  }
  if (state.claimedOutboxCount !== 0) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_OUTBOX_CLAIMED");
  }
}

function receipt(request, decision, enrollment, options = {}) {
  const payload = {
    contractVersion: FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CONTRACT,
    databaseName: request.databaseName,
    decision,
    environment: request.environment,
    migrationCount: CURRENT_EXPECTED_MIGRATION_COUNT,
    migrationHead: CURRENT_EXPECTED_LATEST_MIGRATION,
    mode: request.mode,
    operationId: request.operationId,
    planDigest: digest("plan", planPayload(request)),
    policy: FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY,
    policyRevision: enrollment?.policyRevision ?? null,
    providerAuthorityDigest: request.providerAuthorityDigest,
    reconciledAfterLostResponse: options.reconciled === true,
    releaseSha: request.releaseSha,
    replayed: options.replayed === true,
    roleName: request.roleName,
    roleOid: request.roleOid.toString(),
    tenantId: request.tenantId,
  };
  return Object.freeze({
    ...payload,
    receiptDigest: digest("receipt", payload),
  });
}

function validateSnapshot(snapshot, request) {
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    !(snapshot.databaseNow instanceof Date) ||
    Number.isNaN(snapshot.databaseNow.valueOf())
  ) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_SNAPSHOT_INVALID");
  }
  const violations = workerViolations(snapshot.worker, request);
  if (violations.length > 0) {
    fail(
      "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_WORKER_NOT_COMPLIANT",
      violations,
    );
  }
  assertOperationalState(snapshot, request);
}

async function runTransaction(adapter, request, mutate) {
  return adapter.transaction(request, async (gateway) => {
    const before = await gateway.inspect(request);
    validateSnapshot(before, request);
    if (request.mode === "plan") {
      if (before.enrollment !== null) {
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ALREADY_EXISTS");
      }
      return receipt(request, "READY_TO_APPLY", null);
    }
    if (request.mode === "check") {
      if (before.enrollment === null) {
        return receipt(request, "NOT_ENROLLED", null);
      }
      if (exactEnrollment(before.enrollment, request, true)) {
        return receipt(request, "ACTIVE", before.enrollment);
      }
      if (exactEnrollment(before.enrollment, request, false)) {
        return receipt(request, "DISABLED", before.enrollment);
      }
      fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_STATE_DRIFT");
    }
    if (request.mode === "apply") {
      if (before.enrollment !== null) {
        if (exactEnrollment(before.enrollment, request, true)) {
          return receipt(request, "ACTIVE", before.enrollment, {
            replayed: true,
          });
        }
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_STATE_DRIFT");
      }
      if (mutate !== true)
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_MUTATION_DENIED");
      const changed = await gateway.apply(request);
      if (changed !== 1)
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_APPLY_FAILED");
    } else if (request.mode === "disable") {
      if (before.enrollment === null) {
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_NOT_FOUND");
      }
      if (exactEnrollment(before.enrollment, request, false)) {
        return receipt(request, "DISABLED", before.enrollment, {
          replayed: true,
        });
      }
      if (!exactEnrollment(before.enrollment, request, true)) {
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_STATE_DRIFT");
      }
      if (mutate !== true)
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_MUTATION_DENIED");
      const changed = await gateway.disable(request, before.enrollment);
      if (changed !== 1)
        fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_DISABLE_FAILED");
    }
    const after = await gateway.inspect(request);
    validateSnapshot(after, request);
    const expectedEnabled = request.mode === "apply";
    if (!exactEnrollment(after.enrollment, request, expectedEnabled)) {
      fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POSTCONDITION_FAILED");
    }
    return receipt(
      request,
      expectedEnabled ? "ACTIVE" : "DISABLED",
      after.enrollment,
    );
  });
}

async function reconcileLostResponse(adapter, request) {
  return adapter.transaction(request, async (gateway) => {
    const state = await gateway.inspect(request);
    validateSnapshot(state, request);
    const expectedEnabled = request.mode === "apply";
    if (!exactEnrollment(state.enrollment, request, expectedEnabled)) {
      fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_OUTCOME_AMBIGUOUS");
    }
    return receipt(
      request,
      expectedEnabled ? "ACTIVE" : "DISABLED",
      state.enrollment,
      { reconciled: true, replayed: true },
    );
  });
}

export async function runFounderPilotMailTenantEnrollment(value) {
  exactObject(
    value,
    ["adapter", "request"],
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ARGUMENTS_INVALID",
  );
  if (!ADAPTERS.has(value.adapter)) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ADAPTER_INVALID");
  }
  const request = normalizeRequest(value.request);
  assertConfirmation(request);
  try {
    return await runTransaction(value.adapter, request, true);
  } catch (error) {
    if (
      error instanceof FounderPilotMailTenantEnrollmentError ||
      !["apply", "disable"].includes(request.mode)
    ) {
      throw error;
    }
    try {
      return await reconcileLostResponse(value.adapter, request);
    } catch (reconciliationError) {
      if (
        reconciliationError instanceof FounderPilotMailTenantEnrollmentError
      ) {
        throw reconciliationError;
      }
      fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_OUTCOME_AMBIGUOUS");
    }
  }
}

function createAdapter(transaction) {
  if (typeof transaction !== "function") {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ADAPTER_INVALID");
  }
  const adapter = Object.freeze({ transaction });
  ADAPTERS.add(adapter);
  return adapter;
}

export function createFounderPilotMailTenantEnrollmentAdapterForTestOnly(
  transaction,
) {
  return createAdapter(transaction);
}

function normalizeEnrollment(row) {
  if (row === undefined) return null;
  return {
    acknowledgeSeconds: Number(row.acknowledgeSeconds),
    baseRetrySeconds: Number(row.baseRetrySeconds),
    disabledAt: row.disabledAt,
    enabled: row.enabled === true,
    enabledAt: row.enabledAt,
    leaseSeconds: Number(row.leaseSeconds),
    maxAttempts: Number(row.maxAttempts),
    maxRetrySeconds: Number(row.maxRetrySeconds),
    policyRevision: Number(row.policyRevision),
    providerAuthorityDigest: row.providerAuthorityDigest,
    tenantId: row.tenantId,
    workerRoleName: row.workerRoleName,
    workerRoleOid: row.workerRoleOid,
  };
}

async function databaseRead(reasonCode, operation) {
  try {
    return await operation();
  } catch {
    fail(reasonCode);
  }
}

async function inspectDatabaseState(transaction, request) {
  const worker = await databaseRead(
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_WORKER_INSPECTION_FAILED",
    () =>
      inspectIdentityMailWorkerEnrollment(transaction, {
        databaseName: request.databaseName,
        roleName: request.roleName,
        roleOid: request.roleOid,
        skipTenantEnrollmentSummary: true,
        transportPolicy: request.transportPolicy,
      }),
  );
  const tenantRows = await databaseRead(
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_TENANT_INSPECTION_FAILED",
    () =>
      transaction.$queryRawUnsafe(
        `SELECT
       tenant."id",
       tenant."status"::TEXT AS "status",
       tenant."customerStage"::TEXT AS "customerStage",
       tenant."onboardingStatus"::TEXT AS "onboardingStatus",
       tenant."trialStartsAt",
       tenant."trialEndsAt"
     FROM public."Tenant" AS tenant
     WHERE tenant."id" = $1
    FOR UPDATE`,
        request.tenantId,
      ),
  );
  const activationRows = await databaseRead(
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_ACTIVATION_INSPECTION_FAILED",
    () =>
      transaction.$queryRawUnsafe(
        `SELECT
       command."tenantId",
       command."releaseSha",
       command."environment",
       invite."acceptedAt" AS "inviteAcceptedAt",
       invite."revokedAt" AS "inviteRevokedAt",
       invite."expiresAt" AS "inviteExpiresAt",
       outbox."status"::TEXT AS "outboxStatus",
       outbox."releasedAt" AS "outboxReleasedAt",
       outbox."terminalAt" AS "outboxTerminalAt",
       outbox."secretCiphertext" IS NOT NULL AS "outboxHasCiphertext"
     FROM public."FounderOperatorBetaActivationCommand" AS command
     INNER JOIN public."UserInvite" AS invite
       ON invite."tenantId" = command."tenantId"
      AND invite."role" = 'OWNER'::public."UserRole"
      AND invite."accessScope" = 'NETWORK'::public."UserAccessScope"
      AND invite."revokedAt" IS NULL
     INNER JOIN public."IdentityMailOutbox" AS outbox
       ON outbox."tenantId" = invite."tenantId"
      AND outbox."inviteId" = invite."id"
     WHERE command."tenantId" = $1
    FOR UPDATE OF command, invite, outbox`,
        request.tenantId,
      ),
  );
  const enrollmentRows = await databaseRead(
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_REGISTRY_INSPECTION_FAILED",
    () =>
      transaction.$queryRawUnsafe(
        `SELECT *
     FROM public."IdentityMailDeliveryTenantEnrollment"
     WHERE "tenantId" = $1
    FOR UPDATE`,
        request.tenantId,
      ),
  );
  const [claimed] = await databaseRead(
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CLAIM_INSPECTION_FAILED",
    () =>
      transaction.$queryRawUnsafe(
        `SELECT pg_catalog.count(*)::INTEGER AS "claimedOutboxCount"
     FROM public."IdentityMailOutbox"
     WHERE "tenantId" = $1
       AND "status" = 'CLAIMED'::public."IdentityMailOutboxStatus"`,
        request.tenantId,
      ),
  );
  const [clock] = await databaseRead(
    "FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_CLOCK_INSPECTION_FAILED",
    () =>
      transaction.$queryRawUnsafe(
        `SELECT pg_catalog.statement_timestamp() AS "databaseNow"`,
      ),
  );
  return {
    activation: activationRows.length === 1 ? activationRows[0] : null,
    claimedOutboxCount: Number(claimed?.claimedOutboxCount ?? -1),
    databaseNow: clock?.databaseNow,
    enrollment: normalizeEnrollment(enrollmentRows[0]),
    tenant: tenantRows.length === 1 ? tenantRows[0] : null,
    worker,
  };
}

export function createFounderPilotMailTenantEnrollmentPrismaAdapter(prisma) {
  if (
    prisma === null ||
    typeof prisma !== "object" ||
    typeof prisma.$transaction !== "function"
  ) {
    fail("FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_PRISMA_INVALID");
  }
  return createAdapter((request, callback) =>
    prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL statement_timeout = '15000ms'",
        );
        await transaction.$executeRawUnsafe(
          "SET LOCAL lock_timeout = '3000ms'",
        );
        await transaction.$queryRawUnsafe(
          'SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))::TEXT AS "lockReceipt"',
          `${LOCK_DOMAIN}:${request.tenantId}`,
        );
        const gateway = Object.freeze({
          apply: (target) =>
            transaction.$executeRawUnsafe(
              `INSERT INTO public."IdentityMailDeliveryTenantEnrollment" (
                 "tenantId", "workerRoleName", "workerRoleOid",
                 "policyRevision", "enabled", "maxAttempts",
                 "leaseSeconds", "acknowledgeSeconds", "baseRetrySeconds",
                 "maxRetrySeconds", "providerAuthorityDigest", "enabledAt",
                 "disabledAt", "createdAt", "updatedAt"
               ) VALUES (
                 $1, $2, $3::BIGINT, 1, true, $4, $5, $6, $7, $8, $9,
                 pg_catalog.statement_timestamp(), NULL,
                 pg_catalog.statement_timestamp(), pg_catalog.statement_timestamp()
               )`,
              target.tenantId,
              target.roleName,
              target.roleOid.toString(),
              FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY.maxAttempts,
              FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY.leaseSeconds,
              FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY.acknowledgeSeconds,
              FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY.baseRetrySeconds,
              FOUNDER_PILOT_MAIL_TENANT_ENROLLMENT_POLICY.maxRetrySeconds,
              target.providerAuthorityDigest,
            ),
          disable: (target, current) =>
            transaction.$executeRawUnsafe(
              `UPDATE public."IdentityMailDeliveryTenantEnrollment"
               SET "enabled" = false,
                   "policyRevision" = "policyRevision" + 1,
                   "disabledAt" = pg_catalog.statement_timestamp(),
                   "updatedAt" = pg_catalog.statement_timestamp()
               WHERE "tenantId" = $1
                 AND "workerRoleName" = $2
                 AND "workerRoleOid" = $3::BIGINT
                 AND "providerAuthorityDigest" = $4
                 AND "policyRevision" = $5
                 AND "enabled" = true
                 AND "disabledAt" IS NULL`,
              target.tenantId,
              target.roleName,
              target.roleOid.toString(),
              target.providerAuthorityDigest,
              current.policyRevision,
            ),
          inspect: (target) => inspectDatabaseState(transaction, target),
        });
        return callback(gateway);
      },
      {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 30_000,
      },
    ),
  );
}

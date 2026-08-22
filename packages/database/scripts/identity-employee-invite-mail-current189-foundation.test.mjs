import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const databaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(databaseRoot, "..", "..");
const candidateName =
  "20260805030000_identity_employee_invite_mail_boundary_current189";
const candidateDirectory = join(
  databaseRoot,
  "migration-candidates",
  candidateName,
);

const [
  sql,
  metadataText,
  canonicalSchema,
  smoke,
  coordinatorSource,
  gateSource,
  employeeWorkerSource,
  employeeRepositorySource,
  employeeProviderSource,
  employeeRuntimeConfigSource,
  employeeRuntimeHealthSource,
  employeeRuntimeSource,
  usersModuleSource,
  authModuleSource,
  authServiceSource,
  usersServiceSource,
  initialOwnerEnvelopeSource,
  initialOwnerWorkerTypesSource,
  pgReplaySource,
] = await Promise.all([
  readFile(join(candidateDirectory, "migration.sql"), "utf8"),
  readFile(join(candidateDirectory, "candidate.json"), "utf8"),
  readFile(join(databaseRoot, "prisma", "schema.prisma"), "utf8"),
  readFile(
    join(
      databaseRoot,
      "scripts",
      "identity-employee-invite-mail-current189-smoke.sql",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-delivery-coordinator.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "auth",
      "employee-invite-delivery-gate.candidate.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-mail-worker-current189.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-mail-worker-current189.repository.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-mail-provider-current189.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-mail-runtime-current189.config.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-mail-runtime-current189.health.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "users",
      "employee-invite-mail-runtime-current189.ts",
    ),
    "utf8",
  ),
  readFile(
    join(repositoryRoot, "apps", "api", "src", "users", "users.module.ts"),
    "utf8",
  ),
  readFile(
    join(repositoryRoot, "apps", "api", "src", "auth", "auth.module.ts"),
    "utf8",
  ),
  readFile(
    join(repositoryRoot, "apps", "api", "src", "auth", "auth.service.ts"),
    "utf8",
  ),
  readFile(
    join(repositoryRoot, "apps", "api", "src", "users", "users.service.ts"),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "auth",
      "identity-mail-secret-envelope.service.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "src",
      "identity-mail-worker",
      "identity-mail-worker.types.ts",
    ),
    "utf8",
  ),
  readFile(
    join(
      repositoryRoot,
      "apps",
      "api",
      "test",
      "identity-employee-invite-current189.pg.integration-spec.ts",
    ),
    "utf8",
  ),
]);
const metadata = JSON.parse(metadataText);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function includesAll(value, fragments) {
  for (const fragment of fragments) {
    assert.ok(value.includes(fragment), `missing fragment: ${fragment}`);
  }
}

function between(value, start, end) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return value.slice(startIndex, endIndex);
}

test("CURRENT189 remains checksum-bound, noncanonical, and not deployable", () => {
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.contract, "IDENTITY_EMPLOYEE_INVITE_CURRENT189_V1");
  assert.equal(metadata.candidate, candidateName);
  assert.equal(metadata.ordinal, 189);
  assert.equal(
    metadata.predecessor.requiredContract,
    "LANGAME_ONBOARDING_STAGED_RECEIPT_CURRENT188_V1",
  );
  assert.equal(metadata.predecessor.resolved, false);
  for (const key of [
    "authorization",
    "canMutateProduction",
    "canActivateApplicationRoute",
    "canAcceptEmployeeInvite",
    "canSendProvider",
    "applicationRoleAllowlistBound",
    "workerRoleEnrolled",
    "productionApplyAuthorized",
  ]) {
    assert.equal(metadata[key], false, key);
  }
  assert.equal(metadata.status, "NOT_DEPLOYABLE");
  assert.equal(metadata.migrationSqlSha256, sha256(sql));
  assert.equal(sql.trimStart().startsWith("-- CURRENT189"), true);
  assert.equal(sql.trimEnd().endsWith("COMMIT;"), true);
  for (const model of [
    "IdentityEmployeeInviteIssueCommandV1",
    "IdentityEmployeeMailOutboxV1",
    "IdentityEmployeeInviteRevokeCommandV1",
    "IdentityEmployeeMailDeliveryEventV1",
    "IdentityEmployeeMailTenantEnrollmentV1",
  ]) {
    assert.equal(canonicalSchema.includes(`model ${model}`), false, model);
  }
});

test("CURRENT189 uses separate tenant-scoped tables, constraints, indexes, and FORCE RLS", () => {
  includesAll(sql, [
    'CREATE TABLE public."IdentityEmployeeInviteIssueCommandV1"',
    'CREATE TABLE public."IdentityEmployeeMailOutboxV1"',
    'CREATE TABLE public."IdentityEmployeeInviteRevokeCommandV1"',
    'CREATE TABLE public."IdentityEmployeeMailDeliveryEventV1"',
    'CREATE TABLE public."IdentityEmployeeMailTenantEnrollmentV1"',
    'FOREIGN KEY ("tenantId", "actorUserId")',
    'FOREIGN KEY ("tenantId", "inviteId")',
    'CREATE UNIQUE INDEX "identity_employee_issue_actor_request_uidx"',
    'CREATE UNIQUE INDEX "identity_employee_outbox_provider_attempt_uidx"',
    'CREATE INDEX "identity_employee_outbox_ready_idx"',
    '"terminalAckDigest" CHAR(64)',
    'AND "terminalAckDigest" IS NOT NULL',
    "leetplus.employee_invite_tenant_id",
  ]);
  assert.equal(
    (sql.match(/FORCE ROW LEVEL SECURITY;/gu) ?? []).length,
    5,
  );
  assert.equal((sql.match(/CREATE POLICY /gu) ?? []).length, 5);
});

test("CURRENT189 preserves initial-owner objects and keeps a separate envelope domain", () => {
  assert.equal(
    sql.includes('ALTER TABLE public."IdentityMailOutbox"'),
    false,
  );
  assert.equal(
    sql.includes(
      'CREATE FUNCTION public."identity_initial_owner_invite_delivery_assert_sent_v1"',
    ),
    false,
  );
  assert.equal(
    initialOwnerEnvelopeSource.includes(
      "const IDENTITY_MAIL_TEMPLATE = 'INITIAL_OWNER_INVITE'",
    ),
    true,
  );
  assert.equal(
    initialOwnerWorkerTypesSource.includes("template: 'INITIAL_OWNER_INVITE'"),
    true,
  );
  includesAll(coordinatorSource, [
    "EXTERNAL_EMPLOYEE_INVITE_DELIVERY_CURRENT189_V1",
    "EMPLOYEE_INVITE_MAIL_TEMPLATE",
  ]);
});

test("CURRENT189 requires admitted tenant, fresh NETWORK OWNER, and effective manage_users", () => {
  const actorAssertion = between(
    sql,
    'CREATE FUNCTION public."identity_employee_invite_actor_assert_current189_v1"',
    'CREATE FUNCTION public."identity_employee_invite_deliver_current189_v1"',
  );
  includesAll(actorAssertion, [
    "leetplus:identity-mail-tenant:v1:",
    "pg_catalog.pg_advisory_xact_lock",
    'tenant."status"::TEXT = \'ACTIVE\'',
    'tenant."customerStage"::TEXT IN (\'PILOT\', \'BETA\', \'LIVE\')',
    'entitlement."module"::TEXT = \'USERS_ROLES\'',
    'entitlement."readEnabled" = TRUE',
    'entitlement."writeEnabled" = TRUE',
    'actor."role" = \'OWNER\'::public."UserRole"',
    'actor."accessScope" = \'NETWORK\'::public."UserAccessScope"',
    'FROM public."UserRoleOverride" AS role_override',
    "'manage_users' = ANY(role_override.\"permissions\")",
    'FROM public."Tenant" AS tenant_lock',
    'FROM public."TenantModuleEntitlement" AS entitlement_lock',
    'FROM public."User" AS actor_lock',
    'FROM public."UserStoreAccess" AS actor_store_lock',
    'ORDER BY entitlement_lock."id" COLLATE "C"',
  ]);
  assert.ok(
    actorAssertion.indexOf("server_now := pg_catalog.clock_timestamp()") >
      actorAssertion.indexOf('ORDER BY actor_store_lock."storeId" COLLATE "C"'),
    "actor clock must be sampled after the complete authority lock set",
  );
  assert.equal(
    (sql.match(/server_now TIMESTAMP\(3\) WITH TIME ZONE;/gu) ?? []).length,
    8,
  );
  assert.equal(
    (sql.match(/server_now := pg_catalog\.clock_timestamp\(\);/gu) ?? [])
      .length,
    8,
  );
  includesAll(coordinatorSource, [
    "hasCapability(actor, 'manage_users')",
    "freshNetworkAuthority.assertNetwork(actor)",
    "fresh.mode !== 'NETWORK'",
  ]);
});

test("CURRENT189 semantic replay ignores new secret material but rejects command drift", () => {
  const replay = between(
    sql,
    "SELECT command.*",
    "IF p_operation = 'ISSUE_EMPLOYEE_INVITE' THEN",
  );
  includesAll(replay, [
    'command."actorUserId" = p_actor_user_id',
    'command."requestId" = p_request_id',
    'replay_command."requestDigest" IS DISTINCT FROM p_request_digest',
    'persisted_invite."email" = canonical_email',
    'persisted_invite."fullName" IS NOT DISTINCT FROM p_full_name',
    'persisted_invite."tokenHash" = replay_command."tokenHash"',
    "'decision', 'REPLAYED'",
    "'inviteId', replay_command.\"inviteId\"",
    "'outboxId', replay_command.\"outboxId\"",
    "PENDING is the immutable status captured by the original command",
  ]);
  assert.equal(
    replay.includes(
      'replay_command."tokenHash" IS DISTINCT FROM p_token_hash',
    ),
    false,
  );
  assert.equal(replay.includes('replay_command."id" = p_command_id'), false);
  assert.equal(sql.includes('"recipientDigest"'), false);
  assert.equal(sql.includes("recipient_digest"), false);
  assert.equal(
    sql.includes(
      "sha256(pg_catalog.convert_to(canonical_email, 'UTF8'))",
    ),
    false,
  );
});

test("CURRENT189 issue/reissue/revoke bind identity claim, delegated scope, and ciphertext erasure", () => {
  includesAll(sql, [
    'p_role = \'OWNER\'',
    "p_access_scope NOT IN ('NETWORK', 'STORES')",
    "pg_catalog.cardinality(p_store_ids) > 100",
    'custom_role."tenantId" = p_tenant_id',
    'store."tenantId" = p_tenant_id',
    'store."isActive" = TRUE',
    'public."identity_email_claim_reserve_invite_v2"',
    'public."identity_email_claim_transition_v2"',
    "Employee invite reissue cannot widen scope",
    '"status" = \'CANCELED\'',
    '"secretCiphertext" = NULL',
    "'REISSUED'",
    'public."identity_email_claim_release_v2"',
    "'REVOKED_BY_OWNER'",
  ]);
});

test("CURRENT189 provider boundary is enrolled, drainable, lost-response safe, and lock bounded", () => {
  includesAll(sql, [
    'enrollment."workerRoleName" IS DISTINCT FROM session_user',
    'SELECT role.oid',
    'WHERE role.rolname = session_user',
    'enrollment."providerAuthorityDigest"',
    'enrollment."state" <> \'ACTIVE\'',
    "FOR UPDATE SKIP LOCKED",
    '"providerAttemptKey" = p_provider_attempt_key',
    '"secretCiphertext" = NULL',
    '"ciphertextClearedAt" = server_now',
    '"terminalAckDigest" = CASE',
    'outbox_record."terminalAckDigest" =',
    "'SMTP_OUTCOME_AMBIGUOUS'",
    "marker_request_digest || E'\\nPROVIDER_MARKER_CONFLICT'",
    "'decision', 'MARKED'",
    "'decision', 'HANDOFF'",
    "'PROVIDER_AMBIGUOUS'",
    "'RECONCILIATION_REQUIRED'",
    "'PRE_PROVIDER_RETRY'",
    "p_batch_limit NOT BETWEEN 1 AND 100",
  ]);
});

test("CURRENT189 preview/accept gate requires exact current SENT provenance", () => {
  const gate = between(
    sql,
    'CREATE FUNCTION\n  public."identity_employee_invite_delivery_assert_sent_current189_v1"',
    "REVOKE ALL ON TABLE",
  );
  includesAll(gate, [
    "leetplus:identity-mail-tenant:v1:",
    'source."tokenHash" = target_invite."tokenHash"',
    'identity_claim."claimType" =',
    "'INVITE'::public.\"IdentityEmailClaimType\"",
    'sent_event."eventType" = \'SENT\'',
    'sent_event."reasonCode" = \'SMTP_ACCEPTED\'',
    'target_outbox."status" = \'SENT\'',
    'target_outbox."secretCiphertext" IS NULL',
    'target_outbox."terminalAckDigest" IS NOT NULL',
    'sent_event."requestDigest" = pg_catalog.encode(',
    'FROM public."UserAccessRole" AS custom_role_lock',
    'FROM public."Store" AS store_lock',
    'allowed_store."isActive" = TRUE',
    'target_invite."revokedAt" IS NULL',
    'target_invite."expiresAt" > server_now',
  ]);
  assert.ok(
    gate.indexOf("server_now := pg_catalog.clock_timestamp()") >
      gate.indexOf(
        'public."identity_email_claim_lock_v1"(canonical_email)',
      ),
    "acceptance clock must be sampled after tenant/scope/invite/mailbox locks",
  );
  includesAll(gateSource, [
    "DORMANT_TEST_ONLY",
    "process.env.NODE_ENV === 'production'",
    "identity_employee_invite_delivery_assert_sent_current189_v1",
    "EMPLOYEE_INVITE_DELIVERY_NOT_SENT",
  ]);
  assert.equal(authModuleSource.includes("EmployeeInviteDeliveryGateCandidate"), false);
  assert.equal(authServiceSource.includes("EmployeeInviteDeliveryGateCandidate"), false);
});

test("CURRENT189 exposes no authority or secret through runtime routes and receipts", () => {
  assert.equal(/^\s*GRANT\b/imu.test(sql), false);
  includesAll(sql, [
    "REVOKE ALL ON TABLE",
    "REVOKE ALL ON FUNCTION",
    "NO RUNTIME GRANTS",
  ]);
  assert.equal(usersModuleSource.includes("EmployeeInviteDeliveryCoordinator"), false);
  assert.equal(
    usersModuleSource.includes("EmployeeInviteMailWorkerCurrent189"),
    false,
  );
  assert.equal(coordinatorSource.includes("@Injectable()"), false);
  assert.equal(gateSource.includes("@Injectable()"), false);
  assert.equal(employeeWorkerSource.includes("@Injectable()"), false);
  assert.equal(employeeRepositorySource.includes("@Injectable()"), false);
  assert.equal(employeeProviderSource.includes("@Injectable()"), false);
  assert.equal(employeeRuntimeSource.includes("@Injectable()"), false);
  assert.equal(employeeRuntimeSource.includes("process.once"), true);
  assert.equal(employeeRuntimeSource.includes("NestFactory"), false);
  assert.equal(employeeRuntimeSource.includes("bootstrap()"), false);
  assert.equal(
    /executionMode:\s*["']PRODUCTION["']/u.test(coordinatorSource),
    false,
  );
  includesAll(usersServiceSource, [
    "assertGenericIdentityMutationAllowed",
    "registrationUrl",
  ]);
  includesAll(coordinatorSource, [
    "EMPLOYEE_INVITE_COORDINATOR_DORMANT",
    "secretCiphertext.fill(0)",
    "DELIVERY_RECEIPT_FIELDS",
  ]);
  includesAll(employeeWorkerSource, [
    "process.env.NODE_ENV === 'production'",
    "claim.secretCiphertext.fill(0)",
    "examined < this.config.batchSize",
    "EMPLOYEE_INVITE_MAIL_RECONCILIATION_REQUIRED",
  ]);
  includesAll(employeeRepositorySource, [
    "Prisma.TransactionIsolationLevel.ReadCommitted",
    "leetplus:identity-mail-tenant:v1:",
    "SETTLEMENT_ATTEMPTS = 2",
    "identity_employee_mail_provider_mark_current189_v1",
    "identity_employee_mail_complete_current189_v1",
  ]);
  includesAll(employeeProviderSource, [
    "StrictEmployeeInviteMailProviderCurrent189",
    "employee-invite-",
    "disableFileAccess: true",
    "disableUrlAccess: true",
  ]);
  includesAll(employeeRuntimeConfigSource, [
    "EMPLOYEE_INVITE_MAIL_RUNTIME_CURRENT189_STATUS",
    "NOT_DEPLOYABLE",
    "process.env",
    "NODE_ENV === 'production'",
    "IDENTITY_EMPLOYEE_INVITE_SMTP_PASSWORD",
    "IDENTITY_EMPLOYEE_INVITE_ENCRYPTION_KEY",
    "IDENTITY_EMPLOYEE_INVITE_MAIL_WORKER_CURRENT189_PROVIDER_AUTHORITY_DIGEST",
    "hasExactDatabaseLoopbackAuthority",
    "EMPLOYEE_INVITE_MAIL_RUNTIME_SECRET_DOMAIN_COLLISION",
  ]);
  includesAll(employeeRuntimeHealthSource, [
    "127.0.0.1",
    "candidateStatus: 'NOT_DEPLOYABLE'",
    "'cache-control': 'no-store'",
    "inflight: 0 | 1",
    "EMPLOYEE_INVITE_MAIL_RUNTIME_FAILED",
  ]);
  includesAll(employeeRuntimeSource, [
    "Dormant bounded process seam",
    "maxCycles",
    "SIGTERM",
    "beginGlobalDrain",
    "killGlobal",
    "EMPLOYEE_INVITE_MAIL_RUNTIME_CLOSE_WITH_INFLIGHT",
  ]);
  assert.equal(
    employeeProviderSource.includes("implements IdentityMailSmtpProvider"),
    false,
  );
});

test("CURRENT189 PostgreSQL smoke covers replay, authority, delivery, revocation, and zero residue", () => {
  includesAll(smoke, [
    "ROLLBACK;",
    "CURRENT189 accepted OWNER with revoked manage_users",
    "ARRAY['manage_users']::TEXT[]",
    "CURRENT189 issue replay failed",
    "repeat('a', 64)",
    "repeat('2', 64)",
    "CURRENT189 accepted changed replay requestDigest",
    "CURRENT189 accepted changed replay mailbox",
    "CURRENT189 reissue/cancel failed",
    "CURRENT189 revoke/release failed",
    "CURRENT189 provider mark replay failed",
    "CURRENT189 provider marker conflict evidence failed",
    "CURRENT189 provider complete replay failed",
    "CURRENT189 accepted changed terminal ack replay",
    "CURRENT189 pending invite passed SENT gate",
    "CURRENT189 exact SENT preview/accept gate failed",
    "CURRENT189 inactive delegated store passed SENT gate",
    "CURRENT189 deleted custom role passed SENT gate",
    "CURRENT189 revoked SENT invite passed acceptance gate",
    "CURRENT189 ambiguous reap quarantine failed",
    "CURRENT189 ambiguous terminal replay failed",
    "CURRENT189 accepted changed ambiguous terminal ack",
    "CURRENT189 unmarked retry failed",
    "CURRENT189 DRAINING claim fence failed",
  ]);
  includesAll(pgReplaySource, [
    "run-identity-employee-invite-current189-postgres-replay",
    "/^lp_emp189_[0-9a-f]{32}_ci$/u",
    "class CommitThenLoseDriver extends CapturingDriver",
    "database response lost after commit",
    "runWhileWaitingForTenantLock",
    "runWhileWaitingForTenantRowLock",
    "waitForAdvisoryLock",
    "waitForNonAdvisoryRowLock",
    "TenantLifecycleStatus.SUSPENDED",
    "CURRENT189 stale tenant row-lock clock was accepted",
    "'DRAINING'",
    "INTERVAL '300 milliseconds'",
    "pg_catalog.pg_sleep(0.75)",
    'outboxStatus: \'PENDING\'',
    "secondInput.tokenHash).not.toBe(firstInput.tokenHash",
    "secondInput.secretCiphertext).not.toEqual",
    "secondInput.commandId).not.toBe(firstInput.commandId",
    "EMPLOYEE_INVITE_PRECONDITION_FAILED",
    "CURRENT189 replay fixture left database residue",
  ]);
});

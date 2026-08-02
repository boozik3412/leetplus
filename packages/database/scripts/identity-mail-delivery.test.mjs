import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const statusMigrationUrl = new URL(
  "../prisma/migrations/20260731010000_identity_mail_delivery_status_expand/migration.sql",
  import.meta.url,
);
const boundaryMigrationUrl = new URL(
  "../prisma/migrations/20260731020000_initial_owner_mail_delivery_boundary/migration.sql",
  import.meta.url,
);
const releaseHeadMigrationUrl = new URL(
  "../prisma/migrations/20260731120000_identity_mail_delivery_release_head/migration.sql",
  import.meta.url,
);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);
const upgradeSmokeUrl = new URL(
  "./identity-mail-delivery-upgrade-smoke.mjs",
  import.meta.url,
);

const EXACT_STATUS_LABELS = Object.freeze([
  "HOLD",
  "PENDING",
  "CLAIMED",
  "RETRY",
  "SENT",
  "DEAD",
  "CANCELED",
  "RECONCILIATION_REQUIRED",
]);

async function sources() {
  const [statusSql, boundarySql, releaseHeadSql, schema, smoke] =
    await Promise.all([
      readFile(statusMigrationUrl, "utf8"),
      readFile(boundaryMigrationUrl, "utf8"),
      readFile(releaseHeadMigrationUrl, "utf8"),
      readFile(schemaUrl, "utf8"),
      readFile(upgradeSmokeUrl, "utf8"),
    ]);
  return { statusSql, boundarySql, releaseHeadSql, schema, smoke };
}

function functionBody(sql, functionName, nextMarker) {
  const start = sql.indexOf(`"${functionName}"`);
  assert.notEqual(start, -1, `${functionName} is missing`);
  const end = sql.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `${functionName} end marker is missing`);
  return sql.slice(start, end);
}

test("CURRENT_175 is an isolated enum-only transaction", async () => {
  const { statusSql } = await sources();
  assert.match(statusSql, /^BEGIN;/u);
  assert.match(statusSql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(statusSql, /SET LOCAL statement_timeout = '30s';/u);
  assert.match(statusSql, /COMMIT;\s*$/u);
  assert.match(
    statusSql,
    /ARRAY\['HOLD', 'PENDING'\]::TEXT\[\][\s\S]*ALTER TYPE public\."IdentityMailOutboxStatus"/u,
  );
  for (const label of EXACT_STATUS_LABELS.slice(2)) {
    assert.match(
      statusSql,
      new RegExp(`ADD VALUE '${label}'`, "u"),
      `${label} must be added by CURRENT_175`,
    );
  }
  assert.doesNotMatch(statusSql, /\bCREATE\s+(?:TABLE|FUNCTION|TRIGGER)\b/iu);
  assert.doesNotMatch(
    statusSql,
    /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:TABLE\s+)?public\."IdentityMailOutbox"/iu,
  );
  assert.doesNotMatch(statusSql, /^\s*GRANT\b/imu);
});

test("CURRENT_176 is transactional and requires the exact CURRENT_175 enum", async () => {
  const { boundarySql } = await sources();
  assert.match(boundarySql, /^BEGIN;/u);
  assert.match(boundarySql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(boundarySql, /SET LOCAL statement_timeout = '180s';/u);
  assert.match(boundarySql, /COMMIT;\s*$/u);
  for (const label of EXACT_STATUS_LABELS) {
    assert.match(boundarySql, new RegExp(`'${label}'`, "u"));
  }
  assert.match(
    boundarySql,
    /IdentityMailOutboxStatus must be exact CURRENT_175 delivery enum/u,
  );
  assert.match(
    boundarySql,
    /DROP FUNCTION public\."identity_mail_outbox_release_guard_v1"\(\)/u,
  );
  assert.match(
    boundarySql,
    /CREATE FUNCTION public\."identity_mail_outbox_delivery_guard_v1"\(\)/u,
  );
  assert.match(
    boundarySql,
    /LOCK TABLE[\s\S]*public\."IdentityMailOutbox"[\s\S]*IN ACCESS EXCLUSIVE MODE;[\s\S]*IF EXISTS \([\s\S]*FROM public\."IdentityMailOutbox"[\s\S]*LEGACY_RECIPIENT_AAD_REISSUE_REQUIRED[\s\S]*ERRCODE = '55000'/u,
  );
});

test("CURRENT_176 upgrades the authoritative identity email canonical boundary", async () => {
  const { boundarySql } = await sources();
  assert.match(
    boundarySql,
    /DROP CONSTRAINT "IdentityEmailClaim_email_canonical_check"[\s\S]*ADD CONSTRAINT "IdentityEmailClaim_email_canonical_check" CHECK/u,
  );
  assert.match(
    boundarySql,
    /split_part\("emailCanonical", '@', 1\)[\s\S]*BETWEEN 1 AND 64[\s\S]*\(\^\\\.\|\\\.\$\|\\\.\\\.\)[\s\S]*BETWEEN 3 AND 253[\s\S]*\{0,61\}/u,
  );
  const lockBody = functionBody(
    boundarySql,
    "identity_email_claim_lock_v1",
    'DROP TRIGGER "IdentityMailOutbox_release_guard_trigger"',
  );
  assert.match(
    lockBody,
    /local_part :=[\s\S]*domain_part :=[\s\S]*char_length\(local_part\) NOT BETWEEN 1 AND 64[\s\S]*char_length\(domain_part\) NOT BETWEEN 3 AND 253/u,
  );
  assert.match(
    boundarySql,
    /identity_claim_constraint_count <> 1[\s\S]*identity email canonical constraint is incomplete/u,
  );
});

test("creates the exact canary enrollment and append-only event relations", async () => {
  const { boundarySql, schema } = await sources();
  assert.match(
    boundarySql,
    /CREATE TABLE public\."IdentityMailDeliveryTenantEnrollment"[\s\S]*PRIMARY KEY \("tenantId"\)/u,
  );
  assert.match(
    boundarySql,
    /"workerRoleName" VARCHAR\(63\) NOT NULL[\s\S]*"workerRoleOid" BIGINT NOT NULL[\s\S]*"providerAuthorityDigest" CHAR\(64\) NOT NULL/u,
  );
  assert.match(
    boundarySql,
    /CREATE TABLE public\."IdentityMailDeliveryEvent"[\s\S]*"transitionRevision" BIGINT NOT NULL[\s\S]*"actorDigest" CHAR\(64\)[\s\S]*"eventDigest" CHAR\(64\) NOT NULL/u,
  );
  assert.match(
    boundarySql,
    /identity_mail_delivery_event_transition_uidx[\s\S]*"tenantId",[\s\S]*"outboxId",[\s\S]*"transitionRevision"/u,
  );
  assert.match(
    boundarySql,
    /Identity mail delivery event ledger is append-only[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    boundarySql,
    /Identity mail worker enrollment cannot be deleted[\s\S]*Identity mail worker enrollment CAS is invalid/u,
  );
  assert.match(schema, /model IdentityMailDeliveryTenantEnrollment \{/u);
  assert.match(schema, /model IdentityMailDeliveryEvent \{/u);
  assert.match(
    schema,
    /model IdentityMailDeliveryEvent \{[\s\S]*actorDigest\s+String\?\s+@db\.Char\(64\)/u,
  );
});

test("rejects every legacy recipient-AAD outbox before changing CURRENT_175", async () => {
  const { boundarySql } = await sources();
  assert.doesNotMatch(
    boundarySql,
    /UPDATE public\."IdentityMailOutbox"[\s\S]*"availableAt" = "releasedAt"/u,
  );
  assert.match(
    boundarySql,
    /"attempts" INTEGER NOT NULL DEFAULT 0[\s\S]*"leaseVersion" INTEGER NOT NULL DEFAULT 0[\s\S]*"transitionRevision" BIGINT NOT NULL DEFAULT 0/u,
  );
  assert.match(
    boundarySql,
    /"providerAttemptKey" VARCHAR\(96\)[\s\S]*"providerAuthorityDigest" CHAR\(64\)[\s\S]*ALTER COLUMN "secretCiphertext" DROP NOT NULL/u,
  );
});

test("seals the outbox state machine and erases ciphertext at the provider marker", async () => {
  const { boundarySql } = await sources();
  const outboxGuardBody = functionBody(
    boundarySql,
    "identity_mail_outbox_delivery_guard_v1",
    'CREATE FUNCTION public."identity_mail_delivery_event_append_v1"',
  );
  assert.match(
    outboxGuardBody,
    /TG_OP = 'INSERT'[\s\S]*NEW\."status" IS DISTINCT FROM[\s\S]*'HOLD'[\s\S]*NEW\."updatedAt" := NEW\."createdAt"[\s\S]*RETURN NEW/u,
  );
  assert.match(
    boundarySql,
    /IdentityMailOutbox_delivery_guard_trigger"[\s\S]*BEFORE INSERT OR UPDATE OR DELETE/u,
  );
  assert.match(
    boundarySql,
    /IdentityMailOutbox_delivery_counter_check[\s\S]*"leaseVersion" = "attempts"[\s\S]*"transitionRevision" >= 0/u,
  );
  assert.match(
    boundarySql,
    /IdentityMailOutbox_delivery_state_check[\s\S]*'RETRY'[\s\S]*'SENT'[\s\S]*'RECONCILIATION_REQUIRED'/u,
  );
  const markerBody = functionBody(
    boundarySql,
    "identity_initial_owner_mail_provider_mark_v1",
    'CREATE FUNCTION public."identity_initial_owner_mail_complete_v1"',
  );
  assert.match(
    markerBody,
    /"providerAttemptKey" = p_provider_attempt_key[\s\S]*"providerAuthorityDigest" = p_provider_authority_digest[\s\S]*"secretCiphertext" = NULL[\s\S]*"ciphertextClearedAt" = now_at/u,
  );
  assert.match(
    markerBody,
    /"leaseExpiresAt" <= now_at[\s\S]*Identity mail provider marker CAS is stale[\s\S]*ERRCODE = '40001'/u,
  );
  assert.match(
    markerBody,
    /FROM public\."UserInvite"[\s\S]*FOR SHARE OF target_invite[\s\S]*IdentityEmailClaim[\s\S]*target_invite\."tokenHash" = outbox_record\."tokenHash"/u,
  );
  assert.match(
    markerBody,
    /"providerAttemptKey" = NULL[\s\S]*'decision', 'CANCELED'[\s\S]*'reasonCode', 'NOT_DELIVERABLE'/u,
  );
  assert.match(
    boundarySql,
    /"secretCiphertext" IS NOT NULL\s+AND pg_catalog\.octet_length\("secretCiphertext"\) = 71/u,
  );
});

test("pins the five worker RPC signatures, readiness receipt and exact role/OID enrollment", async () => {
  const { boundarySql } = await sources();
  assert.match(
    boundarySql,
    /identity_initial_owner_mail_claim_v1"\(\s*p_tenant_id TEXT,\s*p_lease_owner_digest TEXT,\s*p_lease_token_digest TEXT,\s*p_worker_config_digest TEXT\s*\)/u,
  );
  assert.match(
    boundarySql,
    /identity_initial_owner_mail_provider_mark_v1"\(\s*p_outbox_id TEXT,\s*p_expected_lease_version INTEGER,\s*p_lease_owner_digest TEXT,\s*p_lease_token_digest TEXT,\s*p_provider_attempt_key TEXT,\s*p_provider_authority_digest TEXT,\s*p_message_id_digest TEXT\s*\)/u,
  );
  assert.match(
    boundarySql,
    /identity_initial_owner_mail_complete_v1"\(\s*p_outbox_id TEXT,\s*p_expected_lease_version INTEGER,\s*p_lease_owner_digest TEXT,\s*p_lease_token_digest TEXT,\s*p_outcome_code TEXT,\s*p_provider_receipt_digest TEXT,\s*p_terminal_ack_digest TEXT\s*\)/u,
  );
  assert.match(
    boundarySql,
    /identity_initial_owner_mail_reap_v1"\(\s*p_tenant_id TEXT,\s*p_worker_config_digest TEXT,\s*p_worker_actor_digest TEXT,\s*p_batch_limit INTEGER\s*\)/u,
  );
  const workerAssert = functionBody(
    boundarySql,
    "identity_mail_delivery_worker_assert_v1",
    'CREATE FUNCTION public."identity_initial_owner_mail_claim_v1"',
  );
  assert.match(
    workerAssert,
    /worker_role\.rolname = session_user[\s\S]*worker_role\.oid::BIGINT = enrollment\."workerRoleOid"/u,
  );
  assert.match(
    workerAssert,
    /session_user <> current_user[\s\S]*worker_role\.rolcanlogin = true[\s\S]*worker_role\.rolinherit = false/u,
  );
  assert.match(workerAssert, /FOR SHARE OF enrollment/u);
  assert.match(
    workerAssert,
    /'operation', 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER'[\s\S]*'decision', 'READY'[\s\S]*'tenantId', p_tenant_id[\s\S]*'migrationHead', migration_head[\s\S]*'migrationCount', migration_count/u,
  );
  assert.match(
    workerAssert,
    /migration_count IS DISTINCT FROM 176[\s\S]*20260731020000_initial_owner_mail_delivery_boundary/u,
  );
});

test("CURRENT_179 replaces only worker readiness at the terminal release head", async () => {
  const { releaseHeadSql } = await sources();
  assert.match(releaseHeadSql, /^BEGIN;/u);
  assert.match(releaseHeadSql, /COMMIT;\s*$/u);
  assert.match(
    releaseHeadSql,
    /completed_migration_count IS DISTINCT FROM 178[\s\S]*20260731110000_guest_game_case_reward_contract/u,
  );
  assert.match(
    releaseHeadSql,
    /preterminal_manifest_digest IS DISTINCT FROM[\s\S]*7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14/u,
  );
  assert.match(
    releaseHeadSql,
    /string_agg\([\s\S]*migration\."migration_name" \|\| ' ' \|\| migration\."checksum"[\s\S]*ORDER BY migration\."migration_name" COLLATE "C"/u,
  );
  assert.match(
    releaseHeadSql,
    /CREATE OR REPLACE FUNCTION public\."identity_mail_delivery_worker_assert_v1"/u,
  );
  assert.match(
    releaseHeadSql,
    /ORDER BY[\s\S]*migration\."started_at" DESC[\s\S]*migration\."migration_name" DESC/u,
  );
  assert.match(
    releaseHeadSql,
    /migration_count IS DISTINCT FROM 179[\s\S]*20260731120000_identity_mail_delivery_release_head/u,
  );
  assert.match(
    releaseHeadSql,
    /'preterminalManifestDigest', preterminal_manifest_digest/u,
  );
  assert.match(
    releaseHeadSql,
    /routine\.proowner <> migration_owner_oid[\s\S]*routine EXECUTE authority is unsafe/u,
  );
  assert.match(
    releaseHeadSql,
    /3ecf0e405a247be8b891975af7a9b209f9af83d7377368da1a4d718fcd577a54[\s\S]*routine\.prosrc[\s\S]*a8912b95b9dbd7197acd97981b88bae680bf80d3f820a13c569110c1efa49f37/u,
  );
  assert.doesNotMatch(
    releaseHeadSql,
    /CREATE OR REPLACE FUNCTION public\."identity_initial_owner_mail_(?:claim|provider_mark|complete|reap)_v1"/u,
  );
});

test("claim is tenant-scoped, configuration-bound and concurrency-safe", async () => {
  const { boundarySql } = await sources();
  const claimBody = functionBody(
    boundarySql,
    "identity_initial_owner_mail_claim_v1",
    'CREATE FUNCTION public."identity_initial_owner_mail_provider_mark_v1"',
  );
  assert.match(
    claimBody,
    /p_worker_config_digest <>[\s\S]*policy ->> 'providerAuthorityDigest'[\s\S]*ERRCODE = '42501'/u,
  );
  assert.match(
    claimBody,
    /target_outbox\."tenantId" = p_tenant_id[\s\S]*target_tenant\."customerStage" =[\s\S]*'PILOT'/u,
  );
  assert.match(
    claimBody,
    /target_invite\."tokenHash" = target_outbox\."tokenHash"[\s\S]*IdentityEmailClaim[\s\S]*split_part\(target_invite\."email", '@', 1\)[\s\S]*BETWEEN 1 AND 64/u,
  );
  assert.match(claimBody, /FOR UPDATE OF target_outbox SKIP LOCKED[\s\S]*LIMIT 1/u);
  assert.match(
    claimBody,
    /"status" = 'CLAIMED'[\s\S]*"attempts" = next_attempt[\s\S]*"leaseVersion" = next_attempt/u,
  );
});

test("pre-marker failures retry while marked ambiguity is quarantined", async () => {
  const { boundarySql } = await sources();
  const completeBody = functionBody(
    boundarySql,
    "identity_initial_owner_mail_complete_v1",
    'CREATE FUNCTION public."identity_initial_owner_mail_reap_v1"',
  );
  assert.match(
    completeBody,
    /'PRE_PROVIDER_RETRY'[\s\S]*next_status := 'RETRY'[\s\S]*'PRE_PROVIDER_TRANSIENT'/u,
  );
  assert.match(
    completeBody,
    /'PROVIDER_AMBIGUOUS'[\s\S]*'RECONCILIATION_REQUIRED'[\s\S]*'PROVIDER_OUTCOME_AMBIGUOUS'/u,
  );
  assert.match(
    completeBody,
    /LEAST\(\s*\(policy ->> 'maxRetrySeconds'\)::NUMERIC,[\s\S]*\(policy ->> 'baseRetrySeconds'\)::NUMERIC[\s\S]*\)::INTEGER/u,
  );
  const reapBody = functionBody(
    boundarySql,
    "identity_initial_owner_mail_reap_v1",
    'CREATE FUNCTION\n  public."identity_initial_owner_invite_delivery_assert_sent_v1"',
  );
  assert.match(
    reapBody,
    /target_outbox\."tenantId" = p_tenant_id[\s\S]*FOR UPDATE OF target_outbox SKIP LOCKED/u,
  );
  assert.match(
    reapBody,
    /p_worker_config_digest IS DISTINCT FROM[\s\S]*providerAuthorityDigest[\s\S]*ERRCODE = '42501'/u,
  );
  assert.match(
    reapBody,
    /"providerAttemptKey" IS NOT NULL[\s\S]*'RECONCILIATION_REQUIRED'[\s\S]*'REAP_AMBIGUOUS'[\s\S]*'PROVIDER_ACK_TIMEOUT'/u,
  );
  assert.match(
    reapBody,
    /target_outbox\."status" IN \([\s\S]*'PENDING'[\s\S]*'RETRY'[\s\S]*'REAP_CANCELED'[\s\S]*'REAP_DEAD'/u,
  );
  assert.match(
    reapBody,
    /leetplus\.identity_mail_delivery_actor_digest[\s\S]*p_worker_actor_digest/u,
  );
  assert.match(
    reapBody,
    /LEAST\(\s*\(policy ->> 'maxRetrySeconds'\)::NUMERIC,[\s\S]*\(policy ->> 'baseRetrySeconds'\)::NUMERIC[\s\S]*\)::INTEGER/u,
  );
});

test("initial-owner acceptance requires exact SENT evidence but ordinary invites remain unaffected", async () => {
  const { boundarySql } = await sources();
  const guardBody = functionBody(
    boundarySql,
    "identity_initial_owner_invite_accept_sent_guard_v1",
    'CREATE TRIGGER "UserInvite_initial_owner_delivery_sent_guard_trigger"',
  );
  assert.match(
    guardBody,
    /TG_OP = 'INSERT'[\s\S]*cannot be inserted as accepted[\s\S]*OLD\."role" = 'OWNER'[\s\S]*OR \([\s\S]*NEW\."role" = 'OWNER'[\s\S]*IF NOT EXISTS \([\s\S]*IdentityMailOutbox[\s\S]*IdentityMailDeliveryEvent/u,
  );
  assert.match(
    guardBody,
    /sent_event\."toStatus" =[\s\S]*'SENT'[\s\S]*sent_event\."eventType" IN \([\s\S]*'PROVIDER_ACCEPTED'[\s\S]*'RECONCILED_SENT'/u,
  );
  assert.match(
    guardBody,
    /Initial owner invite cannot be accepted before verified delivery[\s\S]*ERRCODE = '55000'/u,
  );
  assert.match(
    guardBody,
    /OLD\."id" IS DISTINCT FROM NEW\."id"[\s\S]*OLD\."tenantId" IS DISTINCT FROM NEW\."tenantId"[\s\S]*OLD\."role" IS DISTINCT FROM NEW\."role"[\s\S]*OLD\."tokenHash" IS DISTINCT FROM NEW\."tokenHash"[\s\S]*identity cannot change during acceptance/u,
  );
  assert.match(
    guardBody,
    /db_accepted_at := pg_catalog\.clock_timestamp\(\)[\s\S]*NEW\."acceptedAt" := db_accepted_at/u,
  );
  assert.match(
    guardBody,
    /IdentityEmailClaim[\s\S]*NEW\."revokedAt" IS NULL[\s\S]*NEW\."expiresAt" > db_accepted_at[\s\S]*target_tenant\."trialEndsAt" > db_accepted_at[\s\S]*target_outbox\."expiresAt" > db_accepted_at[\s\S]*target_outbox\."terminalAt" =[\s\S]*target_outbox\."sentAt"/u,
  );
  assert.match(
    boundarySql,
    /CREATE TRIGGER "UserInvite_initial_owner_unaccepted_insert_guard_trigger"[\s\S]*BEFORE INSERT/u,
  );
});

test("keeps every delivery object private and grants no runtime authority", async () => {
  const { boundarySql } = await sources();
  assert.doesNotMatch(boundarySql, /^\s*GRANT\b/imu);
  for (const tableName of [
    "IdentityMailDeliveryTenantEnrollment",
    "IdentityMailDeliveryEvent",
    "IdentityMailOutbox",
  ]) {
    assert.match(
      boundarySql,
      new RegExp(
        `REVOKE ALL\\s+ON TABLE public\\."${tableName}"\\s+FROM PUBLIC`,
        "u",
      ),
    );
  }
  for (const functionName of [
    "identity_initial_owner_mail_claim_v1",
    "identity_initial_owner_mail_provider_mark_v1",
    "identity_initial_owner_mail_complete_v1",
    "identity_initial_owner_mail_reap_v1",
    "identity_initial_owner_invite_delivery_assert_sent_v1",
    "identity_initial_owner_mail_reconcile_v1",
  ]) {
    assert.match(
      boundarySql,
      new RegExp(
        `REVOKE ALL[\\s\\S]{0,180}"${functionName}"`,
        "u",
      ),
    );
  }
  assert.match(
    boundarySql,
    /unsafe_relation_acl_count <> 0[\s\S]*unsafe_column_acl_count <> 0[\s\S]*unsafe_function_acl_count <> 0[\s\S]*CURRENT_176 inherited unsafe default privileges/u,
  );
  assert.match(
    boundarySql,
    /invalid_function_catalog_count[\s\S]*prosecdef[\s\S]*proconfig IS DISTINCT FROM[\s\S]*invalid_trigger_catalog_count[\s\S]*tgenabled/u,
  );
});

test("real upgrade smoke encodes all three histories through CURRENT_179", async () => {
  const { smoke } = await sources();
  for (const marker of [
    "cleanMigrationState",
    "upgradeMigrationState",
    "rejectedMigrationExitStatuses",
    "legacyRecipientAad",
    "malformedClaim",
    "hostileColumnAcl",
    "claimDecisions",
    "nullInputSqlStateCases",
    "acceptanceDeniedCases",
    "revokeRaceMarkerDecision",
    "markerRaceMarkerDecision",
    "lifecycleReapProcessed",
    "lifecycleTerminalReasons",
    "maximumRetryPolicy",
    "holdWriterCompatibility",
    "actorAttributedEvents",
    "tenantEnrollments",
    "hostileFunctionBody",
    "wrongPre176Checksum",
    "postTerminalPre176ChecksumWorkerAssertSqlState",
    "postTerminalPre176ChecksumWorkerEffects",
    "readyPreterminalManifestDigest",
  ]) {
    assert.match(smoke, new RegExp(marker, "u"));
  }
  assert.doesNotMatch(smoke, /clean176: true|upgrade174To175To176: true/u);
  assert.match(smoke, /CURRENT_174_COUNT = 174/u);
  assert.match(smoke, /CURRENT_175_COUNT = 175/u);
  assert.match(smoke, /CURRENT_176_COUNT = 176/u);
  assert.match(smoke, /CURRENT_177_COUNT = 177/u);
  assert.match(smoke, /CURRENT_178_COUNT = 178/u);
  assert.match(smoke, /CURRENT_179_COUNT = 179/u);
  assert.match(
    smoke,
    /PRETERMINAL_178_MANIFEST_DIGEST[\s\S]*7f9867971a39e010b2dac03be18fc083dabe67b98d1d6ed15a0cc4540a8cfd14/u,
  );
  assert.match(smoke, /identityCheckpointHead: CURRENT_176/u);
  assert.match(smoke, /migrationHead: CURRENT_179/u);
  assert.match(smoke, /originPreTerminalOrder/u);
  assert.match(smoke, /productionRestartDrainGate/u);
  assert.match(smoke, /NOT_PROVEN_BY_SYNTHETIC_FIXTURE/u);
  assert.match(smoke, /identity_initial_owner_mail_claim_v1[\s\S]*TEXT, TEXT, TEXT, TEXT/u);
  assert.match(smoke, /identity_initial_owner_mail_reap_v1[\s\S]*TEXT, TEXT, TEXT, INTEGER/u);
  assert.match(
    smoke,
    /LEGACY_RECIPIENT_AAD_REISSUE_REQUIRED[\s\S]*readCurrent176RollbackFingerprint/u,
  );
  assert.match(
    smoke,
    /attempts" = 3[\s\S]*ATTEMPT_BUDGET_EXHAUSTED[\s\S]*REAP_DEAD/u,
  );
  assert.match(
    smoke,
    /maxAttempts: 20[\s\S]*baseRetrySeconds: 3_600[\s\S]*maxRetrySeconds: 86_400[\s\S]*completionRetrySeconds[\s\S]*reaperRetrySeconds/u,
  );
  assert.match(
    smoke,
    /REVOKE CREATE, TEMPORARY ON DATABASE[\s\S]*CREATE TEMP TABLE "identity_mail_delivery_temp_probe"/u,
  );
});

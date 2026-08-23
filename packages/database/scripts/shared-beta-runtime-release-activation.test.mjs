import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const migrationUrl = new URL(
  "../prisma/migrations/20260730040000_shared_beta_runtime_release_activation/migration.sql",
  import.meta.url,
);
const schemaUrl = new URL("../prisma/schema.prisma", import.meta.url);

async function migrationSql() {
  return readFile(migrationUrl, "utf8");
}

async function prismaSchema() {
  return readFile(schemaUrl, "utf8");
}

const runtimeTestDatabaseUrl =
  process.env.SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_TEST_DATABASE_URL?.trim();

function functionBlock(sql, functionName) {
  const create = `CREATE FUNCTION public."${functionName}"`;
  const replace = `CREATE OR REPLACE FUNCTION\n  public."${functionName}"`;
  const start = Math.max(sql.indexOf(create), sql.indexOf(replace));
  assert.notEqual(start, -1, `${functionName} is missing`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${functionName} terminator is missing`);
  return sql.slice(start, end + 4);
}

function modelBlock(schema, modelName) {
  const start = schema.indexOf(`model ${modelName} {`);
  assert.notEqual(start, -1, `${modelName} is missing`);
  const end = schema.indexOf("\n}", start);
  assert.notEqual(end, -1, `${modelName} terminator is missing`);
  return schema.slice(start, end + 2);
}

function assertOrdered(haystack, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const next = haystack.indexOf(needle, cursor + 1);
    assert.notEqual(next, -1, `${needle} is missing`);
    assert.ok(next > cursor, `${needle} is out of order`);
    cursor = next;
  }
}

test("CURRENT_174 is transactional, additive, dormant, and PII-safe", async () => {
  const sql = await migrationSql();

  assert.match(sql, /^BEGIN;/u);
  assert.match(sql, /SET LOCAL lock_timeout = '5s';/u);
  assert.match(sql, /SET LOCAL statement_timeout = '180s';/u);
  assert.match(sql, /COMMIT;\s*$/u);
  assert.match(
    sql,
    /status_labels IS DISTINCT FROM ARRAY\['HOLD', 'PENDING'\]::TEXT\[\]/u,
  );
  assert.doesNotMatch(sql, /^\s*GRANT\b/imu);
  assert.doesNotMatch(sql, /^\s*(?:CREATE|ALTER|DROP)\s+ROLE\b/imu);
  assert.doesNotMatch(sql, /^\s*SET\s+ROLE\b/imu);
  assert.doesNotMatch(sql, /pg_catalog\.chr\(0\)/u);
  assert.match(
    functionBlock(sql, "shared_beta_runtime_migration_state_v1"),
    /pg_catalog\.string_agg\([\s\S]*pg_catalog\.convert_to\([\s\S]*'\\x00'::BYTEA[\s\S]*'\\x0a'::BYTEA/u,
  );
  assert.doesNotMatch(
    sql,
    /\b(?:smtp|nodemailer|sendmail|registrationUrl|rawEmail|rawToken)\b/iu,
  );

  for (const relation of [
    "SharedBetaBuildProvenance",
    "SharedBetaRuntimeReleaseChallenge",
    "SharedBetaRuntimeReleaseMarker",
    "SharedBetaRuntimeReleaseState",
    "SharedBetaTenantActivationCommand",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\."${relation}"`, "u"));
  }
  assert.match(
    sql,
    /CREATE UNLOGGED TABLE public\."SharedBetaRuntimeInstanceAnchor"/u,
  );
  assert.match(
    sql,
    /ALTER TABLE public\."IdentityMailOutbox"\s+ADD COLUMN "releasedAt"/u,
  );
  for (const legacyInternalRoutine of [
    "assert_staff_attachment_state",
    "check_staff_attachment_binding_state",
    "check_staff_attachment_row_state",
    "check_store_access_scope_invariants",
    "check_user_access_scope_invariants",
    "check_user_store_access_invariants",
    "ensure_guest_game_reward_claim_deadline",
    "guard_guest_bonus_ledger_reward_claim",
    "lock_staff_attachment_binding_delete",
    "prepare_staff_attachment_binding",
    "resolve_staff_attachment_resource_scope",
    "serialize_store_tenant_change",
    "serialize_user_access_scope_change",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL\\s+ON FUNCTION public\\."${legacyInternalRoutine}"`,
        "u",
      ),
    );
  }
});

test("build, deployment, and trial authority stay independently bound", async () => {
  const sql = await migrationSql();
  const build = functionBlock(sql, "shared_beta_build_provenance_persist_v1");
  const marker = functionBlock(
    sql,
    "shared_beta_runtime_release_marker_persist_v1",
  );

  assert.match(sql, /SHARED_BETA_BUILD_PROVENANCE_V1/u);
  assert.match(sql, /SHARED_BETA_RUNTIME_RELEASE_PROVENANCE_V1/u);
  assert.match(build, /SHARED_BETA_TRIAL_V1/u);
  assert.match(
    build,
    /candidate_trial_duration_seconds NOT BETWEEN 3600 AND 7776000/u,
  );
  assert.match(sql, /SHARED_BETA_DEPLOYMENT_PROVENANCE_V1/u);
  assert.match(marker, /build_record\."signingKeyId" = signing_key_id/u);
  assert.match(
    marker,
    /build_record\."publicKeyFingerprint" = key_fingerprint/u,
  );
  assert.match(marker, /challenge_record\."activationRoleOid"/u);
  assert.match(marker, /state_record\."stateRevision"/u);
  assert.match(marker, /state_record\."currentMarkerId"/u);
});

test("dedicated activation role assertion rejects every ambient authority", async () => {
  const sql = await migrationSql();
  const body = functionBlock(
    sql,
    "shared_beta_runtime_activation_role_assert_v1",
  );

  for (const property of [
    "rolcanlogin",
    "rolinherit",
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
    "rolbypassrls",
  ]) {
    assert.match(body, new RegExp(`role_record\\.${property}`, "u"));
  }
  assert.match(body, /FROM pg_catalog\.pg_auth_members/u);
  assert.match(body, /FROM pg_catalog\.pg_shdepend/u);
  assert.match(body, /FROM pg_catalog\.pg_db_role_setting/u);
  assert.match(body, /pg_catalog\.has_table_privilege/u);
  assert.match(body, /pg_catalog\.has_column_privilege/u);
  assert.match(body, /pg_catalog\.has_sequence_privilege/u);
  assert.match(body, /pg_catalog\.has_schema_privilege/u);
  assert.match(
    body,
    /FROM pg_catalog\.pg_type AS type_object[\s\S]*INNER JOIN pg_catalog\.pg_namespace AS namespace[\s\S]*namespace\.nspname NOT IN \('pg_catalog', 'information_schema'\)[\s\S]*type_object\.typisdefined[\s\S]*type_object\.typtype IN \('d', 'e'\)[\s\S]*pg_catalog\.has_type_privilege\(\s*expected_role_oid::OID,\s*type_object\.oid,\s*'USAGE'\s*\)/u,
  );
  assert.match(body, /namespace\.nspowner = expected_role_oid::OID/u);
  assert.match(body, /procedure\.proowner = expected_role_oid::OID/u);
  assert.match(body, /pg_catalog\.pg_init_privs/u);
  assert.match(body, /pg_catalog\.has_database_privilege/u);
  assert.match(body, /SELECT 'system_nonbootstrap_relation'/u);
  assert.match(body, /SELECT 'system_nonbootstrap_column'/u);
  assert.match(
    body,
    /system_nonbootstrap_relation'[\s\S]*relation\.oid >= 16384[\s\S]*pg_catalog\.has_table_privilege/u,
  );
  assert.match(
    body,
    /system_nonbootstrap_column'[\s\S]*relation\.oid >= 16384[\s\S]*pg_catalog\.has_column_privilege/u,
  );
  assert.match(body, /pg_catalog\.has_server_privilege/u);
  assert.match(body, /pg_catalog\.has_foreign_data_wrapper_privilege/u);
  assert.match(body, /pg_catalog\.has_parameter_privilege/u);
  assert.match(body, /pg_catalog\.has_tablespace_privilege/u);
  assert.match(body, /FROM pg_catalog\.pg_largeobject_metadata/u);
  assert.match(body, /procedure\.prosecdef/u);
  assert.match(body, /procedure\.oid >= 16384/u);
  assert.match(
    body,
    /pg_catalog\.to_regprocedure\(\s*'public\."shared_beta_tenant_activate_v1"\(text,text,text,text,text,text,text,text,text,text,text,text,text,text,bytea,timestamp with time zone\)'/u,
  );
  assert.match(
    body,
    /privilege\.grantee NOT IN \([\s\S]*procedure\.proowner,[\s\S]*expected_role_oid::OID/u,
  );
  assert.match(body, /coordinator_activation_acl_count NOT BETWEEN 0 AND 1/u);
  assert.match(body, /coordinator_function_count <> 1/u);
  assert.doesNotMatch(
    body,
    /namespace\.nspname = 'public'[\s\S]*procedure\.proname <>/u,
  );
  assert.doesNotMatch(body, /dependency\.deptype = 'e'/u);
});

test("build provenance replay exact-matches every persisted candidate field and constant", async () => {
  const sql = await migrationSql();
  const build = functionBlock(sql, "shared_beta_build_provenance_persist_v1");
  const replayStart = build.indexOf("IF FOUND THEN");
  const replayEnd = build.indexOf(
    "RETURN pg_catalog.jsonb_build_object",
    replayStart,
  );
  assert.ok(replayStart >= 0 && replayStart < replayEnd);
  const replay = build.slice(replayStart, replayEnd);

  assert.match(build, /WHERE build\."id" = build_id\s+FOR UPDATE/u);
  for (const exactMatch of [
    /persisted\."stateRevision" <> 1/u,
    /persisted\."revokedAt" IS NOT NULL/u,
    /persisted\."validUntil" <= written_at/u,
    /persisted\."authorityDomain" IS DISTINCT FROM\s*'SHARED_BETA_BUILD'/u,
    /persisted\."contractVersion" IS DISTINCT FROM\s*'SHARED_BETA_BUILD_PROVENANCE_V1'/u,
    /persisted\."releaseSha"::TEXT IS DISTINCT FROM release_sha/u,
    /persisted\."buildTime" IS DISTINCT FROM build_time/u,
    /persisted\."builtAt" IS DISTINCT FROM candidate_built_at/u,
    /persisted\."artifactContentDigest"::TEXT IS DISTINCT FROM\s*artifact_digest/u,
    /persisted\."releaseManifestDigest"::TEXT IS DISTINCT FROM\s*release_manifest_digest/u,
    /persisted\."schemaHead"::TEXT IS DISTINCT FROM schema_head/u,
    /persisted\."migrationCount" IS DISTINCT FROM\s*candidate_migration_count/u,
    /persisted\."migrationManifestDigest"::TEXT IS DISTINCT FROM\s*migration_manifest_digest/u,
    /persisted\."policyManifestDigest"::TEXT IS DISTINCT FROM\s*policy_manifest_digest/u,
    /persisted\."trialPolicyVersion"::TEXT IS DISTINCT FROM\s*trial_policy_version/u,
    /persisted\."trialDurationSeconds" IS DISTINCT FROM\s*candidate_trial_duration_seconds/u,
    /persisted\."buildReferenceDigest"::TEXT IS DISTINCT FROM\s*build_reference_digest/u,
    /persisted\."payloadDigest" IS DISTINCT FROM payload_digest/u,
    /persisted\."payload" IS DISTINCT FROM candidate_payload/u,
    /persisted\."signatureAlgorithm"::TEXT IS DISTINCT FROM\s*candidate_signature_algorithm/u,
    /persisted\."signingKeyId"::TEXT IS DISTINCT FROM signing_key_id/u,
    /persisted\."publicKeyFingerprint"::TEXT IS DISTINCT FROM\s*key_fingerprint/u,
    /persisted\."signatureBase64url" IS DISTINCT FROM\s*signature_base64url/u,
    /persisted\."validUntil" IS DISTINCT FROM candidate_valid_until/u,
  ]) {
    assert.match(replay, exactMatch);
  }
  assert.match(
    replay,
    /RAISE EXCEPTION 'Shared beta build provenance replay conflicts'\s+USING ERRCODE = '23505'/u,
  );
});

test("build, challenge, and marker replays fail closed when authority is stale", async () => {
  const sql = await migrationSql();
  const build = functionBlock(sql, "shared_beta_build_provenance_persist_v1");
  const challenge = functionBlock(
    sql,
    "shared_beta_runtime_release_challenge_create_v1",
  );
  const marker = functionBlock(
    sql,
    "shared_beta_runtime_release_marker_persist_v1",
  );

  assert.match(
    build,
    /IF FOUND THEN[\s\S]*persisted\."stateRevision" <> 1[\s\S]*persisted\."revokedAt" IS NOT NULL[\s\S]*persisted\."validUntil" <= written_at/u,
  );
  assert.match(
    challenge,
    /IF FOUND THEN[\s\S]*persisted\."expectedStateRevision" IS DISTINCT FROM[\s\S]*state_record\."stateRevision"/u,
  );
  assert.match(
    challenge,
    /persisted\."candidateGeneration" IS DISTINCT FROM[\s\S]*state_record\."generation" \+ 1/u,
  );
  assert.match(
    challenge,
    /persisted\."databaseIdentityDigest" IS DISTINCT FROM[\s\S]*database_identity_digest/u,
  );
  assert.match(
    challenge,
    /persisted\."migrationManifestDigest" IS DISTINCT FROM[\s\S]*migration_state ->> 'migrationManifestDigest'/u,
  );
  assert.match(
    marker,
    /IF FOUND THEN[\s\S]*persisted\."stateRevision" <> 1[\s\S]*persisted\."revokedAt" IS NOT NULL[\s\S]*persisted\."validUntil" <= written_at/u,
  );
  assert.match(
    marker,
    /state_record\."currentMarkerId" IS DISTINCT FROM persisted\."id"/u,
  );
  assert.match(
    marker,
    /IF FOUND THEN[\s\S]*shared_beta_runtime_migration_state_v1[\s\S]*shared_beta_runtime_database_identity_digest_v1[\s\S]*shared_beta_runtime_actual_context_from_challenge_v1[\s\S]*deployment marker replay actual context drifted[\s\S]*'decision', 'REPLAYED'/u,
  );
});

test("actual runtime context is instance-bound and re-derives live database identity", async () => {
  const sql = await migrationSql();
  const identity = functionBlock(
    sql,
    "shared_beta_runtime_database_identity_digest_v1",
  );
  const context = functionBlock(
    sql,
    "shared_beta_runtime_actual_context_assert_v1",
  );

  const anchorGuard = functionBlock(
    sql,
    "shared_beta_runtime_instance_anchor_guard_v1",
  );

  assert.match(identity, /LANGUAGE plpgsql\s+VOLATILE/u);
  assert.match(identity, /pg_catalog\.pg_control_system\(\)/u);
  assert.match(
    identity,
    /FROM public\."SharedBetaRuntimeInstanceAnchor" AS anchor/u,
  );
  assert.match(identity, /instance_anchor_count <> 1/u);
  assert.match(identity, /pg_catalog\.pg_postmaster_start_time\(\)/u);
  assert.match(identity, /instanceAnchorNonce/u);
  assert.match(identity, /postmasterStartedAtEpochMs/u);
  assert.match(
    sql,
    /INSERT INTO public\."SharedBetaRuntimeInstanceAnchor"[\s\S]*ON CONFLICT \("id"\) DO NOTHING/u,
  );
  assert.match(
    sql,
    /CREATE TRIGGER "SharedBetaRuntimeInstanceAnchor_row_guard_trigger"[\s\S]*BEFORE UPDATE OR DELETE/u,
  );
  assert.match(
    sql,
    /CREATE TRIGGER "SharedBetaRuntimeInstanceAnchor_truncate_guard_trigger"[\s\S]*BEFORE TRUNCATE/u,
  );
  assert.match(anchorGuard, /instance anchor is immutable/u);
  assert.match(context, /LANGUAGE plpgsql\s+VOLATILE/u);
  assert.match(context, /WHERE role\.rolname = session_user/u);
  assert.match(
    context,
    /marker_record\."coordinatorRoleOid" IS DISTINCT FROM[\s\S]*session_role_oid/u,
  );
  assert.match(context, /shared_beta_runtime_activation_role_assert_v1/u);
  assert.match(context, /shared_beta_runtime_migration_state_v1/u);
  assert.match(context, /shared_beta_runtime_database_identity_digest_v1/u);
  assert.match(context, /actual_build_payload_digest/u);
  assert.match(context, /actual_marker_payload_digest/u);
});

test(
  "migration-state digest executes on PostgreSQL with bytea NUL framing",
  {
    skip: runtimeTestDatabaseUrl
      ? false
      : "SHARED_BETA_RUNTIME_RELEASE_ACTIVATION_TEST_DATABASE_URL is unset",
  },
  async () => {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: runtimeTestDatabaseUrl,
        },
      },
    });

    try {
      const applied = await prisma.$queryRawUnsafe(`
        SELECT
          "migration_name" AS "migrationName",
          "checksum"
        FROM public."_prisma_migrations"
        WHERE "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
        ORDER BY "migration_name" COLLATE "C"
      `);
      const [result] = await prisma.$queryRawUnsafe(`
        SELECT
          public."shared_beta_runtime_migration_state_v1"() AS "state"
      `);
      const expectedDigest = createHash("sha256")
        .update(
          applied
            .map(
              ({ migrationName, checksum }) =>
                `${migrationName}\u0000${checksum}`,
            )
            .join("\n"),
          "utf8",
        )
        .digest("hex");

      assert.equal(applied.length, 174);
      assert.equal(result.state.migrationCount, applied.length);
      assert.equal(result.state.schemaHead, applied.at(-1).migrationName);
      assert.equal(result.state.migrationManifestDigest, expectedDigest);
      assert.equal(result.state.nonAppliedCount, 0);
      assert.equal(result.state.checksumMismatchCount, 0);
    } finally {
      await prisma.$disconnect();
    }
  },
);

test("actual shell proves the exact pilot boundary without integration credentials", async () => {
  const sql = await migrationSql();
  const shell = functionBlock(sql, "shared_beta_tenant_actual_shell_v1");

  assert.match(shell, /FOR NO KEY UPDATE/u);
  assert.match(shell, /FROM public\."Store"/u);
  assert.match(shell, /FROM public\."UserRoleOverride"/u);
  assert.match(shell, /FROM public\."TenantModuleEntitlement"/u);
  assert.match(shell, /FROM public\."PlatformAdminAuditEvent"/u);
  assert.match(shell, /FROM public\."IntegrationCredential"/u);
  assert.match(shell, /integration_credential_count <> 0/u);
  assert.match(shell, /capability_count <> 41/u);
  assert.match(
    shell,
    /ebb460b8773b7fb5ee0cfbbc7cceab98113ac1c7296c679352fd72c71f6d3281/u,
  );
  assert.match(
    shell,
    /'leetplus-shared-beta-owner-capabilities-v1',\s*pg_catalog\.to_jsonb\(actual_capabilities\)/u,
  );
  for (const moduleName of [
    "GAMIFICATION",
    "ASSORTMENT",
    "STAFF",
    "COMMUNICATIONS",
    "USERS_ROLES",
    "INTEGRATIONS",
  ]) {
    assert.match(shell, new RegExp(`'${moduleName}'`, "u"));
  }
  assert.match(
    shell,
    /claim_subject_id IS NOT DISTINCT FROM reservation_subject_id[\s\S]*claim_revision IS NOT DISTINCT FROM reservation_claim_revision/u,
  );
  assert.match(
    shell,
    /FROM public\."IdentityOwnerInviteIssueCommand" AS command[\s\S]*outbox_record\.status_name <> 'HOLD'/u,
  );
  assert.match(shell, /leetplus-shared-beta-actual-shell-v1/u);
  assert.match(shell, /'entitlementProfileRevision'/u);
  assert.match(shell, /'executionRevision'/u);
  assert.match(shell, /tenant_record\.profile_revision <> 1/u);
  assert.match(
    shell,
    /tenant_record\.execution_revision\s*<>\s*provision_execution_revision/u,
  );
  assert.match(
    shell,
    /jsonb_typeof\(\s*audit_record\.metadata_json->'requestDigest'\s*\) IS DISTINCT FROM 'string'/u,
  );
  assert.match(
    shell,
    /jsonb_typeof\(\s*audit_record\.metadata_json->'ownerEmailFingerprint'\s*\) IS DISTINCT FROM 'string'/u,
  );
  assert.match(
    shell,
    /jsonb_typeof\(\s*audit_record\.metadata_json->'executionRevision'\s*\) IS DISTINCT FROM 'number'/u,
  );
  assert.match(
    shell,
    /pg_catalog\.btrim\(\s*audit_record\.metadata_json->>'supportTicket'\s*\) IS DISTINCT FROM\s*audit_record\.metadata_json->>'supportTicket'/u,
  );
  assert.match(shell, /issue_audit_count <> 0/u);
  assert.match(shell, /invite_record\.full_name IS NOT NULL/u);
  for (const nullableInviteColumn of [
    "acceptedByUserId",
    "createdByUserId",
    "revokedByUserId",
  ]) {
    assert.match(
      shell,
      new RegExp(
        `invite_record\\.${nullableInviteColumn.replace(
          /[A-Z]/gu,
          (character) => `_${character.toLowerCase()}`,
        )} IS NOT NULL`,
        "u",
      ),
    );
  }
  assert.match(
    shell,
    /invite_record\.created_at IS DISTINCT FROM[\s\S]*issue_command_record\."createdAt" AT TIME ZONE 'UTC'/u,
  );
  assert.match(
    shell,
    /invite_record\.updated_at IS DISTINCT FROM[\s\S]*issue_command_record\."createdAt" AT TIME ZONE 'UTC'/u,
  );
  assert.match(
    shell,
    /issue_audit\."createdAt" =\s*issue_command_record\."createdAt" AT TIME ZONE 'UTC'/u,
  );
});

test("coordinator is serializable, double-asserted, and mutates only after command insert", async () => {
  const sql = await migrationSql();
  const body = functionBlock(sql, "shared_beta_tenant_activate_v1");
  const replayStart = body.indexOf("IF FOUND THEN");
  const serializableCheck = body.indexOf(
    "current_setting('transaction_isolation')",
  );
  assert.ok(replayStart >= 0 && replayStart < serializableCheck);
  const replay = body.slice(replayStart, serializableCheck);

  assert.doesNotMatch(replay, /candidate_secret_ciphertext/u);
  assert.doesNotMatch(replay, /candidate_token_hash/u);
  assert.doesNotMatch(replay, /FROM public\."Tenant" AS tenant/u);
  assert.doesNotMatch(replay, /FROM public\."UserInvite" AS invite/u);
  assert.doesNotMatch(replay, /FROM public\."IdentityMailOutbox" AS outbox/u);
  assert.match(replay, /WHERE role\.rolname = session_user/u);
  assert.match(
    replay,
    /FROM public\."SharedBetaRuntimeReleaseMarker" AS marker/u,
  );
  assert.match(
    replay,
    /session_role_name IS DISTINCT FROM[\s\S]*marker_record\."coordinatorRoleName"/u,
  );
  assert.match(
    replay,
    /session_role_oid IS DISTINCT FROM[\s\S]*marker_record\."coordinatorRoleOid"/u,
  );
  assert.match(
    replay,
    /shared_beta_runtime_activation_role_assert_v1[\s\S]*tenant activation replay conflicts/u,
  );
  assertOrdered(replay, [
    "WHERE role.rolname = session_user",
    'FROM public."SharedBetaRuntimeReleaseMarker" AS marker',
    "shared_beta_runtime_activation_role_assert_v1",
    "Shared beta tenant activation replay conflicts",
    "pg_catalog.jsonb_set",
    "'{decision}'",
    "'\"REPLAYED\"'",
  ]);
  assert.match(body, /requires SERIALIZABLE/u);
  assert.equal(
    body.match(/shared_beta_runtime_actual_context_assert_v1/gmu)?.length,
    2,
  );
  assert.equal(body.match(/shared_beta_tenant_actual_shell_v1/gmu)?.length, 2);
  assert.equal(
    body.match(/shared_beta_tenant_admission_decision_assert_v1/gmu)?.length,
    2,
  );
  assertOrdered(body, [
    'public."identity_owner_invite_issue_hold_v1"',
    'FROM public."IdentityEmailClaim" AS claim',
    'public."shared_beta_tenant_admission_decision_assert_v1"',
    "repeated_runtime_context :=",
    "repeated_shell_context :=",
    'INSERT INTO public."SharedBetaTenantActivationCommand"',
    'UPDATE public."Tenant"',
    'UPDATE public."TenantAdmissionDecision"',
    'UPDATE public."IdentityMailOutbox"',
    'INSERT INTO public."PlatformAdminAuditEvent"',
  ]);
  assert.match(body, /pg_catalog\.pg_current_xact_id\(\)::TEXT/u);
  assert.match(body, /'ACTIVE'::public\."TenantLifecycleStatus"/u);
  assert.match(body, /'OWNER_INVITED'::public\."TenantOnboardingStatus"/u);
  assert.match(body, /'PENDING'::public\."IdentityMailOutboxStatus"/u);
  assert.match(body, /outbox_record\."expiresAt" > trial_ends_at/u);
  assert.match(body, /marker_record\."validUntil" <= activated_at/u);
  assert.match(body, /build_record\."validUntil" <= activated_at/u);
});

test("same-transaction guards authorize only the exact activation command", async () => {
  const sql = await migrationSql();
  for (const functionName of [
    "shared_beta_tenant_admission_decision_guard_v1",
    "identity_mail_outbox_release_guard_v1",
    "shared_beta_tenant_activation_guard_v1",
  ]) {
    const body = functionBlock(sql, functionName);
    assert.match(body, /SharedBetaTenantActivationCommand/u);
    assert.match(body, /pg_catalog\.pg_current_xact_id\(\)::TEXT/u);
  }
  const outbox = functionBlock(sql, "identity_mail_outbox_release_guard_v1");
  assert.match(outbox, /'HOLD'::public\."IdentityMailOutboxStatus"/u);
  assert.match(outbox, /'PENDING'::public\."IdentityMailOutboxStatus"/u);
  assert.match(outbox, /NEW\."releasedAt"/u);
  const tenant = functionBlock(sql, "shared_beta_tenant_activation_guard_v1");
  assert.match(
    tenant,
    /NEW\."statusChangedAt" =\s*command\."activatedAt" AT TIME ZONE 'UTC'/u,
  );
  for (const criticalField of [
    "customerStage",
    "status",
    "onboardingStatus",
    "trialStartsAt",
    "trialEndsAt",
    "entitlementProfileRevision",
    "executionRevision",
    "statusChangedAt",
    "statusReason",
  ]) {
    assert.match(
      tenant,
      new RegExp(
        `NEW\\."${criticalField}" IS DISTINCT FROM(?:\\s*)OLD\\."${criticalField}"`,
        "u",
      ),
    );
  }
});

test("Prisma exposes every sealed relation and composite provenance edge", async () => {
  const schema = await prismaSchema();

  assert.match(
    schema,
    /enum IdentityMailOutboxStatus \{\s*HOLD\s+PENDING\s+CLAIMED\s+RETRY\s+SENT\s+DEAD\s+CANCELED\s+RECONCILIATION_REQUIRED\s*\}/u,
  );
  assert.match(schema, /releasedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/u);
  for (const model of [
    "SharedBetaRuntimeInstanceAnchor",
    "SharedBetaBuildProvenance",
    "SharedBetaRuntimeReleaseChallenge",
    "SharedBetaRuntimeReleaseMarker",
    "SharedBetaRuntimeReleaseState",
    "SharedBetaTenantActivationCommand",
  ]) {
    assert.ok(modelBlock(schema, model).length > 100);
  }
  const activation = modelBlock(schema, "SharedBetaTenantActivationCommand");
  assert.match(
    activation,
    /@@unique\(\[decisionId, tenantId\], map: "shared_beta_activation_decision_tenant_uidx"\)/u,
  );
  assert.match(
    activation,
    /@@unique\(\[tenantId, issueCommandId\], map: "shared_beta_activation_tenant_issue_uidx"\)/u,
  );
  assert.match(
    activation,
    /@@unique\(\[tenantId, inviteId\], map: "shared_beta_activation_tenant_invite_uidx"\)/u,
  );
  assert.match(
    activation,
    /@@unique\(\[tenantId, outboxId\], map: "shared_beta_activation_tenant_outbox_uidx"\)/u,
  );
});

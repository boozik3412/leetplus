\set ON_ERROR_STOP on

BEGIN;

DO $current189_smoke$
DECLARE
  tenant_id CONSTANT TEXT := '19191919-1919-4191-8191-191919191919';
  actor_id CONSTANT TEXT := '29292929-2929-4292-8292-292929292929';
  store_id CONSTANT TEXT := '39393939-3939-4393-8393-393939393939';
  custom_role_id CONSTANT TEXT :=
    '3f3f3f3f-3f3f-4f3f-8f3f-3f3f3f3f3f3f';
  provider_digest CONSTANT TEXT := repeat('f', 64);
  receipt JSONB;
  initial_invite_id CONSTANT TEXT :=
    '49494949-4949-4494-8494-494949494949';
  reissued_invite_id CONSTANT TEXT :=
    '59595959-5959-4595-8595-595959595959';
  sent_outbox_id CONSTANT TEXT :=
    '69696969-6969-4696-8696-696969696969';
  sent_invite_id CONSTANT TEXT :=
    '7c7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c';
  ambiguous_outbox_id CONSTANT TEXT :=
    '79797979-7979-4797-8797-797979797979';
  retry_outbox_id CONSTANT TEXT :=
    '89898989-8989-4898-8898-898989898989';
  ambiguous_ack_digest TEXT;
BEGIN
  INSERT INTO public."Tenant" (
    "id", "name", "slug", "status", "customerStage",
    "onboardingStatus", "trialStartsAt", "trialEndsAt",
    "entitlementProfileRevision", "executionRevision", "createdAt",
    "updatedAt"
  ) VALUES (
    tenant_id, 'CURRENT189 smoke tenant', 'current189-smoke-tenant',
    'ACTIVE', 'PILOT', 'ACTIVE',
    pg_catalog.clock_timestamp() - INTERVAL '1 hour',
    pg_catalog.clock_timestamp() + INTERVAL '30 days',
    1, 1, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );
  INSERT INTO public."TenantModuleEntitlement" (
    "id", "tenantId", "module", "readEnabled", "writeEnabled",
    "outboundEnabled", "profileRevision", "reason", "createdAt", "updatedAt"
  ) VALUES (
    '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a', tenant_id, 'USERS_ROLES',
    TRUE, TRUE, FALSE, 1, 'CURRENT189 disposable smoke',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );
  INSERT INTO public."User" (
    "id", "tenantId", "email", "passwordHash", "fullName", "role",
    "accessScope", "isActive", "isPlatformAdmin", "emailVerifiedAt",
    "createdAt", "updatedAt"
  ) VALUES (
    actor_id, tenant_id, 'owner-current189-smoke@example.invalid',
    'synthetic-not-a-password', 'CURRENT189 owner', 'OWNER', 'NETWORK',
    TRUE, FALSE, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );
  INSERT INTO public."Store" (
    "id", "tenantId", "name", "isActive", "createdAt", "updatedAt"
  ) VALUES (
    store_id, tenant_id, 'CURRENT189 store', TRUE,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  );
  INSERT INTO public."UserAccessRole" (
    "id", "tenantId", "name", "permissions", "createdAt", "updatedAt"
  ) VALUES (
    custom_role_id, tenant_id, 'CURRENT189 scoped administrator',
    ARRAY['manage_users']::TEXT[], pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

  INSERT INTO public."UserRoleOverride" (
    "id", "tenantId", "role", "permissions", "createdAt", "updatedAt"
  ) VALUES (
    '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a', tenant_id, 'OWNER',
    ARRAY[]::TEXT[], pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );
  BEGIN
    PERFORM public."identity_employee_invite_actor_assert_current189_v1"(
      tenant_id, actor_id
    );
    RAISE EXCEPTION 'CURRENT189 accepted OWNER with revoked manage_users';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public."UserRoleOverride"
  SET "permissions" = ARRAY['manage_users']::TEXT[],
      "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "tenantId" = tenant_id AND "role" = 'OWNER';
  PERFORM public."identity_employee_invite_actor_assert_current189_v1"(
    tenant_id, actor_id
  );

  receipt := public."identity_employee_invite_issue_current189_v1"(
    '2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a', tenant_id, actor_id,
    '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a', repeat('1', 64), NULL,
    '4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a4a4a',
    '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a', initial_invite_id,
    '6a6a6a6a-6a6a-4a6a-8a6a-6a6a6a6a6a6a',
    '7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a',
    'employee-current189-smoke@example.invalid', 'Employee',
    'CLUB_ADMINISTRATOR', NULL, 'STORES', ARRAY[store_id]::TEXT[],
    repeat('a', 64), pg_catalog.decode(repeat('0c', 71), 'hex'), 1,
    'employee-v1', 'ci',
    pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp() + INTERVAL '7 days'
    )
  );
  IF receipt->>'decision' <> 'CREATED'
     OR receipt ? 'recipientEmail'
     OR receipt ? 'registrationUrl'
     OR receipt ? 'tokenHash'
     OR receipt ? 'secretCiphertext'
  THEN
    RAISE EXCEPTION 'CURRENT189 issue safe receipt failed';
  END IF;

  receipt := public."identity_employee_invite_issue_current189_v1"(
    '8a8a8a8a-8a8a-4a8a-8a8a-8a8a8a8a8a8a', tenant_id, actor_id,
    '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a', repeat('1', 64), NULL,
    '9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a',
    '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b',
    '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b',
    '3b3b3b3b-3b3b-4b3b-8b3b-3b3b3b3b3b3b',
    '4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b',
    'employee-current189-smoke@example.invalid', 'Employee',
    'CLUB_ADMINISTRATOR', NULL, 'STORES', ARRAY[store_id]::TEXT[],
    repeat('2', 64), pg_catalog.decode(repeat('07', 71), 'hex'), 1,
    'employee-v1', 'ci',
    (
      SELECT command."expiresAt"
      FROM public."IdentityEmployeeInviteIssueCommandV1" AS command
      WHERE command."tenantId" = tenant_id
        AND command."inviteId" = initial_invite_id
    )
  );
  IF receipt->>'decision' <> 'REPLAYED'
     OR receipt->>'inviteId' <> initial_invite_id
  THEN
    RAISE EXCEPTION 'CURRENT189 issue replay failed';
  END IF;
  BEGIN
    PERFORM public."identity_employee_invite_issue_current189_v1"(
      'abababab-abab-4bab-8bab-abababababab', tenant_id, actor_id,
      '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a', repeat('9', 64), NULL,
      'acacacac-acac-4cac-8cac-acacacacacac',
      'adadadad-adad-4dad-8dad-adadadadadad',
      'aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae',
      'afafafaf-afaf-4faf-8faf-afafafafafaf',
      'b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0',
      'employee-current189-smoke@example.invalid', 'Employee',
      'CLUB_ADMINISTRATOR', NULL, 'STORES', ARRAY[store_id]::TEXT[],
      repeat('f', 64), pg_catalog.decode(repeat('0d', 71), 'hex'), 1,
      'employee-v1', 'ci',
      (
        SELECT command."expiresAt"
        FROM public."IdentityEmployeeInviteIssueCommandV1" AS command
        WHERE command."tenantId" = tenant_id
          AND command."inviteId" = initial_invite_id
      )
    );
    RAISE EXCEPTION 'CURRENT189 accepted changed replay requestDigest';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public."identity_employee_invite_issue_current189_v1"(
      'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1', tenant_id, actor_id,
      '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a', repeat('1', 64), NULL,
      'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2',
      'b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3',
      'b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4',
      'b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5',
      'b6b6b6b6-b6b6-46b6-86b6-b6b6b6b6b6b6',
      'different-current189-smoke@example.invalid', 'Employee',
      'CLUB_ADMINISTRATOR', NULL, 'STORES', ARRAY[store_id]::TEXT[],
      repeat('e', 64), pg_catalog.decode(repeat('0e', 71), 'hex'), 1,
      'employee-v1', 'ci',
      (
        SELECT command."expiresAt"
        FROM public."IdentityEmployeeInviteIssueCommandV1" AS command
        WHERE command."tenantId" = tenant_id
          AND command."inviteId" = initial_invite_id
      )
    );
    RAISE EXCEPTION 'CURRENT189 accepted changed replay mailbox';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  receipt := public."identity_employee_invite_reissue_current189_v1"(
    '5b5b5b5b-5b5b-4b5b-8b5b-5b5b5b5b5b5b', tenant_id, actor_id,
    '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b', repeat('3', 64),
    initial_invite_id, NULL,
    '7b7b7b7b-7b7b-4b7b-8b7b-7b7b7b7b7b7b', reissued_invite_id,
    '8b8b8b8b-8b8b-4b8b-8b8b-8b8b8b8b8b8b',
    '9b9b9b9b-9b9b-4b9b-8b9b-9b9b9b9b9b9b',
    'employee-current189-smoke@example.invalid', 'Employee',
    'CLUB_ADMINISTRATOR', NULL, 'STORES', ARRAY[store_id]::TEXT[],
    repeat('4', 64), pg_catalog.decode(repeat('08', 71), 'hex'), 1,
    'employee-v1', 'ci',
    pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp() + INTERVAL '8 days'
    )
  );
  IF receipt->>'decision' <> 'CREATED'
     OR receipt->>'previousInviteId' <> initial_invite_id
     OR NOT EXISTS (
       SELECT 1
       FROM public."IdentityEmployeeMailDeliveryEventV1" AS event
       WHERE event."tenantId" = tenant_id
         AND event."inviteId" = initial_invite_id
         AND event."eventType" = 'CANCELED'
         AND event."reasonCode" = 'REISSUED'
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 reissue/cancel failed';
  END IF;

  receipt := public."identity_employee_invite_revoke_current189_v1"(
    '1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c', tenant_id, actor_id,
    '2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c', repeat('5', 64),
    reissued_invite_id
  );
  IF receipt->>'decision' <> 'REVOKED'
     OR receipt ? 'recipientEmail'
     OR EXISTS (
       SELECT 1 FROM public."IdentityEmailClaim" AS claim
       WHERE claim."tenantId" = tenant_id
         AND claim."subjectId" = reissued_invite_id
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 revoke/release failed';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.employee_invite_tenant_id', tenant_id, true
  );
  INSERT INTO public."IdentityEmployeeMailTenantEnrollmentV1" (
    "tenantId", "workerRoleName", "workerRoleOid", "enabled", "state",
    "stateRevision", "policyRevision", "providerAuthorityDigest",
    "maxAttempts", "leaseSeconds", "acknowledgeSeconds",
    "baseRetrySeconds", "maxRetrySeconds"
  )
  SELECT
    tenant_id, session_user, role.oid, TRUE, 'ACTIVE', 1, 1,
    provider_digest, 3, 30, 10, 1, 10
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = session_user;

  -- Exact provider-accepted path, including lost database-response replay.
  receipt := public."identity_employee_invite_issue_current189_v1"(
    '3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c', tenant_id, actor_id,
    '4c4c4c4c-4c4c-4c4c-8c4c-4c4c4c4c4c4c', repeat('6', 64), NULL,
    '5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c',
    '6c6c6c6c-6c6c-4c6c-8c6c-6c6c6c6c6c6c',
    sent_invite_id, sent_outbox_id,
    '8c8c8c8c-8c8c-4c8c-8c8c-8c8c8c8c8c8c',
    'sent-current189-smoke@example.invalid', 'Sent Employee',
    'CLUB_ADMINISTRATOR', custom_role_id, 'STORES',
    ARRAY[store_id]::TEXT[], repeat('7', 64),
    pg_catalog.decode(repeat('09', 71), 'hex'), 1, 'employee-v1', 'ci',
    pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp() + INTERVAL '7 days'
    )
  );
  IF public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('7', 64)
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 pending invite passed SENT gate';
  END IF;
  receipt := public."identity_employee_mail_claim_current189_v1"(
    tenant_id, repeat('8', 64), repeat('9', 64), provider_digest
  );
  IF receipt->>'decision' <> 'CLAIMED'
     OR receipt->>'outboxId' <> sent_outbox_id
     OR receipt->>'recipientEmail' <>
       'sent-current189-smoke@example.invalid'
     OR receipt->>'secretCiphertextBase64' IS NULL
  THEN
    RAISE EXCEPTION 'CURRENT189 provider claim failed';
  END IF;
  receipt := public."identity_employee_mail_provider_mark_current189_v1"(
    tenant_id, sent_outbox_id, 1, repeat('8', 64), repeat('9', 64),
    'current189-provider-attempt-sent', provider_digest, repeat('a', 64)
  );
  IF receipt->>'decision' <> 'MARKED' THEN
    RAISE EXCEPTION 'CURRENT189 provider mark failed';
  END IF;
  receipt := public."identity_employee_mail_provider_mark_current189_v1"(
    tenant_id, sent_outbox_id, 1, repeat('8', 64), repeat('9', 64),
    'current189-provider-attempt-sent', provider_digest, repeat('a', 64)
  );
  IF receipt->>'decision' <> 'MARKED' THEN
    RAISE EXCEPTION 'CURRENT189 provider mark replay failed';
  END IF;
  BEGIN
    receipt := public."identity_employee_mail_provider_mark_current189_v1"(
      tenant_id, sent_outbox_id, 1, repeat('8', 64), repeat('9', 64),
      'current189-provider-attempt-conflict', provider_digest, repeat('d', 64)
    );
    IF receipt->>'decision' <> 'HANDOFF'
       OR NOT EXISTS (
         SELECT 1
         FROM public."IdentityEmployeeMailOutboxV1" AS outbox
         WHERE outbox."tenantId" = tenant_id
           AND outbox."id" = sent_outbox_id
           AND outbox."status" = 'RECONCILIATION_REQUIRED'
           AND outbox."stateReasonCode" = 'PROVIDER_MARKER_CONFLICT'
           AND outbox."terminalAckDigest" ~ '^[a-f0-9]{64}$'
       )
    THEN
      RAISE EXCEPTION 'CURRENT189 provider marker conflict evidence failed';
    END IF;
    RAISE EXCEPTION 'CURRENT189 rollback marker conflict fixture'
      USING ERRCODE = 'Z0189';
  EXCEPTION
    WHEN SQLSTATE 'Z0189' THEN NULL;
  END;
  receipt := public."identity_employee_mail_complete_current189_v1"(
    tenant_id, sent_outbox_id, 1, repeat('8', 64), repeat('9', 64),
    provider_digest, 'PROVIDER_ACCEPTED', repeat('b', 64), repeat('c', 64)
  );
  IF receipt->>'decision' <> 'SENT' THEN
    RAISE EXCEPTION 'CURRENT189 provider complete failed';
  END IF;
  receipt := public."identity_employee_mail_complete_current189_v1"(
    tenant_id, sent_outbox_id, 1, repeat('8', 64), repeat('9', 64),
    provider_digest, 'PROVIDER_ACCEPTED', repeat('b', 64), repeat('c', 64)
  );
  IF receipt->>'decision' <> 'SENT'
     OR NOT EXISTS (
       SELECT 1
       FROM public."IdentityEmployeeMailOutboxV1" AS outbox
       WHERE outbox."tenantId" = tenant_id
         AND outbox."id" = sent_outbox_id
         AND outbox."status" = 'SENT'
         AND outbox."secretCiphertext" IS NULL
         AND outbox."ciphertextClearedAt" IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 provider complete replay failed';
  END IF;
  BEGIN
    PERFORM public."identity_employee_mail_complete_current189_v1"(
      tenant_id, sent_outbox_id, 1, repeat('8', 64), repeat('9', 64),
      provider_digest, 'PROVIDER_ACCEPTED', repeat('b', 64), repeat('d', 64)
    );
    RAISE EXCEPTION 'CURRENT189 accepted changed terminal ack replay';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  IF NOT public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('7', 64)
     )
     OR public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('0', 64)
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 exact SENT preview/accept gate failed';
  END IF;
  UPDATE public."Store"
  SET "isActive" = FALSE, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "tenantId" = tenant_id AND "id" = store_id;
  IF public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('7', 64)
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 inactive delegated store passed SENT gate';
  END IF;
  UPDATE public."Store"
  SET "isActive" = TRUE, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "tenantId" = tenant_id AND "id" = store_id;
  IF NOT public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('7', 64)
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 restored delegated store failed SENT gate';
  END IF;
  DELETE FROM public."UserAccessRole"
  WHERE "tenantId" = tenant_id AND "id" = custom_role_id;
  IF public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('7', 64)
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 deleted custom role passed SENT gate';
  END IF;

  receipt := public."identity_employee_invite_revoke_current189_v1"(
    '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f', tenant_id, actor_id,
    '1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f', repeat('0', 64),
    sent_invite_id
  );
  IF receipt->>'decision' <> 'REVOKED'
     OR public."identity_employee_invite_delivery_assert_sent_current189_v1"(
       tenant_id, sent_invite_id, repeat('7', 64)
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 revoked SENT invite passed acceptance gate';
  END IF;

  -- Marked lease expiry is quarantined and never returned to RETRY.
  receipt := public."identity_employee_invite_issue_current189_v1"(
    '9c9c9c9c-9c9c-4c9c-8c9c-9c9c9c9c9c9c', tenant_id, actor_id,
    '1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d', repeat('d', 64), NULL,
    '2d2d2d2d-2d2d-4d2d-8d2d-2d2d2d2d2d2d',
    '3d3d3d3d-3d3d-4d3d-8d3d-3d3d3d3d3d3d',
    '4d4d4d4d-4d4d-4d4d-8d4d-4d4d4d4d4d4d', ambiguous_outbox_id,
    '5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d',
    'ambiguous-current189-smoke@example.invalid', 'Ambiguous Employee',
    'TRAINEE', NULL, 'STORES', ARRAY[store_id]::TEXT[], repeat('e', 64),
    pg_catalog.decode(repeat('0a', 71), 'hex'), 1, 'employee-v1', 'ci',
    pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp() + INTERVAL '7 days'
    )
  );
  receipt := public."identity_employee_mail_claim_current189_v1"(
    tenant_id, repeat('1', 64), repeat('2', 64), provider_digest
  );
  IF receipt->>'outboxId' <> ambiguous_outbox_id THEN
    RAISE EXCEPTION 'CURRENT189 ambiguous claim failed';
  END IF;
  PERFORM public."identity_employee_mail_provider_mark_current189_v1"(
    tenant_id, ambiguous_outbox_id, 1, repeat('1', 64), repeat('2', 64),
    'current189-provider-attempt-ambiguous', provider_digest, repeat('3', 64)
  );
  UPDATE public."IdentityEmployeeMailOutboxV1"
  SET "leaseExpiresAt" = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE "tenantId" = tenant_id AND "id" = ambiguous_outbox_id;
  receipt := public."identity_employee_mail_reap_current189_v1"(
    tenant_id, provider_digest, 10
  );
  IF (receipt->>'reconciliationRequired')::INTEGER <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public."IdentityEmployeeMailOutboxV1" AS outbox
       WHERE outbox."tenantId" = tenant_id
         AND outbox."id" = ambiguous_outbox_id
         AND outbox."status" = 'RECONCILIATION_REQUIRED'
         AND outbox."secretCiphertext" IS NULL
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 ambiguous reap quarantine failed';
  END IF;
  SELECT outbox."terminalAckDigest"
  INTO ambiguous_ack_digest
  FROM public."IdentityEmployeeMailOutboxV1" AS outbox
  WHERE outbox."tenantId" = tenant_id
    AND outbox."id" = ambiguous_outbox_id;
  receipt := public."identity_employee_mail_complete_current189_v1"(
    tenant_id, ambiguous_outbox_id, 1, repeat('1', 64), repeat('2', 64),
    provider_digest, 'PROVIDER_AMBIGUOUS', NULL, ambiguous_ack_digest
  );
  IF receipt->>'decision' <> 'RECONCILIATION_REQUIRED' THEN
    RAISE EXCEPTION 'CURRENT189 ambiguous terminal replay failed';
  END IF;
  BEGIN
    PERFORM public."identity_employee_mail_complete_current189_v1"(
      tenant_id, ambiguous_outbox_id, 1, repeat('1', 64), repeat('2', 64),
      provider_digest, 'PROVIDER_AMBIGUOUS', NULL, repeat('0', 64)
    );
    RAISE EXCEPTION 'CURRENT189 accepted changed ambiguous terminal ack';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Unmarked lease expiry remains retryable with ciphertext still encrypted.
  receipt := public."identity_employee_invite_issue_current189_v1"(
    '6d6d6d6d-6d6d-4d6d-8d6d-6d6d6d6d6d6d', tenant_id, actor_id,
    '7d7d7d7d-7d7d-4d7d-8d7d-7d7d7d7d7d7d', repeat('4', 64), NULL,
    '8d8d8d8d-8d8d-4d8d-8d8d-8d8d8d8d8d8d',
    '9d9d9d9d-9d9d-4d9d-8d9d-9d9d9d9d9d9d',
    '1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e', retry_outbox_id,
    '2e2e2e2e-2e2e-4e2e-8e2e-2e2e2e2e2e2e',
    'retry-current189-smoke@example.invalid', 'Retry Employee', 'TRAINEE',
    NULL, 'STORES', ARRAY[store_id]::TEXT[], repeat('5', 64),
    pg_catalog.decode(repeat('0b', 71), 'hex'), 1, 'employee-v1', 'ci',
    pg_catalog.date_trunc(
      'milliseconds', pg_catalog.clock_timestamp() + INTERVAL '7 days'
    )
  );
  receipt := public."identity_employee_mail_claim_current189_v1"(
    tenant_id, repeat('6', 64), repeat('7', 64), provider_digest
  );
  IF receipt->>'outboxId' <> retry_outbox_id THEN
    RAISE EXCEPTION 'CURRENT189 retry claim failed';
  END IF;
  UPDATE public."IdentityEmployeeMailOutboxV1"
  SET "leaseExpiresAt" = pg_catalog.clock_timestamp() - INTERVAL '1 second'
  WHERE "tenantId" = tenant_id AND "id" = retry_outbox_id;
  receipt := public."identity_employee_mail_reap_current189_v1"(
    tenant_id, provider_digest, 10
  );
  IF (receipt->>'retry')::INTEGER <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM public."IdentityEmployeeMailOutboxV1" AS outbox
       WHERE outbox."tenantId" = tenant_id
         AND outbox."id" = retry_outbox_id
         AND outbox."status" = 'RETRY'
         AND outbox."secretCiphertext" IS NOT NULL
         AND outbox."ciphertextClearedAt" IS NULL
     )
  THEN
    RAISE EXCEPTION 'CURRENT189 unmarked retry failed';
  END IF;

  UPDATE public."IdentityEmployeeMailTenantEnrollmentV1"
  SET "state" = 'DRAINING', "stateRevision" = "stateRevision" + 1
  WHERE "tenantId" = tenant_id;
  receipt := public."identity_employee_mail_claim_current189_v1"(
    tenant_id, repeat('8', 64), repeat('9', 64), provider_digest
  );
  IF receipt->>'decision' <> 'EMPTY' THEN
    RAISE EXCEPTION 'CURRENT189 DRAINING claim fence failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."IdentityEmployeeMailDeliveryEventV1" AS event
    WHERE event."tenantId" <> tenant_id
  ) THEN
    RAISE EXCEPTION 'CURRENT189 cross-tenant event residue detected';
  END IF;
END;
$current189_smoke$;

ROLLBACK;

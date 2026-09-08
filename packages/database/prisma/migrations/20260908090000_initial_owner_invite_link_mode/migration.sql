BEGIN;

-- Initial-owner invitations may be delivered either by verified email or by
-- an explicitly published one-time link. Existing invitations remain EMAIL.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

ALTER TABLE public."UserInvite"
  ADD COLUMN "deliveryMode" VARCHAR(16) NOT NULL DEFAULT 'EMAIL';

ALTER TABLE public."UserInvite"
  ADD CONSTRAINT "UserInvite_delivery_mode_check"
  CHECK ("deliveryMode" IN ('EMAIL', 'LINK'));

COMMENT ON COLUMN public."UserInvite"."deliveryMode" IS
  'Immutable delivery choice for an initial OWNER invite. EMAIL requires verified SMTP delivery; LINK requires an explicit platform-admin publication transition.';

CREATE OR REPLACE FUNCTION
  public."identity_initial_owner_invite_registration_allowed_v1"(
    p_tenant_id TEXT,
    p_invite_id TEXT,
    p_presented_token_hash TEXT
  )
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    p_tenant_id IS NOT NULL
    AND p_invite_id IS NOT NULL
    AND p_presented_token_hash IS NOT NULL
    AND (p_presented_token_hash COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND EXISTS (
      SELECT 1
      FROM public."UserInvite" AS target_invite
      INNER JOIN public."Tenant" AS target_tenant
        ON target_tenant."id" = target_invite."tenantId"
      INNER JOIN public."IdentityEmailClaim" AS identity_claim
        ON identity_claim."emailCanonical" = target_invite."email"
       AND identity_claim."claimType" =
         'INVITE'::public."IdentityEmailClaimType"
       AND identity_claim."tenantId" = target_invite."tenantId"
       AND identity_claim."subjectId" = target_invite."id"
       AND identity_claim."revision" =
         target_invite."identityClaimRevision"
      INNER JOIN public."IdentityMailOutbox" AS target_outbox
        ON target_outbox."tenantId" = target_invite."tenantId"
       AND target_outbox."inviteId" = target_invite."id"
       AND target_outbox."tokenHash" = target_invite."tokenHash"
      WHERE target_invite."tenantId" = p_tenant_id
        AND target_invite."id" = p_invite_id
        AND target_invite."tokenHash" = p_presented_token_hash
        AND target_invite."role" = 'OWNER'::public."UserRole"
        AND target_invite."accessScope" =
          'NETWORK'::public."UserAccessScope"
        AND target_invite."customRoleId" IS NULL
        AND pg_catalog.cardinality(target_invite."storeIds") = 0
        AND target_invite."acceptedAt" IS NULL
        AND target_invite."revokedAt" IS NULL
        AND target_invite."expiresAt" > pg_catalog.clock_timestamp()
        AND target_invite."email" IS NOT NULL
        AND target_tenant."status" =
          'ACTIVE'::public."TenantLifecycleStatus"
        AND target_tenant."customerStage" =
          'PILOT'::public."TenantCustomerStage"
        AND target_tenant."onboardingStatus" =
          'OWNER_INVITED'::public."TenantOnboardingStatus"
        AND target_tenant."trialStartsAt" <=
          pg_catalog.clock_timestamp()
        AND target_tenant."trialEndsAt" >
          pg_catalog.clock_timestamp()
        AND target_outbox."expiresAt" > pg_catalog.clock_timestamp()
        AND (
          (
            target_invite."deliveryMode" = 'EMAIL'
            AND target_outbox."status" =
              'SENT'::public."IdentityMailOutboxStatus"
            AND target_outbox."secretCiphertext" IS NULL
            AND target_outbox."providerAttemptKey" IS NOT NULL
            AND target_outbox."sentAt" IS NOT NULL
            AND target_outbox."terminalAt" = target_outbox."sentAt"
            AND EXISTS (
              SELECT 1
              FROM public."IdentityMailDeliveryEvent" AS sent_event
              WHERE sent_event."tenantId" = target_outbox."tenantId"
                AND sent_event."outboxId" = target_outbox."id"
                AND sent_event."transitionRevision" =
                  target_outbox."transitionRevision"
                AND sent_event."toStatus" =
                  'SENT'::public."IdentityMailOutboxStatus"
                AND sent_event."eventType" IN (
                  'PROVIDER_ACCEPTED',
                  'RECONCILED_SENT'
                )
                AND (
                  (
                    sent_event."eventType" = 'PROVIDER_ACCEPTED'
                    AND sent_event."actorDigest" IS NULL
                  )
                  OR (
                    sent_event."eventType" = 'RECONCILED_SENT'
                    AND sent_event."actorDigest" IS NOT NULL
                  )
                )
            )
          )
          OR (
            target_invite."deliveryMode" = 'LINK'
            AND target_outbox."status" =
              'CANCELED'::public."IdentityMailOutboxStatus"
            AND target_outbox."secretCiphertext" IS NULL
            AND target_outbox."providerAttemptKey" IS NULL
            AND target_outbox."sentAt" IS NULL
            AND target_outbox."terminalAt" IS NOT NULL
            AND target_outbox."stateReasonCode" =
              'OWNER_INVITE_LINK_ONLY'
            AND EXISTS (
              SELECT 1
              FROM public."IdentityMailDeliveryEvent" AS link_event
              WHERE link_event."tenantId" = target_outbox."tenantId"
                AND link_event."outboxId" = target_outbox."id"
                AND link_event."transitionRevision" =
                  target_outbox."transitionRevision"
                AND link_event."eventType" = 'CANCELED'
                AND link_event."toStatus" =
                  'CANCELED'::public."IdentityMailOutboxStatus"
                AND link_event."stateReasonCode" =
                  'OWNER_INVITE_LINK_ONLY'
            )
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION
  public."identity_initial_owner_invite_delivery_assert_sent_v1"(
    p_tenant_id TEXT,
    p_invite_id TEXT,
    p_presented_token_hash TEXT
  )
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT public."identity_initial_owner_invite_registration_allowed_v1"(
    p_tenant_id,
    p_invite_id,
    p_presented_token_hash
  )
$$;

COMMENT ON FUNCTION
  public."identity_initial_owner_invite_delivery_assert_sent_v1"(
    TEXT,
    TEXT,
    TEXT
  ) IS
  'Compatibility assertion: admits an initial owner registration after verified EMAIL delivery or explicit LINK publication.';

CREATE OR REPLACE FUNCTION
  public."identity_initial_owner_invite_accept_sent_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  db_accepted_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."acceptedAt" IS NOT NULL
       AND NEW."role" = 'OWNER'::public."UserRole"
       AND NEW."accessScope" =
         'NETWORK'::public."UserAccessScope"
       AND NEW."customRoleId" IS NULL
       AND pg_catalog.cardinality(NEW."storeIds") = 0
       AND EXISTS (
         SELECT 1
         FROM public."Tenant" AS target_tenant
         WHERE target_tenant."id" = NEW."tenantId"
           AND target_tenant."status" =
             'ACTIVE'::public."TenantLifecycleStatus"
           AND target_tenant."customerStage" =
             'PILOT'::public."TenantCustomerStage"
           AND target_tenant."onboardingStatus" =
             'OWNER_INVITED'::public."TenantOnboardingStatus"
       )
    THEN
      RAISE EXCEPTION
        'Initial owner invite cannot be inserted as accepted'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."acceptedAt" IS NULL
     AND NEW."acceptedAt" IS NOT NULL
     AND (
       OLD."role" = 'OWNER'::public."UserRole"
       OR NEW."role" = 'OWNER'::public."UserRole"
     )
     AND (
       EXISTS (
         SELECT 1 FROM public."Tenant" AS target_tenant
         WHERE target_tenant."id" = NEW."tenantId"
           AND target_tenant."customerStage" =
             'PILOT'::public."TenantCustomerStage"
           AND target_tenant."onboardingStatus" =
             'OWNER_INVITED'::public."TenantOnboardingStatus"
       )
       OR EXISTS (
         SELECT 1 FROM public."Tenant" AS target_tenant
         WHERE target_tenant."id" = OLD."tenantId"
           AND target_tenant."customerStage" =
             'PILOT'::public."TenantCustomerStage"
           AND target_tenant."onboardingStatus" =
             'OWNER_INVITED'::public."TenantOnboardingStatus"
       )
     )
  THEN
    IF OLD."id" IS DISTINCT FROM NEW."id"
       OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
       OR OLD."role" IS DISTINCT FROM NEW."role"
       OR OLD."accessScope" IS DISTINCT FROM NEW."accessScope"
       OR OLD."customRoleId" IS DISTINCT FROM NEW."customRoleId"
       OR OLD."storeIds" IS DISTINCT FROM NEW."storeIds"
       OR OLD."tokenHash" IS DISTINCT FROM NEW."tokenHash"
       OR OLD."email" IS DISTINCT FROM NEW."email"
       OR OLD."identityClaimRevision" IS DISTINCT FROM
         NEW."identityClaimRevision"
       OR OLD."deliveryMode" IS DISTINCT FROM NEW."deliveryMode"
       OR NEW."role" IS DISTINCT FROM 'OWNER'::public."UserRole"
       OR NEW."accessScope" IS DISTINCT FROM
         'NETWORK'::public."UserAccessScope"
       OR NEW."customRoleId" IS NOT NULL
       OR pg_catalog.cardinality(NEW."storeIds") IS DISTINCT FROM 0
    THEN
      RAISE EXCEPTION
        'Initial owner invite identity cannot change during acceptance'
        USING ERRCODE = '55000';
    END IF;

    IF NOT public."identity_initial_owner_invite_registration_allowed_v1"(
      NEW."tenantId",
      NEW."id",
      NEW."tokenHash"
    )
    THEN
      RAISE EXCEPTION
        'Initial owner invite delivery mode is not ready for acceptance'
        USING ERRCODE = '55000';
    END IF;

    db_accepted_at := pg_catalog.clock_timestamp();
    NEW."acceptedAt" := db_accepted_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public."identity_initial_owner_invite_delivery_mode_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD."deliveryMode" IS NOT DISTINCT FROM NEW."deliveryMode" THEN
    RETURN NEW;
  END IF;

  IF OLD."deliveryMode" <> 'EMAIL'
     OR NEW."deliveryMode" <> 'LINK'
     OR OLD."acceptedAt" IS NOT NULL
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."expiresAt" <= pg_catalog.clock_timestamp()
     OR OLD."role" <> 'OWNER'::public."UserRole"
     OR OLD."accessScope" <> 'NETWORK'::public."UserAccessScope"
     OR OLD."customRoleId" IS NOT NULL
     OR pg_catalog.cardinality(OLD."storeIds") <> 0
     OR NOT EXISTS (
       SELECT 1
       FROM public."Tenant" AS target_tenant
       INNER JOIN public."IdentityMailOutbox" AS target_outbox
         ON target_outbox."tenantId" = target_tenant."id"
        AND target_outbox."inviteId" = OLD."id"
        AND target_outbox."tokenHash" = OLD."tokenHash"
       WHERE target_tenant."id" = OLD."tenantId"
         AND target_tenant."status" =
           'ACTIVE'::public."TenantLifecycleStatus"
         AND target_tenant."customerStage" =
           'PILOT'::public."TenantCustomerStage"
         AND target_tenant."onboardingStatus" =
           'OWNER_INVITED'::public."TenantOnboardingStatus"
         AND target_outbox."status" IN (
           'PENDING'::public."IdentityMailOutboxStatus",
           'RETRY'::public."IdentityMailOutboxStatus",
           'CLAIMED'::public."IdentityMailOutboxStatus"
         )
         AND target_outbox."providerAttemptKey" IS NULL
         AND target_outbox."secretCiphertext" IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'Initial owner invite delivery mode change is invalid'
      USING ERRCODE = '55000';
  END IF;

  NEW."updatedAt" := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER "UserInvite_initial_owner_delivery_mode_guard_trigger"
BEFORE UPDATE OF "deliveryMode"
ON public."UserInvite"
FOR EACH ROW
EXECUTE FUNCTION
  public."identity_initial_owner_invite_delivery_mode_guard_v1"();

REVOKE ALL ON FUNCTION
  public."identity_initial_owner_invite_registration_allowed_v1"(
    TEXT,
    TEXT,
    TEXT
  ) FROM PUBLIC;

REVOKE ALL ON FUNCTION
  public."identity_initial_owner_invite_delivery_mode_guard_v1"()
FROM PUBLIC;

-- Keep the least-privilege mail worker on the exact new schema head. The
-- reviewed CURRENT_185 preterminal manifest remains unchanged because every
-- additive successor is explicitly excluded from that frozen digest.
CREATE OR REPLACE FUNCTION public."identity_mail_delivery_worker_assert_v1"(
  p_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  enrollment_record RECORD;
  migration_count INTEGER;
  migration_head TEXT;
  preterminal_manifest_digest TEXT;
BEGIN
  IF p_tenant_id IS NULL
     OR p_tenant_id <> pg_catalog.lower(
       pg_catalog.btrim(p_tenant_id COLLATE "C")
     )
     OR (p_tenant_id COLLATE "C") !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'Identity mail worker tenant is invalid'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    enrollment."policyRevision",
    enrollment."maxAttempts",
    enrollment."leaseSeconds",
    enrollment."acknowledgeSeconds",
    enrollment."baseRetrySeconds",
    enrollment."maxRetrySeconds",
    enrollment."providerAuthorityDigest"
  INTO enrollment_record
  FROM public."IdentityMailDeliveryTenantEnrollment" AS enrollment
  INNER JOIN pg_catalog.pg_roles AS worker_role
    ON worker_role.rolname = session_user
   AND worker_role.oid::BIGINT = enrollment."workerRoleOid"
  WHERE enrollment."tenantId" = p_tenant_id
    AND enrollment."enabled" = true
    AND enrollment."workerRoleName" = session_user
    AND enrollment."enabledAt" IS NOT NULL
    AND enrollment."disabledAt" IS NULL
    AND session_user <> current_user
    AND worker_role.rolcanlogin = true
    AND worker_role.rolsuper = false
    AND worker_role.rolinherit = false
    AND worker_role.rolcreaterole = false
    AND worker_role.rolcreatedb = false
    AND worker_role.rolreplication = false
    AND worker_role.rolbypassrls = false
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = worker_role.oid
         OR membership.roleid = worker_role.oid
    )
  FOR SHARE OF enrollment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity mail worker is not enrolled for tenant'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    pg_catalog.count(*)::INTEGER,
    (
      SELECT migration."migration_name"
      FROM public."_prisma_migrations" AS migration
      WHERE migration."finished_at" IS NOT NULL
        AND migration."rolled_back_at" IS NULL
      ORDER BY
        migration."started_at" DESC,
        migration."migration_name" DESC
      LIMIT 1
    ),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.string_agg(
            migration."migration_name" || ' ' || migration."checksum",
            E'\n'
            ORDER BY migration."migration_name" COLLATE "C"
          ) FILTER (
            WHERE migration."migration_name" NOT IN (
              '20260819010000_staff_attachment_parent_delete_guard',
              '20260820010000_guest_portal_telegram_update_ledger',
              '20260828190000_guest_support_bug_reports',
              '20260831120000_guest_support_bug_report_input_repair',
              '20260908090000_initial_owner_invite_link_mode'
            )
          ) || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    migration_count,
    migration_head,
    preterminal_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF migration_count IS DISTINCT FROM 190
     OR migration_head IS DISTINCT FROM
       '20260908090000_initial_owner_invite_link_mode'
     OR preterminal_manifest_digest NOT IN (
       '589dd0a39f2372041a284392c72ad6ed59027877e909e1a5d377b9017c662fda',
       '094f3ad34ef8846f6088f51d5fb9491ff89af4509b60063453c22af07466d99b'
     )
     OR EXISTS (
       SELECT 1
       FROM public."_prisma_migrations" AS migration
       WHERE migration."finished_at" IS NULL
         AND migration."rolled_back_at" IS NULL
     )
  THEN
    RAISE EXCEPTION
      'Identity mail worker database migration receipt is not CURRENT_190'
      USING ERRCODE = '55000';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_IDENTITY_MAIL_DELIVERY_WORKER',
    'decision', 'READY',
    'tenantId', p_tenant_id,
    'migrationHead', migration_head,
    'migrationCount', migration_count,
    'preterminalManifestDigest', preterminal_manifest_digest,
    'policyRevision', enrollment_record."policyRevision",
    'maxAttempts', enrollment_record."maxAttempts",
    'leaseSeconds', enrollment_record."leaseSeconds",
    'acknowledgeSeconds', enrollment_record."acknowledgeSeconds",
    'baseRetrySeconds', enrollment_record."baseRetrySeconds",
    'maxRetrySeconds', enrollment_record."maxRetrySeconds",
    'providerAuthorityDigest',
      enrollment_record."providerAuthorityDigest"
  );
END;
$$;

REVOKE ALL PRIVILEGES
ON FUNCTION public."identity_mail_delivery_worker_assert_v1"(TEXT)
FROM PUBLIC;

COMMENT ON FUNCTION
  public."identity_mail_delivery_worker_assert_v1"(TEXT)
IS
  'Fail-closed identity mail worker readiness receipt bound to exact CURRENT_190 while preserving the approved CURRENT_185 preterminal digest boundary.';

COMMIT;

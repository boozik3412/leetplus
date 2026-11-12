-- Guest Telegram outbox: messages LeetPlus sends to a guest through the guest
-- bot (staff replies to a guest's Telegram conversation, later campaign
-- messages). The corporate API only queues rows; the bot poller claims them by
-- its own outbox token and reports the outcome.
--
-- Expand only: one new table that the serving release never reads, and two
-- relaxed checks on GuestSupportTicket so a guest's message to the bot can be
-- stored as a TELEGRAM conversation (short texts allowed only for TELEGRAM).
-- Every existing row and everything the serving release writes (kind BUG,
-- description of 20..2000 characters) still satisfies the new checks.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public."GuestSupportTicket"
  DROP CONSTRAINT "guest_support_ticket_kind_chk",
  ADD CONSTRAINT "guest_support_ticket_kind_chk"
    CHECK ("kind" IN ('BUG', 'TELEGRAM')),
  DROP CONSTRAINT "guest_support_ticket_description_length_chk",
  ADD CONSTRAINT "guest_support_ticket_description_length_chk"
    CHECK (
      pg_catalog.length("description") BETWEEN 20 AND 2000
      OR (
        "kind" = 'TELEGRAM'
        AND pg_catalog.length("description") BETWEEN 1 AND 2000
      )
    );

CREATE TABLE public."GuestTelegramOutboxMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT,
  "profileId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "supportTicketId" TEXT,
  "supportCommentId" TEXT,
  "marketingCampaignId" TEXT,
  "createdByUserId" TEXT,
  "text" TEXT NOT NULL,
  "replyMarkup" JSONB,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimToken" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "telegramMessageId" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestTelegramOutboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_telegram_outbox_source_uidx"
ON public."GuestTelegramOutboxMessage" ("tenantId", "sourceKey");

CREATE INDEX "guest_telegram_outbox_due_idx"
ON public."GuestTelegramOutboxMessage" ("status", "nextAttemptAt");

CREATE INDEX "guest_telegram_outbox_ticket_idx"
ON public."GuestTelegramOutboxMessage" ("tenantId", "supportTicketId");

CREATE INDEX "guest_telegram_outbox_campaign_idx"
ON public."GuestTelegramOutboxMessage" ("tenantId", "marketingCampaignId");

CREATE INDEX "guest_telegram_outbox_profile_idx"
ON public."GuestTelegramOutboxMessage" ("tenantId", "profileId", "createdAt");

ALTER TABLE public."GuestTelegramOutboxMessage"
  ADD CONSTRAINT "GuestTelegramOutboxMessage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestTelegramOutboxMessage_tenantId_profileId_fkey"
  FOREIGN KEY ("tenantId", "profileId")
  REFERENCES public."GuestGameProfile"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- The runtime role of a production host reads and writes the outbox (lp
-- checks it inside this transaction); fresh databases of CI and local runs have
-- no such role.
DO $grant$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'leetplus_runtime'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public."GuestTelegramOutboxMessage" TO leetplus_runtime;
  END IF;
END
$grant$;

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
              '20260908090000_initial_owner_invite_link_mode',
              '20260908180000_external_langame_simple_onboarding',
              '20261004090000_store_closures',
              '20261007120000_guest_leaderboard',
              '20261014120000_guest_game_holdout',
              '20261026120000_daily_report_bot',
              '20261107090000_guest_game_tutorial',
              '20261109120000_guest_game_external_accounts',
              '20261110090000_store_floor_plan',
              '20261111090000_guest_staff_mark',
              '20261112090000_guest_telegram_outbox'
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

  IF migration_count IS DISTINCT FROM 200
     OR migration_head IS DISTINCT FROM
       '20261112090000_guest_telegram_outbox'
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
      'Identity mail worker database migration receipt is not CURRENT_200'
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
  'Fail-closed identity mail worker readiness receipt bound to exact CURRENT_200 while preserving the approved CURRENT_185 preterminal digest boundary.';

-- Guest bug-report intake and support queue.
--
-- The public guest runtime writes only these support-owned tables. Corporate
-- and platform administration runtimes read and mutate them through guarded
-- APIs; no StaffTask, notification, or outbound transport is coupled here.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE TYPE public."GuestSupportTicketStatus" AS ENUM (
  'NEW',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED'
);

CREATE TYPE public."GuestSupportAttachmentState" AS ENUM (
  'PENDING',
  'AVAILABLE',
  'REJECTED'
);

CREATE TABLE public."GuestSupportTicket" (
  "id" TEXT NOT NULL,
  "ticketNumber" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "guestId" TEXT,
  "assignedToUserId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'BUG',
  "topic" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" public."GuestSupportTicketStatus" NOT NULL DEFAULT 'NEW',
  "route" TEXT,
  "releaseSha" TEXT,
  "browser" TEXT,
  "device" TEXT,
  "viewport" TEXT,
  "timeZone" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestSupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_support_ticket_number_format_chk"
    CHECK ("ticketNumber" COLLATE "C" ~ '^LP-BUG-[0-9A-F]{8}$'),
  CONSTRAINT "guest_support_ticket_idempotency_format_chk"
    CHECK (
      pg_catalog.length("idempotencyKey") BETWEEN 8 AND 128
      AND "idempotencyKey" COLLATE "C" ~ '^[A-Za-z0-9:_-]+$'
    ),
  CONSTRAINT "guest_support_ticket_kind_chk" CHECK ("kind" = 'BUG'),
  CONSTRAINT "guest_support_ticket_topic_chk" CHECK (
    "topic" IN (
      'GAME_MODULE',
      'MISSIONS_AND_BATTLE_PASS',
      'LOOT_BOXES_AND_REWARDS',
      'BALANCE_AND_PAYMENTS',
      'AUTH_AND_PROFILE',
      'INTERFACE_AND_DISPLAY',
      'OTHER'
    )
  ),
  CONSTRAINT "guest_support_ticket_description_length_chk"
    CHECK (pg_catalog.length("description") BETWEEN 30 AND 2000),
  CONSTRAINT "guest_support_ticket_terminal_timestamps_chk" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "closedAt" IS NULL)
    OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL)
    OR ("status" IN ('NEW', 'IN_PROGRESS') AND "resolvedAt" IS NULL AND "closedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "GuestSupportTicket_ticketNumber_key"
ON public."GuestSupportTicket" ("ticketNumber");

CREATE UNIQUE INDEX "guest_support_ticket_tenant_id_uidx"
ON public."GuestSupportTicket" ("tenantId", "id");

CREATE UNIQUE INDEX "guest_support_ticket_profile_idempotency_uidx"
ON public."GuestSupportTicket" ("tenantId", "profileId", "idempotencyKey");

CREATE INDEX "guest_support_ticket_status_activity_idx"
ON public."GuestSupportTicket" ("tenantId", "status", "lastActivityAt");

CREATE INDEX "guest_support_ticket_store_created_idx"
ON public."GuestSupportTicket" ("tenantId", "storeId", "createdAt");

CREATE INDEX "guest_support_ticket_topic_created_idx"
ON public."GuestSupportTicket" ("tenantId", "topic", "createdAt");

CREATE INDEX "guest_support_ticket_assignee_status_idx"
ON public."GuestSupportTicket" ("assignedToUserId", "status");

CREATE INDEX "guest_support_ticket_guest_idx"
ON public."GuestSupportTicket" ("guestId");

CREATE TABLE public."GuestSupportAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "state" public."GuestSupportAttachmentState" NOT NULL DEFAULT 'PENDING',
  "rejectionCode" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestSupportAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_support_attachment_content_type_chk"
    CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT "guest_support_attachment_size_chk"
    CHECK (
      "byteSize" BETWEEN 1 AND 5242880
      AND "byteSize" = pg_catalog.octet_length("data")
    ),
  CONSTRAINT "guest_support_attachment_sha_chk"
    CHECK ("contentSha256" COLLATE "C" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "guest_support_attachment_state_chk" CHECK (
    ("state" = 'PENDING' AND "processedAt" IS NULL AND "rejectionCode" IS NULL)
    OR ("state" = 'AVAILABLE' AND "processedAt" IS NOT NULL AND "rejectionCode" IS NULL)
    OR ("state" = 'REJECTED' AND "processedAt" IS NOT NULL AND "rejectionCode" IS NOT NULL)
  )
);

CREATE INDEX "guest_support_attachment_ticket_idx"
ON public."GuestSupportAttachment" ("tenantId", "ticketId", "createdAt");

CREATE INDEX "guest_support_attachment_state_idx"
ON public."GuestSupportAttachment" ("tenantId", "state", "createdAt");

CREATE INDEX "guest_support_attachment_sha_idx"
ON public."GuestSupportAttachment" ("contentSha256");

CREATE TABLE public."GuestSupportTicketComment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestSupportTicketComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_support_comment_body_length_chk"
    CHECK (pg_catalog.length("body") BETWEEN 1 AND 2000)
);

CREATE INDEX "guest_support_comment_ticket_idx"
ON public."GuestSupportTicketComment" ("tenantId", "ticketId", "createdAt");

CREATE INDEX "guest_support_comment_author_idx"
ON public."GuestSupportTicketComment" ("authorUserId");

CREATE TABLE public."GuestSupportTicketAuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestSupportTicketAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_support_audit_ticket_idx"
ON public."GuestSupportTicketAuditEvent" ("tenantId", "ticketId", "createdAt");

CREATE INDEX "guest_support_audit_actor_idx"
ON public."GuestSupportTicketAuditEvent" ("actorUserId");

ALTER TABLE public."GuestSupportTicket"
  ADD CONSTRAINT "GuestSupportTicket_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestSupportTicket_tenantId_storeId_fkey"
  FOREIGN KEY ("tenantId", "storeId") REFERENCES public."Store"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestSupportTicket_tenantId_profileId_fkey"
  FOREIGN KEY ("tenantId", "profileId") REFERENCES public."GuestGameProfile"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestSupportTicket_tenantId_guestId_fkey"
  FOREIGN KEY ("tenantId", "guestId") REFERENCES public."Guest"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestSupportTicket_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES public."User"("id")
  ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE public."GuestSupportAttachment"
  ADD CONSTRAINT "GuestSupportAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestSupportAttachment_tenantId_ticketId_fkey"
  FOREIGN KEY ("tenantId", "ticketId") REFERENCES public."GuestSupportTicket"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE public."GuestSupportTicketComment"
  ADD CONSTRAINT "GuestSupportTicketComment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestSupportTicketComment_tenantId_ticketId_fkey"
  FOREIGN KEY ("tenantId", "ticketId") REFERENCES public."GuestSupportTicket"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestSupportTicketComment_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES public."User"("id")
  ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE public."GuestSupportTicketAuditEvent"
  ADD CONSTRAINT "GuestSupportTicketAuditEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestSupportTicketAuditEvent_tenantId_ticketId_fkey"
  FOREIGN KEY ("tenantId", "ticketId") REFERENCES public."GuestSupportTicket"("tenantId", "id")
  ON DELETE CASCADE ON UPDATE RESTRICT,
  ADD CONSTRAINT "GuestSupportTicketAuditEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES public."User"("id")
  ON DELETE SET NULL ON UPDATE RESTRICT;

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
              '20260828190000_guest_support_bug_reports'
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

  IF migration_count IS DISTINCT FROM 188
     OR migration_head IS DISTINCT FROM
       '20260828190000_guest_support_bug_reports'
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
      'Identity mail worker database migration receipt is not CURRENT_188'
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
  'Fail-closed identity mail worker readiness receipt bound to exact CURRENT_188 while preserving the approved CURRENT_185 preterminal digest boundary.';

COMMIT;

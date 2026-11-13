-- Administrator rating: a reviewer's decisions. Expand only: a new table the
-- serving release never reads.
--
-- StaffAdminRatingAdjustment: BONUS (+points) or PENALTY (-points) with a
-- reason and a date inside the rating period, or FORGIVE of one penalty item
-- (targetKind + targetId: an escalated checklist run, a discipline record or an
-- overdue task). A canceled row stays for history. At most one active FORGIVE
-- per item.
CREATE TABLE public."StaffAdminRatingAdjustment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "kind" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "targetKind" TEXT,
  "targetId" TEXT,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "canceledAt" TIMESTAMP(3),
  "canceledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffAdminRatingAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_admin_rating_adjustment_kind_chk"
    CHECK ("kind" IN ('BONUS', 'PENALTY', 'FORGIVE')),
  CONSTRAINT "staff_admin_rating_adjustment_status_chk"
    CHECK ("status" IN ('ACTIVE', 'CANCELED')),
  CONSTRAINT "staff_admin_rating_adjustment_points_chk"
    CHECK (
      ("kind" = 'BONUS' AND "points" > 0)
      OR ("kind" = 'PENALTY' AND "points" < 0)
      OR ("kind" = 'FORGIVE' AND "points" = 0)
    ),
  CONSTRAINT "staff_admin_rating_adjustment_target_chk"
    CHECK (
      ("kind" = 'FORGIVE') = ("targetKind" IS NOT NULL AND "targetId" IS NOT NULL)
    ),
  CONSTRAINT "staff_admin_rating_adjustment_cancel_chk"
    CHECK (("status" = 'CANCELED') = ("canceledAt" IS NOT NULL))
);

CREATE INDEX "staff_admin_rating_adjustment_user_idx"
ON public."StaffAdminRatingAdjustment" ("tenantId", "userId", "occurredAt");

CREATE UNIQUE INDEX "staff_admin_rating_adjustment_forgive_uidx"
ON public."StaffAdminRatingAdjustment" ("tenantId", "targetKind", "targetId")
WHERE "kind" = 'FORGIVE' AND "status" = 'ACTIVE';

ALTER TABLE public."StaffAdminRatingAdjustment"
  ADD CONSTRAINT "StaffAdminRatingAdjustment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StaffAdminRatingAdjustment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES public."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "StaffAdminRatingAdjustment_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES public."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StaffAdminRatingAdjustment_canceledByUserId_fkey"
  FOREIGN KEY ("canceledByUserId") REFERENCES public."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The runtime role of a production host reads and writes the table (lp checks
-- it inside this transaction); fresh databases of CI and local runs have no
-- such role.
DO $grant$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'leetplus_runtime'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE public."StaffAdminRatingAdjustment" TO leetplus_runtime;
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
              '20261112090000_guest_telegram_outbox',
              '20261112120000_guest_telegram_campaigns',
              '20261112150000_guest_visit_ratings',
              '20261112170000_guest_crm_lead_stage',
              '20261113090000_staff_langame_auto_link',
              '20261113120000_staff_checklist_escalated_at',
              '20261113150000_staff_admin_rating_adjustments'
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

  IF migration_count IS DISTINCT FROM 206
     OR migration_head IS DISTINCT FROM
       '20261113150000_staff_admin_rating_adjustments'
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
      'Identity mail worker database migration receipt is not CURRENT_206'
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
  'Fail-closed identity mail worker readiness receipt bound to exact CURRENT_206 while preserving the approved CURRENT_185 preterminal digest boundary.';

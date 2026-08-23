BEGIN;

SET TRANSACTION READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';

-- Proposal-only admission anchor. This file is not a canonical Prisma
-- migration and is not authorized for deployment or assembly.
-- Admission contract: IDENTITY_MAIL_CLUSTER_APPLICATION_ADMISSION_CURRENT187_V1
-- Source verifier contract: CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1
--
-- The only permitted operation is a read-only verification of the exact
-- completed CURRENT186 predecessor history. No application authority is
-- created by a successful check.
DO $current187_admission_anchor$
DECLARE
  completed_count INTEGER;
  completed_head TEXT;
  completed_head_checksum TEXT;
  completed_manifest_digest TEXT;
BEGIN
  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.max(migration."migration_name"),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.string_agg(
            migration."migration_name" || ' ' || migration."checksum",
            E'\n'
            ORDER BY migration."migration_name" COLLATE "C"
          ) || E'\n',
          'UTF8'
        )
      ),
      'hex'
    )
  INTO completed_count, completed_head, completed_manifest_digest
  FROM public."_prisma_migrations" AS migration
  WHERE migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  SELECT migration."checksum"
  INTO completed_head_checksum
  FROM public."_prisma_migrations" AS migration
  WHERE migration."migration_name" =
      '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
    AND migration."finished_at" IS NOT NULL
    AND migration."rolled_back_at" IS NULL;

  IF completed_count IS DISTINCT FROM 186
     OR completed_head IS DISTINCT FROM
       '20260803010000_identity_mail_duty_role_runtime_boundary_v2'
     OR completed_head_checksum IS DISTINCT FROM
       '7a1a0453b883d6bbf8640eff8c39b007376286b0f21d31f766771fead65a93dd'
     OR completed_manifest_digest IS DISTINCT FROM
       '3bbf04f88643d94076be96c3ae714c441454e6a7fcd6107af5bd194dca579ed6'
  THEN
    RAISE EXCEPTION
      'CURRENT187 admission anchor requires the exact completed CURRENT186 predecessor history'
      USING ERRCODE = '55000';
  END IF;
END;
$current187_admission_anchor$;

-- Deliberately prevent this proposal from creating a durable database effect.
ROLLBACK;

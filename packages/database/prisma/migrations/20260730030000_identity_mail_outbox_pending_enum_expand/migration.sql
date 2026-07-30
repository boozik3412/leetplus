BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- PostgreSQL does not permit a newly-added enum label to be used safely until
-- the transaction that added it commits. This migration therefore performs
-- only the additive enum expansion. CURRENT_174 will replace the HOLD-only
-- constraint/guard and use PENDING in a separate transaction.
DO $precondition$
DECLARE
  labels TEXT[];
BEGIN
  SELECT pg_catalog.array_agg(
    enum_value.enumlabel
    ORDER BY enum_value.enumsortorder
  )
  INTO labels
  FROM pg_catalog.pg_enum AS enum_value
  INNER JOIN pg_catalog.pg_type AS enum_type
    ON enum_type.oid = enum_value.enumtypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = enum_type.typnamespace
  WHERE namespace.nspname = 'public'
    AND enum_type.typname = 'IdentityMailOutboxStatus';

  IF labels IS DISTINCT FROM ARRAY['HOLD']::TEXT[] THEN
    RAISE EXCEPTION
      'IdentityMailOutboxStatus must be exact CURRENT_172 HOLD-only enum'
      USING ERRCODE = '55000';
  END IF;
END;
$precondition$;

ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'PENDING' AFTER 'HOLD';

COMMENT ON TYPE public."IdentityMailOutboxStatus" IS
  'Identity mail state enum. CURRENT_173 only expands HOLD with dormant PENDING; no transition or delivery authority is granted until CURRENT_174.';

DO $postcondition$
DECLARE
  labels TEXT[];
BEGIN
  SELECT pg_catalog.array_agg(
    enum_value.enumlabel
    ORDER BY enum_value.enumsortorder
  )
  INTO labels
  FROM pg_catalog.pg_enum AS enum_value
  INNER JOIN pg_catalog.pg_type AS enum_type
    ON enum_type.oid = enum_value.enumtypid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = enum_type.typnamespace
  WHERE namespace.nspname = 'public'
    AND enum_type.typname = 'IdentityMailOutboxStatus';

  IF labels IS DISTINCT FROM ARRAY['HOLD', 'PENDING']::TEXT[] THEN
    RAISE EXCEPTION
      'IdentityMailOutboxStatus CURRENT_173 expansion failed'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;

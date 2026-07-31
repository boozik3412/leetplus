BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- PostgreSQL enum labels cannot be used safely until the transaction which
-- adds them commits. CURRENT_175 is therefore enum-only. It grants no worker
-- authority and changes no outbox row.
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

  IF labels IS DISTINCT FROM ARRAY['HOLD', 'PENDING']::TEXT[] THEN
    RAISE EXCEPTION
      'IdentityMailOutboxStatus must be exact CURRENT_174 HOLD/PENDING enum'
      USING ERRCODE = '55000';
  END IF;
END;
$precondition$;

ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'CLAIMED' AFTER 'PENDING';
ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'RETRY' AFTER 'CLAIMED';
ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'SENT' AFTER 'RETRY';
ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'DEAD' AFTER 'SENT';
ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'CANCELED' AFTER 'DEAD';
ALTER TYPE public."IdentityMailOutboxStatus"
  ADD VALUE 'RECONCILIATION_REQUIRED' AFTER 'CANCELED';

COMMENT ON TYPE public."IdentityMailOutboxStatus" IS
  'CURRENT_175 enum-only expansion for leased initial-owner mail delivery. No transition or worker grant is introduced until CURRENT_176.';

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

  IF labels IS DISTINCT FROM ARRAY[
    'HOLD',
    'PENDING',
    'CLAIMED',
    'RETRY',
    'SENT',
    'DEAD',
    'CANCELED',
    'RECONCILIATION_REQUIRED'
  ]::TEXT[] THEN
    RAISE EXCEPTION
      'IdentityMailOutboxStatus CURRENT_175 expansion failed'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;

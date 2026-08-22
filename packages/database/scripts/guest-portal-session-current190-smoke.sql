\set ON_ERROR_STOP on

-- Run only in a disposable database after applying the CURRENT190 candidate.
-- All synthetic A/A1 and B/B1 rows and session transitions are rolled back.
BEGIN;

DO $assert_sealed_acl_and_rls$
DECLARE
  unexpected_acl_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)::INTEGER
  INTO unexpected_acl_count
  FROM (
    SELECT privilege.grantee
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) AS privilege
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'GuestPortalSessionV1',
        'GuestPortalSessionAuditV1',
        'GuestPortalTenantSessionFenceV1',
        'GuestPortalTenantSessionRevokeBatchV1'
      )
      AND privilege.grantee <> relation.relowner

    UNION ALL

    SELECT privilege.grantee
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    INNER JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS privilege
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'GuestPortalSessionV1',
        'GuestPortalSessionAuditV1',
        'GuestPortalTenantSessionFenceV1',
        'GuestPortalTenantSessionRevokeBatchV1'
      )
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND privilege.grantee <> relation.relowner

    UNION ALL

    SELECT privilege.grantee
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        routine.proacl,
        pg_catalog.acldefault('f', routine.proowner)
      )
    ) AS privilege
    WHERE namespace.nspname = 'public'
      AND routine.proname LIKE 'guest_portal%current190%'
      AND privilege.grantee <> routine.proowner
  ) AS unexpected_acl;

  IF unexpected_acl_count <> 0
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_class AS relation
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname IN (
           'GuestPortalSessionV1',
           'GuestPortalSessionAuditV1',
           'GuestPortalTenantSessionFenceV1',
           'GuestPortalTenantSessionRevokeBatchV1'
         )
         AND (
           relation.relrowsecurity IS DISTINCT FROM TRUE
           OR relation.relforcerowsecurity IS DISTINCT FROM TRUE
         )
     )
     OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_policy AS policy
       INNER JOIN pg_catalog.pg_class AS relation
         ON relation.oid = policy.polrelid
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND policy.polname IN (
           'guest_portal_session_tenant_policy_current190',
           'guest_portal_session_audit_tenant_policy_current190',
           'guest_portal_tenant_session_fence_policy_current190',
           'guest_portal_tenant_session_batch_policy_current190'
         )
     ) <> 4
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS constraint_entry
       WHERE constraint_entry.conname =
         'guest_portal_session_audit_session_fkey'
         AND constraint_entry.contype = 'f'::"char"
         AND constraint_entry.conrelid = pg_catalog.to_regclass(
           'public."GuestPortalSessionAuditV1"'
         )
         AND constraint_entry.confrelid = pg_catalog.to_regclass(
           'public."GuestPortalSessionV1"'
         )
         AND constraint_entry.conkey = ARRAY[
           (
             SELECT attribute.attnum
             FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = constraint_entry.conrelid
               AND attribute.attname = 'tenantId'
           ),
           (
             SELECT attribute.attnum
             FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = constraint_entry.conrelid
               AND attribute.attname = 'sessionId'
           )
         ]::SMALLINT[]
         AND constraint_entry.confkey = ARRAY[
           (
             SELECT attribute.attnum
             FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = constraint_entry.confrelid
               AND attribute.attname = 'tenantId'
           ),
           (
             SELECT attribute.attnum
             FROM pg_catalog.pg_attribute AS attribute
             WHERE attribute.attrelid = constraint_entry.confrelid
               AND attribute.attname = 'id'
           )
         ]::SMALLINT[]
     ) THEN
    RAISE EXCEPTION
      'CURRENT190 ACL, FORCE RLS, or tenant-aware audit FK invariant failed';
  END IF;

  IF NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_constraint AS constraint_entry
       WHERE constraint_entry.conname =
         'guest_portal_tenant_session_batch_fence_fkey'
         AND constraint_entry.contype = 'f'::"char"
         AND constraint_entry.conrelid = pg_catalog.to_regclass(
           'public."GuestPortalTenantSessionRevokeBatchV1"'
         )
         AND constraint_entry.confrelid = pg_catalog.to_regclass(
           'public."GuestPortalTenantSessionFenceV1"'
         )
     ) OR (
       SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_trigger AS trigger_entry
       WHERE trigger_entry.tgrelid IN (
         pg_catalog.to_regclass('public."GuestPortalSessionV1"'),
         pg_catalog.to_regclass('public."GuestPortalSessionAuditV1"'),
         pg_catalog.to_regclass('public."GuestPortalTenantSessionFenceV1"'),
         pg_catalog.to_regclass(
           'public."GuestPortalTenantSessionRevokeBatchV1"'
         )
       )
         AND trigger_entry.tgname IN (
           'guest_portal_session_row_guard_current190',
           'guest_portal_session_audit_guard_current190',
           'guest_portal_tenant_session_fence_guard_current190',
           'guest_portal_tenant_session_batch_guard_current190'
         )
         AND NOT trigger_entry.tgisinternal
     ) <> 4 THEN
    RAISE EXCEPTION
      'CURRENT190 revoke-all FK or guard trigger invariant failed';
  END IF;
END;
$assert_sealed_acl_and_rls$;

INSERT INTO public."Tenant" (
  "id", "name", "slug", "status", "customerStage", "onboardingStatus",
  "trialStartsAt", "trialEndsAt", "entitlementProfileRevision",
  "executionRevision", "updatedAt"
) VALUES
  (
    'current190-tenant-a', 'CURRENT190 A', 'current190-a', 'ACTIVE', 'PILOT',
    'ONBOARDING', pg_catalog.clock_timestamp() - INTERVAL '1 hour',
    pg_catalog.clock_timestamp() + INTERVAL '14 days', 1, 1,
    pg_catalog.clock_timestamp()
  ),
  (
    'current190-tenant-b', 'CURRENT190 B', 'current190-b', 'ACTIVE', 'PILOT',
    'ONBOARDING', pg_catalog.clock_timestamp() - INTERVAL '1 hour',
    pg_catalog.clock_timestamp() + INTERVAL '14 days', 1, 1,
    pg_catalog.clock_timestamp()
  );

INSERT INTO public."TenantModuleEntitlement" (
  "id", "tenantId", "module", "readEnabled", "writeEnabled",
  "outboundEnabled", "profileRevision", "reason", "updatedAt"
)
SELECT
  'current190-entitlement-' || tenant_key || '-' || module_key,
  'current190-tenant-' || tenant_key,
  module_key::public."TenantModule",
  TRUE,
  TRUE,
  FALSE,
  1,
  'CURRENT190 disposable acceptance',
  pg_catalog.clock_timestamp()
FROM (VALUES ('a'), ('b')) AS tenant(tenant_key)
CROSS JOIN (
  VALUES
    ('GAMIFICATION'),
    ('ASSORTMENT'),
    ('STAFF'),
    ('COMMUNICATIONS'),
    ('USERS_ROLES'),
    ('INTEGRATIONS')
) AS module(module_key);

INSERT INTO public."Store" (
  "id", "tenantId", "name", "isActive", "gamificationEnabled", "updatedAt"
) VALUES
  (
    'current190-store-a1', 'current190-tenant-a', 'A1', TRUE, TRUE,
    pg_catalog.clock_timestamp()
  ),
  (
    'current190-store-b1', 'current190-tenant-b', 'B1', TRUE, TRUE,
    pg_catalog.clock_timestamp()
  );

INSERT INTO public."Guest" (
  "id", "tenantId", "externalGuestId", "phoneHash", "updatedAt"
) VALUES
  (
    'current190-guest-a', 'current190-tenant-a', 'external-a',
    'phone-hash-a-000000000000000000000000000000000000000000000000',
    pg_catalog.clock_timestamp()
  ),
  (
    'current190-guest-b', 'current190-tenant-b', 'external-b',
    'phone-hash-b-000000000000000000000000000000000000000000000000',
    pg_catalog.clock_timestamp()
  );

INSERT INTO public."GuestGameProfile" (
  "id", "tenantId", "guestId", "phoneHash", "status", "updatedAt"
) VALUES
  (
    'current190-profile-a', 'current190-tenant-a', 'current190-guest-a',
    'phone-hash-a-000000000000000000000000000000000000000000000000',
    'ACTIVE', pg_catalog.clock_timestamp()
  ),
  (
    'current190-profile-b', 'current190-tenant-b', 'current190-guest-b',
    'phone-hash-b-000000000000000000000000000000000000000000000000',
    'ACTIVE', pg_catalog.clock_timestamp()
  );

INSERT INTO public."GuestGameMediaAsset" (
  "id", "tenantId", "fileName", "contentType", "byteSize", "data"
) VALUES
  (
    'current190-asset-a', 'current190-tenant-a', 'a.png', 'image/png', 4,
    pg_catalog.decode('89504e47', 'hex')
  ),
  (
    'current190-asset-b', 'current190-tenant-b', 'b.png', 'image/png', 4,
    pg_catalog.decode('89504e47', 'hex')
  );

DO $hostile_binding_validator$
DECLARE
  hostile_case RECORD;
BEGIN
  FOR hostile_case IN
    SELECT *
    FROM (
      VALUES
        (
          'NULL session id', NULL::TEXT, 1,
          pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64)
        ),
        (
          'noncanonical session id',
          '00000000-0000-0000-0000-000000000000', 1,
          pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64)
        ),
        (
          'NULL token version',
          '00000000-0000-4000-8000-0000000000f1', NULL::INTEGER,
          pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64)
        ),
        (
          'invalid token version',
          '00000000-0000-4000-8000-0000000000f1', 0,
          pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64)
        ),
        (
          'NULL jti digest',
          '00000000-0000-4000-8000-0000000000f1', 1,
          NULL::TEXT, pg_catalog.repeat('b', 64)
        ),
        (
          'invalid jti digest',
          '00000000-0000-4000-8000-0000000000f1', 1,
          pg_catalog.repeat('a', 63), pg_catalog.repeat('b', 64)
        ),
        (
          'NULL binding digest',
          '00000000-0000-4000-8000-0000000000f1', 1,
          pg_catalog.repeat('a', 64), NULL::TEXT
        ),
        (
          'invalid binding digest',
          '00000000-0000-4000-8000-0000000000f1', 1,
          pg_catalog.repeat('a', 64), pg_catalog.repeat('z', 64)
        )
    ) AS candidate(label, session_id, token_version, jti_digest, binding_digest)
  LOOP
    BEGIN
      PERFORM public.guest_portal_session_binding_validate_current190_v1(
        hostile_case.session_id,
        hostile_case.token_version,
        hostile_case.jti_digest,
        hostile_case.binding_digest
      );
      RAISE EXCEPTION
        'CURRENT190 binding validator accepted hostile case: %',
        hostile_case.label;
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
  END LOOP;
END;
$hostile_binding_validator$;

DO $hostile_direct_rpc_inputs$
BEGIN
  BEGIN
    PERFORM * FROM public.guest_portal_session_issue_current190_v1(
      'not-a-uuid',
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 900
    );
    RAISE EXCEPTION 'CURRENT190 issue RPC accepted invalid session binding';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000f1', NULL::INTEGER,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 assert RPC accepted NULL token version';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_rotate_current190_v1(
      '00000000-0000-4000-8000-0000000000f1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      NULL::TEXT, pg_catalog.repeat('b', 64), pg_catalog.repeat('c', 64),
      '00000000-0000-4000-8000-0000000000f2',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
    );
    RAISE EXCEPTION 'CURRENT190 rotate RPC accepted NULL source jti digest';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_revoke_current190_v1(
      '00000000-0000-4000-8000-0000000000f1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), NULL::TEXT, pg_catalog.repeat('f', 64)
    );
    RAISE EXCEPTION 'CURRENT190 revoke RPC accepted NULL binding digest';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_media_assert_current190_v1(
      'not-a-uuid', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      'current190-asset-a'
    );
    RAISE EXCEPTION 'CURRENT190 media RPC accepted invalid session binding';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END;
$hostile_direct_rpc_inputs$;

CREATE TEMP TABLE current190_public_a AS
SELECT *
FROM public.guest_portal_public_store_assert_current190_v1(
  'current190-a',
  'current190-store-a1'
);

DO $assert_public_scope$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM current190_public_a
    WHERE "tenantId" = 'current190-tenant-a'
      AND "storeId" = 'current190-store-a1'
      AND "executionRevision" = 1
      AND "entitlementProfileRevision" = 1
  ) THEN
    RAISE EXCEPTION 'CURRENT190 public store admission failed';
  END IF;
END;
$assert_public_scope$;

CREATE TEMP TABLE current190_issue_a AS
SELECT *
FROM public.guest_portal_session_issue_current190_v1(
  '00000000-0000-4000-8000-0000000000a1',
  'current190-tenant-a',
  'current190-store-a1',
  'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('a', 64),
  pg_catalog.repeat('b', 64),
  900
);

CREATE TEMP TABLE current190_issue_a_replay AS
SELECT *
FROM public.guest_portal_session_issue_current190_v1(
  '00000000-0000-4000-8000-0000000000a1',
  'current190-tenant-a',
  'current190-store-a1',
  'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('a', 64),
  pg_catalog.repeat('b', 64),
  900
);

DO $assert_issue_replay$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current190_issue_a
    WHERE "tokenVersion" = 1 AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current190_issue_a_replay
    WHERE "tokenVersion" = 1 AND "replayed" = TRUE
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."GuestPortalSessionV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000a1'
  ) <> 1 THEN
    RAISE EXCEPTION 'CURRENT190 session issue replay failed';
  END IF;
END;
$assert_issue_replay$;

CREATE TEMP TABLE current190_issue_a_independent AS
SELECT *
FROM public.guest_portal_session_issue_current190_v1(
  '00000000-0000-4000-8000-0000000000a2',
  'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('6', 64), pg_catalog.repeat('7', 64), 900
);

DO $assert_session_specific_privacy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current190_issue_a_independent
    WHERE "tokenVersion" = 1 AND "replayed" = FALSE
  ) OR (
    SELECT pg_catalog.count(DISTINCT audit."bindingDigest")
    FROM public."GuestPortalSessionAuditV1" AS audit
    WHERE audit."tenantId" = 'current190-tenant-a'
      AND audit."profileId" = 'current190-profile-a'
      AND audit."eventType" = 'ISSUED'
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_entry
    WHERE column_entry.table_schema = 'public'
      AND column_entry.table_name = 'GuestPortalSessionAuditV1'
      AND pg_catalog.lower(column_entry.column_name) ~ '(phone|email)'
  ) OR EXISTS (
    SELECT 1
    FROM public."GuestPortalSessionAuditV1" AS audit
    WHERE pg_catalog.to_jsonb(audit)::TEXT LIKE '%phone-hash-%'
       OR pg_catalog.to_jsonb(audit)::TEXT LIKE '%+79990000000%'
       OR pg_catalog.to_jsonb(audit)::TEXT LIKE '%@example.test%'
  ) THEN
    RAISE EXCEPTION
      'CURRENT190 exposed a stable/contact-derived audit correlator';
  END IF;
END;
$assert_session_specific_privacy$;

CREATE TEMP TABLE current190_assert_a AS
SELECT *
FROM public.guest_portal_session_assert_current190_v1(
  '00000000-0000-4000-8000-0000000000a1', 1,
  'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
);

DO $issue_b_for_reverse_isolation$
BEGIN
  PERFORM * FROM public.guest_portal_session_issue_current190_v1(
    '00000000-0000-4000-8000-0000000000b0',
    'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
    'current190-guest-b',
    pg_catalog.repeat('9', 64), pg_catalog.repeat('8', 64), 900
  );
END;
$issue_b_for_reverse_isolation$;

DO $tenant_aware_audit_fk_denial$
BEGIN
  BEGIN
    PERFORM pg_catalog.set_config(
      'leetplus.guest_portal_session_current190_writer', 'revoke', TRUE
    );
    INSERT INTO public."GuestPortalSessionAuditV1" (
      "id", "tenantId", "sessionId", "eventType", "tokenVersion",
      "storeId", "profileId", "guestId", "bindingDigest", "requestDigest",
      "relatedSessionId", "eventAt", "transactionId", "createdAt"
    ) VALUES (
      'current190-cross-tenant-audit',
      'current190-tenant-b',
      '00000000-0000-4000-8000-0000000000a1',
      'REVOKED', 1,
      'current190-store-b1', 'current190-profile-b', 'current190-guest-b',
      pg_catalog.repeat('8', 64), pg_catalog.repeat('7', 64), NULL,
      pg_catalog.clock_timestamp(), pg_catalog.txid_current()::TEXT,
      pg_catalog.clock_timestamp()
    );
    RAISE EXCEPTION 'CURRENT190 audit FK accepted a cross-tenant session';
  EXCEPTION WHEN SQLSTATE '23503' THEN NULL;
  END;
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer', '', TRUE
  );
END;
$tenant_aware_audit_fk_denial$;

DO $cross_scope_denials$
BEGIN
  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-b', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 A session accepted tenant B';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000b0', 1,
      'current190-tenant-a', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('9', 64), pg_catalog.repeat('8', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 B session accepted tenant A';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-b1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 A session accepted store B1';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-b',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 A session accepted profile B';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-b',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 A session accepted guest B';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'OUTBOUND'
    );
    RAISE EXCEPTION 'CURRENT190 accepted OUTBOUND';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$cross_scope_denials$;

DO $media_scope$
BEGIN
  PERFORM * FROM public.guest_portal_media_assert_current190_v1(
    '00000000-0000-4000-8000-0000000000a1', 1,
    'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
    'current190-guest-a',
    pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
    'current190-asset-a'
  );

  BEGIN
    PERFORM * FROM public.guest_portal_media_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      'current190-asset-b'
    );
    RAISE EXCEPTION 'CURRENT190 A session accepted media B';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_media_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000b0', 1,
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('9', 64), pg_catalog.repeat('8', 64),
      'current190-asset-a'
    );
    RAISE EXCEPTION 'CURRENT190 B session accepted media A';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$media_scope$;

DO $fresh_state_denials$
BEGIN
  INSERT INTO public."Store" (
    "id", "tenantId", "name", "publicSlug", "isActive",
    "gamificationEnabled", "updatedAt"
  ) VALUES (
    'current190-store-a2', 'current190-tenant-a', 'A2',
    'current190-store-a1', TRUE, TRUE, pg_catalog.clock_timestamp()
  );
  BEGIN
    PERFORM * FROM public.guest_portal_public_store_assert_current190_v1(
      'current190-a', 'current190-store-a1'
    );
    RAISE EXCEPTION 'CURRENT190 trusted an ambiguous URL store locator';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  DELETE FROM public."Store" WHERE "id" = 'current190-store-a2';

  UPDATE public."TenantModuleEntitlement"
  SET "writeEnabled" = FALSE, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "tenantId" = 'current190-tenant-a'
    AND "module" = 'GAMIFICATION';
  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'WRITE'
    );
    RAISE EXCEPTION 'CURRENT190 accepted disabled GAMIFICATION WRITE';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."TenantModuleEntitlement"
  SET "writeEnabled" = TRUE, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "tenantId" = 'current190-tenant-a'
    AND "module" = 'GAMIFICATION';

  UPDATE public."Store"
  SET "isActive" = FALSE, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-store-a1';
  BEGIN
    PERFORM * FROM public.guest_portal_public_store_assert_current190_v1(
      'current190-a', 'current190-store-a1'
    );
    RAISE EXCEPTION 'CURRENT190 accepted inactive Store';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."Store"
  SET "isActive" = TRUE, "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-store-a1';

  UPDATE public."Tenant"
  SET "trialEndsAt" = pg_catalog.clock_timestamp() - INTERVAL '1 second',
      "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-tenant-a';
  BEGIN
    PERFORM * FROM public.guest_portal_public_store_assert_current190_v1(
      'current190-a', 'current190-store-a1'
    );
    RAISE EXCEPTION 'CURRENT190 accepted expired trial';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."Tenant"
  SET "trialEndsAt" = pg_catalog.clock_timestamp() + INTERVAL '14 days',
      "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-tenant-a';

  UPDATE public."Tenant"
  SET "status" = 'SUSPENDED', "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-tenant-a';
  BEGIN
    PERFORM * FROM public.guest_portal_public_store_assert_current190_v1(
      'current190-a', 'current190-store-a1'
    );
    RAISE EXCEPTION 'CURRENT190 accepted suspended tenant';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."Tenant"
  SET "status" = 'ACTIVE', "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-tenant-a';

  UPDATE public."GuestGameProfile"
  SET "status" = 'INACTIVE', "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-a';
  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 accepted inactive profile';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."GuestGameProfile"
  SET "status" = 'ACTIVE', "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-a';

  UPDATE public."GuestGameProfile"
  SET
    "phoneHash" =
      'phone-hash-changed-0000000000000000000000000000000000000000000000',
    "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-a';
  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION
      'CURRENT190 assert accepted changed live profile phone binding';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_media_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      'current190-asset-a'
    );
    RAISE EXCEPTION
      'CURRENT190 media accepted changed live profile phone binding';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."GuestGameProfile"
  SET
    "phoneHash" =
      'phone-hash-a-000000000000000000000000000000000000000000000000',
    "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-a';
END;
$fresh_state_denials$;

DO $rotate_source_live_phone_denial$
BEGIN
  UPDATE public."GuestGameProfile"
  SET
    "phoneHash" =
      'phone-hash-changed-0000000000000000000000000000000000000000000000',
    "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-a';
  BEGIN
    PERFORM * FROM public.guest_portal_session_rotate_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      pg_catalog.repeat('c', 64),
      '00000000-0000-4000-8000-0000000000b1',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
    );
    RAISE EXCEPTION
      'CURRENT190 rotate accepted changed live source phone binding';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."GuestGameProfile"
  SET
    "phoneHash" =
      'phone-hash-a-000000000000000000000000000000000000000000000000',
    "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-a';
END;
$rotate_source_live_phone_denial$;

DO $rotate_cross_identity_denial$
BEGIN
  BEGIN
    PERFORM * FROM public.guest_portal_session_rotate_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      pg_catalog.repeat('c', 64),
      '00000000-0000-4000-8000-0000000000b1',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
    );
    RAISE EXCEPTION
      'CURRENT190 rotated phone1 source into phone2 target identity';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$rotate_cross_identity_denial$;

UPDATE public."GuestGameProfile"
SET
  "phoneHash" =
    'phone-hash-a-000000000000000000000000000000000000000000000000',
  "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-profile-b';
UPDATE public."Guest"
SET
  "phoneHash" =
    'phone-hash-a-000000000000000000000000000000000000000000000000',
  "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-guest-b';

CREATE TEMP TABLE current190_rotate_b AS
SELECT *
FROM public.guest_portal_session_rotate_current190_v1(
  '00000000-0000-4000-8000-0000000000a1', 1,
  'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
  pg_catalog.repeat('c', 64),
  '00000000-0000-4000-8000-0000000000b1',
  'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
  'current190-guest-b',
  pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
);

CREATE TEMP TABLE current190_rotate_b_replay AS
SELECT *
FROM public.guest_portal_session_rotate_current190_v1(
  '00000000-0000-4000-8000-0000000000a1', 1,
  'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
  pg_catalog.repeat('c', 64),
  '00000000-0000-4000-8000-0000000000b1',
  'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
  'current190-guest-b',
  pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
);

DO $assert_rotation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current190_rotate_b
    WHERE "tokenVersion" = 2 AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current190_rotate_b_replay
    WHERE "tokenVersion" = 2 AND "replayed" = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public."GuestPortalSessionV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000a1'
      AND "status" = 'ROTATED'
      AND "rotatedToSessionId" =
        '00000000-0000-4000-8000-0000000000b1'
  ) OR NOT EXISTS (
    SELECT 1 FROM public."GuestPortalSessionV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000b1'
      AND "tenantId" = 'current190-tenant-b'
      AND "storeId" = 'current190-store-b1'
      AND "profileId" = 'current190-profile-b'
      AND "guestId" = 'current190-guest-b'
      AND "tokenVersion" = 2
      AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'CURRENT190 atomic rotation failed';
  END IF;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64), 'READ'
    );
    RAISE EXCEPTION 'CURRENT190 old token survived rotation';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_rotate_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      pg_catalog.repeat('7', 64),
      '00000000-0000-4000-8000-0000000000b1',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
    );
    RAISE EXCEPTION 'CURRENT190 accepted changed rotation replay';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;

  UPDATE public."GuestGameProfile"
  SET
    "phoneHash" =
      'phone-hash-changed-0000000000000000000000000000000000000000000000',
    "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-b';
  BEGIN
    PERFORM * FROM public.guest_portal_session_rotate_current190_v1(
      '00000000-0000-4000-8000-0000000000a1', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('a', 64), pg_catalog.repeat('b', 64),
      pg_catalog.repeat('c', 64),
      '00000000-0000-4000-8000-0000000000b1',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64), 900
    );
    RAISE EXCEPTION
      'CURRENT190 rotate replay accepted changed live target phone binding';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  UPDATE public."GuestGameProfile"
  SET
    "phoneHash" =
      'phone-hash-a-000000000000000000000000000000000000000000000000',
    "updatedAt" = pg_catalog.clock_timestamp()
  WHERE "id" = 'current190-profile-b';
END;
$assert_rotation$;

UPDATE public."Tenant"
SET "status" = 'SUSPENDED', "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-tenant-a';
UPDATE public."TenantModuleEntitlement"
SET "writeEnabled" = FALSE, "updatedAt" = pg_catalog.clock_timestamp()
WHERE "tenantId" = 'current190-tenant-a'
  AND "module" = 'GAMIFICATION';
UPDATE public."Store"
SET "isActive" = FALSE, "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-store-a1';
UPDATE public."GuestGameProfile"
SET
  "status" = 'INACTIVE',
  "phoneHash" =
    'phone-hash-changed-0000000000000000000000000000000000000000000000',
  "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-profile-a';
UPDATE public."Guest"
SET "isDisabled" = TRUE, "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-guest-a';

CREATE TEMP TABLE current190_revoke_suspended_a AS
SELECT *
FROM public.guest_portal_session_revoke_current190_v1(
  '00000000-0000-4000-8000-0000000000a2', 1,
  'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('6', 64), pg_catalog.repeat('7', 64),
  pg_catalog.repeat('5', 64)
);

CREATE TEMP TABLE current190_revoke_suspended_a_replay AS
SELECT *
FROM public.guest_portal_session_revoke_current190_v1(
  '00000000-0000-4000-8000-0000000000a2', 1,
  'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
  'current190-guest-a',
  pg_catalog.repeat('6', 64), pg_catalog.repeat('7', 64),
  pg_catalog.repeat('5', 64)
);

UPDATE public."Tenant"
SET "status" = 'ACTIVE', "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-tenant-a';
UPDATE public."TenantModuleEntitlement"
SET "writeEnabled" = TRUE, "updatedAt" = pg_catalog.clock_timestamp()
WHERE "tenantId" = 'current190-tenant-a'
  AND "module" = 'GAMIFICATION';
UPDATE public."Store"
SET "isActive" = TRUE, "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-store-a1';
UPDATE public."GuestGameProfile"
SET
  "status" = 'ACTIVE',
  "phoneHash" =
    'phone-hash-a-000000000000000000000000000000000000000000000000',
  "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-profile-a';
UPDATE public."Guest"
SET "isDisabled" = FALSE, "updatedAt" = pg_catalog.clock_timestamp()
WHERE "id" = 'current190-guest-a';

DO $assert_terminal_revoke_after_reactivation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current190_revoke_suspended_a
    WHERE "status" = 'REVOKED' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current190_revoke_suspended_a_replay
    WHERE "status" = 'REVOKED' AND "replayed" = TRUE
  ) THEN
    RAISE EXCEPTION
      'CURRENT190 terminal revoke failed while identity was suspended';
  END IF;

  BEGIN
    PERFORM * FROM public.guest_portal_session_assert_current190_v1(
      '00000000-0000-4000-8000-0000000000a2', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('6', 64), pg_catalog.repeat('7', 64), 'READ'
    );
    RAISE EXCEPTION
      'CURRENT190 terminally revoked session revived after reactivation';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$assert_terminal_revoke_after_reactivation$;

CREATE TEMP TABLE current190_revoke_b AS
SELECT *
FROM public.guest_portal_session_revoke_current190_v1(
  '00000000-0000-4000-8000-0000000000b1', 2,
  'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
  'current190-guest-b',
  pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64),
  pg_catalog.repeat('f', 64)
);

CREATE TEMP TABLE current190_revoke_b_replay AS
SELECT *
FROM public.guest_portal_session_revoke_current190_v1(
  '00000000-0000-4000-8000-0000000000b1', 2,
  'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
  'current190-guest-b',
  pg_catalog.repeat('d', 64), pg_catalog.repeat('e', 64),
  pg_catalog.repeat('f', 64)
);

DO $assert_revoke_and_audit$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current190_revoke_b
    WHERE "status" = 'REVOKED' AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current190_revoke_b_replay
    WHERE "status" = 'REVOKED' AND "replayed" = TRUE
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."GuestPortalSessionAuditV1"
  ) <> 7 OR EXISTS (
    SELECT 1
    FROM public."GuestPortalSessionV1"
    WHERE "jtiDigest" IN (
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000b1'
    )
  ) THEN
    RAISE EXCEPTION 'CURRENT190 revoke/audit/digest assertion failed';
  END IF;
END;
$assert_revoke_and_audit$;

DO $hostile_tenant_revoke_all_inputs$
BEGIN
  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      NULL::TEXT, pg_catalog.repeat('0', 64), pg_catalog.repeat('1', 64),
      '00000000-0000-4000-8000-0000000000c0', 1
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all accepted NULL tenant';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 63),
      pg_catalog.repeat('1', 64),
      '00000000-0000-4000-8000-0000000000c0', 1
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all accepted invalid fence digest';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('z', 64),
      '00000000-0000-4000-8000-0000000000c0', 1
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all accepted invalid batch digest';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('1', 64), 'not-a-uuid', 1
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all accepted invalid batch UUID';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('1', 64),
      '00000000-0000-4000-8000-0000000000c0', 0
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all accepted zero batch limit';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('1', 64),
      '00000000-0000-4000-8000-0000000000c0', 501
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all accepted oversized batch limit';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-missing-tenant', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('1', 64),
      '00000000-0000-4000-8000-0000000000c0', 1
    );
    RAISE EXCEPTION 'CURRENT190 revoke-all admitted an absent tenant';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$hostile_tenant_revoke_all_inputs$;

DO $issue_bulk_revoke_fixtures$
BEGIN
  PERFORM * FROM public.guest_portal_session_issue_current190_v1(
    '00000000-0000-4000-8000-0000000000b2',
    'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
    'current190-guest-b',
    pg_catalog.repeat('1', 64), pg_catalog.repeat('2', 64), 900
  );
  PERFORM * FROM public.guest_portal_session_issue_current190_v1(
    '00000000-0000-4000-8000-0000000000b3',
    'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
    'current190-guest-b',
    pg_catalog.repeat('3', 64), pg_catalog.repeat('4', 64), 900
  );
  PERFORM * FROM public.guest_portal_session_issue_current190_v1(
    '00000000-0000-4000-8000-0000000000a3',
    'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
    'current190-guest-a',
    pg_catalog.repeat('5', 64), pg_catalog.repeat('0', 64), 900
  );
END;
$issue_bulk_revoke_fixtures$;

CREATE TEMP TABLE current190_revoke_all_b1 AS
SELECT *
FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
  'current190-tenant-b', pg_catalog.repeat('0', 64),
  pg_catalog.repeat('1', 64),
  '00000000-0000-4000-8000-0000000000c1', 1
);

CREATE TEMP TABLE current190_revoke_all_b1_replay AS
SELECT *
FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
  'current190-tenant-b', pg_catalog.repeat('0', 64),
  pg_catalog.repeat('1', 64),
  '00000000-0000-4000-8000-0000000000cf', 1
);

DO $assert_revoke_all_first_batch_and_conflicts$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM current190_revoke_all_b1
    WHERE "batchId" = '00000000-0000-4000-8000-0000000000c1'
      AND "fenceVersion" = 1
      AND "batchSequence" = 1
      AND "fenceStatus" = 'DRAINING'
      AND "revokedCount" = 1
      AND "remainingActiveCount" = 2
      AND "totalRevokedCount" = 1
      AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1
    FROM current190_revoke_all_b1_replay AS replay
    INNER JOIN current190_revoke_all_b1 AS original
      ON original."batchId" = replay."batchId"
     AND original."batchCompletedAt" = replay."batchCompletedAt"
    WHERE replay."replayed" = TRUE
  ) THEN
    RAISE EXCEPTION 'CURRENT190 first revoke-all batch/replay failed';
  END IF;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('1', 64),
      '00000000-0000-4000-8000-0000000000ce', 2
    );
    RAISE EXCEPTION 'CURRENT190 accepted changed batch replay';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('f', 64),
      pg_catalog.repeat('4', 64),
      '00000000-0000-4000-8000-0000000000ce', 1
    );
    RAISE EXCEPTION 'CURRENT190 accepted changed fence request';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;
END;
$assert_revoke_all_first_batch_and_conflicts$;

CREATE TEMP TABLE current190_revoke_all_b2 AS
SELECT *
FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
  'current190-tenant-b', pg_catalog.repeat('0', 64),
  pg_catalog.repeat('2', 64),
  '00000000-0000-4000-8000-0000000000c2', 1
);

CREATE TEMP TABLE current190_revoke_all_b3 AS
SELECT *
FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
  'current190-tenant-b', pg_catalog.repeat('0', 64),
  pg_catalog.repeat('3', 64),
  '00000000-0000-4000-8000-0000000000c3', 1
);

DO $assert_revoke_all_complete$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM current190_revoke_all_b2
    WHERE "batchSequence" = 2
      AND "fenceStatus" = 'DRAINING'
      AND "revokedCount" = 1
      AND "remainingActiveCount" = 1
      AND "totalRevokedCount" = 2
      AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1 FROM current190_revoke_all_b3
    WHERE "batchSequence" = 3
      AND "fenceStatus" = 'CLOSED'
      AND "revokedCount" = 1
      AND "remainingActiveCount" = 0
      AND "totalRevokedCount" = 3
      AND "replayed" = FALSE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public."GuestPortalTenantSessionFenceV1"
    WHERE "tenantId" = 'current190-tenant-b'
      AND "fenceVersion" = 1
      AND "requestDigest" = pg_catalog.repeat('0', 64)
      AND "status" = 'CLOSED'
      AND "batchCount" = 3
      AND "totalRevokedCount" = 3
      AND "completedAt" IS NOT NULL
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."GuestPortalTenantSessionRevokeBatchV1"
    WHERE "tenantId" = 'current190-tenant-b'
  ) <> 3 OR EXISTS (
    SELECT 1
    FROM public."GuestPortalTenantSessionRevokeBatchV1"
    WHERE "tenantId" = 'current190-tenant-b'
      AND "revokedCount" > "batchLimit"
  ) OR EXISTS (
    SELECT 1
    FROM public."GuestPortalSessionV1"
    WHERE "tenantId" = 'current190-tenant-b'
      AND "status" = 'ACTIVE'
  ) OR (
    SELECT pg_catalog.count(*)
    FROM public."GuestPortalSessionAuditV1"
  ) <> 13 OR (
    SELECT pg_catalog.count(*)
    FROM public."GuestPortalSessionAuditV1" AS audit
    INNER JOIN public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
      ON receipt."tenantId" = audit."tenantId"
     AND receipt."batchRequestDigest" = audit."requestDigest"
    INNER JOIN public."GuestPortalSessionV1" AS session
      ON session."tenantId" = audit."tenantId"
     AND session."id" = audit."sessionId"
     AND session."status" = 'REVOKED'
     AND session."revocationRequestDigest" = audit."requestDigest"
    WHERE audit."tenantId" = 'current190-tenant-b'
      AND audit."eventType" = 'REVOKED'
  ) <> 3 OR EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_entry
    WHERE column_entry.table_schema = 'public'
      AND column_entry.table_name IN (
        'GuestPortalTenantSessionFenceV1',
        'GuestPortalTenantSessionRevokeBatchV1'
      )
      AND pg_catalog.lower(column_entry.column_name) ~ '(phone|email)'
  ) THEN
    RAISE EXCEPTION
      'CURRENT190 revoke-all fence, bounds, or audit completeness failed';
  END IF;

  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-b', pg_catalog.repeat('0', 64),
      pg_catalog.repeat('4', 64),
      '00000000-0000-4000-8000-0000000000c4', 1
    );
    RAISE EXCEPTION 'CURRENT190 accepted a new batch after CLOSED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$assert_revoke_all_complete$;

DO $assert_persistent_fence_denials$
BEGIN
  BEGIN
    PERFORM * FROM public.guest_portal_session_issue_current190_v1(
      '00000000-0000-4000-8000-0000000000b4',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('7', 64), pg_catalog.repeat('6', 64), 900
    );
    RAISE EXCEPTION 'CURRENT190 issue survived a CLOSED tenant fence';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.guest_portal_session_rotate_current190_v1(
      '00000000-0000-4000-8000-0000000000a3', 1,
      'current190-tenant-a', 'current190-store-a1', 'current190-profile-a',
      'current190-guest-a',
      pg_catalog.repeat('5', 64), pg_catalog.repeat('0', 64),
      pg_catalog.repeat('6', 64),
      '00000000-0000-4000-8000-0000000000b4',
      'current190-tenant-b', 'current190-store-b1', 'current190-profile-b',
      'current190-guest-b',
      pg_catalog.repeat('7', 64), pg_catalog.repeat('6', 64), 900
    );
    RAISE EXCEPTION 'CURRENT190 rotation entered a CLOSED target tenant';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public."GuestPortalSessionV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000a3'
      AND "tenantId" = 'current190-tenant-a'
      AND "status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'CURRENT190 failed rotation damaged the source session';
  END IF;
END;
$assert_persistent_fence_denials$;

DO $assert_cross_tenant_batch_id_collision_rollback$
BEGIN
  BEGIN
    PERFORM *
    FROM public.guest_portal_sessions_revoke_tenant_current190_v1(
      'current190-tenant-a', pg_catalog.repeat('4', 64),
      pg_catalog.repeat('8', 64),
      '00000000-0000-4000-8000-0000000000c1', 500
    );
    RAISE EXCEPTION 'CURRENT190 accepted cross-tenant batch id reuse';
  EXCEPTION WHEN SQLSTATE '23505' THEN NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM public."GuestPortalTenantSessionFenceV1"
    WHERE "tenantId" = 'current190-tenant-a'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public."GuestPortalSessionV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000a3'
      AND "tenantId" = 'current190-tenant-a'
      AND "status" = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1
    FROM public."GuestPortalSessionAuditV1"
    WHERE "sessionId" = '00000000-0000-4000-8000-0000000000a3'
      AND "eventType" = 'REVOKED'
  ) THEN
    RAISE EXCEPTION
      'CURRENT190 cross-tenant batch collision was not atomic';
  END IF;
END;
$assert_cross_tenant_batch_id_collision_rollback$;

DO $direct_revoke_all_write_denials$
BEGIN
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    'current190-tenant-a', TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    'current190-tenant-b', TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer', 'revoke_all', TRUE
  );

  BEGIN
    INSERT INTO public."GuestPortalTenantSessionRevokeBatchV1" (
      "id", "tenantId", "fenceVersion", "fenceRequestDigest",
      "batchRequestDigest", "batchSequence", "batchLimit", "revokedCount",
      "remainingActiveCount", "totalRevokedCount", "fenceStatus",
      "completedAt", "createdAt"
    ) VALUES (
      '00000000-0000-4000-8000-0000000000c4',
      'current190-tenant-a', 1, pg_catalog.repeat('0', 64),
      pg_catalog.repeat('4', 64), 1, 1, 1, 1, 1, 'DRAINING',
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    );
    RAISE EXCEPTION 'CURRENT190 accepted a cross-tenant direct batch';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    'current190-tenant-b', TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id', '', TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer', '', TRUE
  );

  BEGIN
    UPDATE public."GuestPortalTenantSessionFenceV1"
    SET "updatedAt" = pg_catalog.clock_timestamp()
    WHERE "tenantId" = 'current190-tenant-b';
    RAISE EXCEPTION 'CURRENT190 accepted a direct fence update';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    DELETE FROM public."GuestPortalTenantSessionFenceV1"
    WHERE "tenantId" = 'current190-tenant-b';
    RAISE EXCEPTION 'CURRENT190 accepted a direct fence delete';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    DELETE FROM public."GuestPortalTenantSessionRevokeBatchV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000c1';
    RAISE EXCEPTION 'CURRENT190 accepted a direct batch delete';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$direct_revoke_all_write_denials$;

DO $direct_write_denials$
BEGIN
  BEGIN
    PERFORM pg_catalog.set_config(
      'leetplus.guest_portal_session_current190_writer', '', TRUE
    );
    UPDATE public."GuestPortalSessionV1"
    SET "status" = 'ACTIVE'
    WHERE "id" = '00000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'CURRENT190 direct session update unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  BEGIN
    DELETE FROM public."GuestPortalSessionAuditV1"
    WHERE "id" = '00000000-0000-4000-8000-0000000000b1:REVOKED';
    RAISE EXCEPTION 'CURRENT190 direct audit delete unexpectedly passed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$direct_write_denials$;

ROLLBACK;

DO $assert_zero_residue$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public."GuestPortalSessionV1") <> 0
     OR (
       SELECT pg_catalog.count(*)
       FROM public."GuestPortalSessionAuditV1"
     ) <> 0
     OR (
       SELECT pg_catalog.count(*)
       FROM public."GuestPortalTenantSessionFenceV1"
     ) <> 0
     OR (
       SELECT pg_catalog.count(*)
       FROM public."GuestPortalTenantSessionRevokeBatchV1"
     ) <> 0 THEN
    RAISE EXCEPTION 'CURRENT190 smoke left persisted fixture residue';
  END IF;
END;
$assert_zero_residue$;

-- CURRENT190: dormant persisted public guest session boundary.
-- NONCANONICAL / NOT_DEPLOYABLE / NO APPLICATION GRANTS / NO ROUTE ENABLEMENT.
BEGIN;

CREATE TABLE public."GuestPortalSessionV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "guestId" TEXT,
  "tokenVersion" INTEGER NOT NULL,
  "jtiDigest" CHAR(64) NOT NULL,
  "phoneBindingDigest" CHAR(64) NOT NULL,
  "bindingDigest" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "parentSessionId" TEXT,
  "parentRotationRequestDigest" CHAR(64),
  "rotatedToSessionId" TEXT,
  "rotationRequestDigest" CHAR(64),
  "rotatedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revocationRequestDigest" CHAR(64),
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "GuestPortalSessionV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestPortalSessionV1_tenant_id_key" UNIQUE ("tenantId", "id"),
  CONSTRAINT "GuestPortalSessionV1_version_check" CHECK (
    "tokenVersion" >= 1 AND "tokenVersion" <= 2147483647
  ),
  CONSTRAINT "GuestPortalSessionV1_digest_check" CHECK (
    "jtiDigest" ~ '^[a-f0-9]{64}$'
    AND "phoneBindingDigest" ~ '^[a-f0-9]{64}$'
    AND "bindingDigest" ~ '^[a-f0-9]{64}$'
    AND (
      "parentRotationRequestDigest" IS NULL
      OR "parentRotationRequestDigest" ~ '^[a-f0-9]{64}$'
    )
    AND (
      "rotationRequestDigest" IS NULL
      OR "rotationRequestDigest" ~ '^[a-f0-9]{64}$'
    )
    AND (
      "revocationRequestDigest" IS NULL
      OR "revocationRequestDigest" ~ '^[a-f0-9]{64}$'
    )
  ),
  CONSTRAINT "GuestPortalSessionV1_expiry_check" CHECK (
    "expiresAt" > "issuedAt"
    AND "expiresAt" <= "issuedAt" + INTERVAL '60 minutes'
  ),
  CONSTRAINT "GuestPortalSessionV1_state_check" CHECK (
    (
      "status" = 'ACTIVE'
      AND "rotatedToSessionId" IS NULL
      AND "rotationRequestDigest" IS NULL
      AND "rotatedAt" IS NULL
      AND "revocationRequestDigest" IS NULL
      AND "revokedAt" IS NULL
    )
    OR
    (
      "status" = 'ROTATED'
      AND "rotatedToSessionId" IS NOT NULL
      AND "rotationRequestDigest" IS NOT NULL
      AND "rotatedAt" IS NOT NULL
      AND "revocationRequestDigest" IS NULL
      AND "revokedAt" IS NULL
    )
    OR
    (
      "status" = 'REVOKED'
      AND "rotatedToSessionId" IS NULL
      AND "rotatedAt" IS NULL
      AND "revocationRequestDigest" IS NOT NULL
      AND "revokedAt" IS NOT NULL
    )
  ),
  CONSTRAINT "GuestPortalSessionV1_parent_check" CHECK (
    (
      "parentSessionId" IS NULL
      AND "parentRotationRequestDigest" IS NULL
    )
    OR
    (
      "parentSessionId" IS NOT NULL
      AND "parentRotationRequestDigest" IS NOT NULL
    )
  )
);

CREATE TABLE public."GuestPortalSessionAuditV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "eventType" VARCHAR(16) NOT NULL,
  "tokenVersion" INTEGER NOT NULL,
  "storeId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "guestId" TEXT,
  "bindingDigest" CHAR(64) NOT NULL,
  "requestDigest" CHAR(64),
  "relatedSessionId" TEXT,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "transactionId" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL
    DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "GuestPortalSessionAuditV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestPortalSessionAuditV1_event_check" CHECK (
    "eventType" IN ('ISSUED', 'ROTATED', 'REVOKED')
  ),
  CONSTRAINT "GuestPortalSessionAuditV1_digest_check" CHECK (
    "bindingDigest" ~ '^[a-f0-9]{64}$'
    AND (
      "requestDigest" IS NULL
      OR "requestDigest" ~ '^[a-f0-9]{64}$'
    )
  )
);

CREATE TABLE public."GuestPortalTenantSessionFenceV1" (
  "tenantId" TEXT NOT NULL,
  "fenceVersion" INTEGER NOT NULL DEFAULT 1,
  "requestDigest" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "batchCount" INTEGER NOT NULL DEFAULT 0,
  "totalRevokedCount" BIGINT NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "completedAt" TIMESTAMP(3) WITH TIME ZONE,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "GuestPortalTenantSessionFenceV1_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "GuestPortalTenantSessionFenceV1_tenant_request_key" UNIQUE (
    "tenantId", "requestDigest"
  ),
  CONSTRAINT "GuestPortalTenantSessionFenceV1_shape_check" CHECK (
    "fenceVersion" = 1
    AND "requestDigest" ~ '^[a-f0-9]{64}$'
    AND "batchCount" >= 0
    AND "totalRevokedCount" >= 0
    AND (
      (
        "status" = 'DRAINING'
        AND "completedAt" IS NULL
      )
      OR
      (
        "status" = 'CLOSED'
        AND "completedAt" IS NOT NULL
        AND "completedAt" >= "startedAt"
      )
    )
  )
);

CREATE TABLE public."GuestPortalTenantSessionRevokeBatchV1" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fenceVersion" INTEGER NOT NULL,
  "fenceRequestDigest" CHAR(64) NOT NULL,
  "batchRequestDigest" CHAR(64) NOT NULL,
  "batchSequence" INTEGER NOT NULL,
  "batchLimit" INTEGER NOT NULL,
  "revokedCount" INTEGER NOT NULL,
  "remainingActiveCount" BIGINT NOT NULL,
  "totalRevokedCount" BIGINT NOT NULL,
  "fenceStatus" VARCHAR(16) NOT NULL,
  "completedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "GuestPortalTenantSessionRevokeBatchV1_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestPortalTenantSessionRevokeBatchV1_request_key" UNIQUE (
    "tenantId", "batchRequestDigest"
  ),
  CONSTRAINT "GuestPortalTenantSessionRevokeBatchV1_sequence_key" UNIQUE (
    "tenantId", "batchSequence"
  ),
  CONSTRAINT "GuestPortalTenantSessionRevokeBatchV1_shape_check" CHECK (
    "id" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "fenceVersion" = 1
    AND "fenceRequestDigest" ~ '^[a-f0-9]{64}$'
    AND "batchRequestDigest" ~ '^[a-f0-9]{64}$'
    AND "batchSequence" >= 1
    AND "batchLimit" BETWEEN 1 AND 500
    AND "revokedCount" BETWEEN 0 AND "batchLimit"
    AND "remainingActiveCount" >= 0
    AND "totalRevokedCount" >= "revokedCount"
    AND (
      (
        "fenceStatus" = 'DRAINING'
        AND "revokedCount" > 0
        AND "remainingActiveCount" > 0
      )
      OR
      (
        "fenceStatus" = 'CLOSED'
        AND "remainingActiveCount" = 0
      )
    )
  )
);

CREATE UNIQUE INDEX "guest_portal_session_jti_digest_uidx"
ON public."GuestPortalSessionV1" ("jtiDigest");

CREATE UNIQUE INDEX "guest_portal_session_rotated_to_uidx"
ON public."GuestPortalSessionV1" ("rotatedToSessionId")
WHERE "rotatedToSessionId" IS NOT NULL;

CREATE INDEX "guest_portal_session_scope_status_expiry_idx"
ON public."GuestPortalSessionV1" (
  "tenantId", "storeId", "status", "expiresAt", "id"
);

CREATE INDEX "guest_portal_session_profile_status_idx"
ON public."GuestPortalSessionV1" (
  "tenantId", "profileId", "status", "expiresAt"
);

CREATE UNIQUE INDEX "guest_portal_session_audit_event_uidx"
ON public."GuestPortalSessionAuditV1" ("sessionId", "eventType");

CREATE INDEX "guest_portal_session_audit_tenant_event_idx"
ON public."GuestPortalSessionAuditV1" (
  "tenantId", "eventAt", "sessionId"
);

ALTER TABLE public."GuestPortalSessionV1"
ADD CONSTRAINT "guest_portal_session_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalSessionV1"
ADD CONSTRAINT "guest_portal_session_store_fkey"
FOREIGN KEY ("tenantId", "storeId")
REFERENCES public."Store"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalSessionV1"
ADD CONSTRAINT "guest_portal_session_profile_fkey"
FOREIGN KEY ("tenantId", "profileId")
REFERENCES public."GuestGameProfile"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalSessionV1"
ADD CONSTRAINT "guest_portal_session_guest_fkey"
FOREIGN KEY ("tenantId", "guestId")
REFERENCES public."Guest"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalSessionV1"
ADD CONSTRAINT "guest_portal_session_parent_fkey"
FOREIGN KEY ("parentSessionId")
REFERENCES public."GuestPortalSessionV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalSessionV1"
ADD CONSTRAINT "guest_portal_session_rotated_to_fkey"
FOREIGN KEY ("rotatedToSessionId")
REFERENCES public."GuestPortalSessionV1"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public."GuestPortalSessionAuditV1"
ADD CONSTRAINT "guest_portal_session_audit_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalSessionAuditV1"
ADD CONSTRAINT "guest_portal_session_audit_session_fkey"
FOREIGN KEY ("tenantId", "sessionId")
REFERENCES public."GuestPortalSessionV1"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalTenantSessionFenceV1"
ADD CONSTRAINT "guest_portal_tenant_session_fence_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalTenantSessionRevokeBatchV1"
ADD CONSTRAINT "guest_portal_tenant_session_batch_tenant_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."GuestPortalTenantSessionRevokeBatchV1"
ADD CONSTRAINT "guest_portal_tenant_session_batch_fence_fkey"
FOREIGN KEY ("tenantId", "fenceRequestDigest")
REFERENCES public."GuestPortalTenantSessionFenceV1"(
  "tenantId", "requestDigest"
)
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A future relation grant must still be tenant-scoped. Every sealed RPC sets
-- the primary tenant GUC before touching these relations. Rotation also sets
-- one peer tenant because it atomically invalidates A and creates B.
ALTER TABLE public."GuestPortalSessionV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GuestPortalSessionV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_portal_session_tenant_policy_current190"
ON public."GuestPortalSessionV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
);

ALTER TABLE public."GuestPortalSessionAuditV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GuestPortalSessionAuditV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_portal_session_audit_tenant_policy_current190"
ON public."GuestPortalSessionAuditV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
);

ALTER TABLE public."GuestPortalTenantSessionFenceV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GuestPortalTenantSessionFenceV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_portal_tenant_session_fence_policy_current190"
ON public."GuestPortalTenantSessionFenceV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
);

ALTER TABLE public."GuestPortalTenantSessionRevokeBatchV1"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GuestPortalTenantSessionRevokeBatchV1"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "guest_portal_tenant_session_batch_policy_current190"
ON public."GuestPortalTenantSessionRevokeBatchV1"
USING (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
)
WITH CHECK (
  "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_tenant_id', true
  )
  OR "tenantId" = pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_peer_tenant_id', true
  )
);

CREATE FUNCTION public.guest_portal_session_row_guard_current190_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
DECLARE
  writer_mode TEXT := pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_writer', true
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Guest portal sessions cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF writer_mode NOT IN ('issue', 'rotate')
       OR NEW."status" <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Invalid guest portal session insert authority'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF writer_mode = 'rotate' THEN
    IF OLD."status" <> 'ACTIVE'
       OR NEW."status" <> 'ROTATED'
       OR (
         pg_catalog.to_jsonb(NEW)
         - ARRAY[
           'status', 'rotatedToSessionId', 'rotationRequestDigest',
           'rotatedAt', 'updatedAt'
         ]::TEXT[]
       ) IS DISTINCT FROM (
         pg_catalog.to_jsonb(OLD)
         - ARRAY[
           'status', 'rotatedToSessionId', 'rotationRequestDigest',
           'rotatedAt', 'updatedAt'
         ]::TEXT[]
       ) THEN
      RAISE EXCEPTION 'Invalid guest portal session rotation transition'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF writer_mode IN ('revoke', 'revoke_all') THEN
    IF OLD."status" <> 'ACTIVE'
       OR NEW."status" <> 'REVOKED'
       OR (
         pg_catalog.to_jsonb(NEW)
         - ARRAY[
           'status', 'revocationRequestDigest', 'revokedAt', 'updatedAt'
         ]::TEXT[]
       ) IS DISTINCT FROM (
         pg_catalog.to_jsonb(OLD)
         - ARRAY[
           'status', 'revocationRequestDigest', 'revokedAt', 'updatedAt'
         ]::TEXT[]
       ) THEN
      RAISE EXCEPTION 'Invalid guest portal session revocation transition'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Guest portal sessions are immutable outside sealed RPCs'
    USING ERRCODE = '42501';
END;
$guard$;

CREATE FUNCTION public.guest_portal_session_audit_guard_current190_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
DECLARE
  writer_mode TEXT := pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_writer', true
  );
BEGIN
  IF TG_OP <> 'INSERT'
     OR writer_mode NOT IN ('issue', 'rotate', 'revoke', 'revoke_all') THEN
    RAISE EXCEPTION 'Guest portal session audit is append-only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.guest_portal_tenant_session_fence_guard_current190_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
DECLARE
  writer_mode TEXT := pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_writer', true
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Guest portal tenant session fences cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF writer_mode <> 'revoke_all'
       OR NEW."status" <> 'DRAINING'
       OR NEW."batchCount" <> 0
       OR NEW."totalRevokedCount" <> 0
       OR NEW."completedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid guest portal tenant session fence insert'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF writer_mode <> 'revoke_all'
     OR NEW."tenantId" <> OLD."tenantId"
     OR NEW."fenceVersion" <> OLD."fenceVersion"
     OR NEW."requestDigest" <> OLD."requestDigest"
     OR NEW."startedAt" <> OLD."startedAt"
     OR NEW."batchCount" <> OLD."batchCount" + 1
     OR NEW."totalRevokedCount" < OLD."totalRevokedCount"
     OR (
       OLD."status" = 'DRAINING'
       AND NEW."status" NOT IN ('DRAINING', 'CLOSED')
     )
     OR (OLD."status" = 'CLOSED' AND NEW."status" <> 'CLOSED')
     OR (
       OLD."status" = 'CLOSED'
       AND NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
     ) THEN
    RAISE EXCEPTION 'Invalid guest portal tenant session fence transition'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.guest_portal_tenant_session_batch_guard_current190_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
DECLARE
  writer_mode TEXT := pg_catalog.current_setting(
    'leetplus.guest_portal_session_current190_writer', true
  );
  fence_row public."GuestPortalTenantSessionFenceV1"%ROWTYPE;
  fence_found BOOLEAN;
  previous_batch_count INTEGER;
  previous_total_revoked_count BIGINT;
  current_active_count BIGINT;
  complete_audit_count BIGINT;
  complete_session_count BIGINT;
BEGIN
  IF TG_OP <> 'INSERT' OR writer_mode <> 'revoke_all' THEN
    RAISE EXCEPTION 'Guest portal tenant revoke batches are append-only'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO fence_row
  FROM public."GuestPortalTenantSessionFenceV1" AS fence
  WHERE fence."tenantId" = NEW."tenantId"
  FOR SHARE;
  fence_found := FOUND;

  SELECT
    pg_catalog.count(*)::INTEGER,
    COALESCE(pg_catalog.max(receipt."totalRevokedCount"), 0)::BIGINT
  INTO previous_batch_count, previous_total_revoked_count
  FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
  WHERE receipt."tenantId" = NEW."tenantId";

  SELECT pg_catalog.count(*)::BIGINT
  INTO current_active_count
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."tenantId" = NEW."tenantId"
    AND session."status" = 'ACTIVE';

  SELECT pg_catalog.count(*)::BIGINT
  INTO complete_audit_count
  FROM public."GuestPortalSessionAuditV1" AS audit
  WHERE audit."tenantId" = NEW."tenantId"
    AND audit."eventType" = 'REVOKED'
    AND audit."requestDigest" IN (
      SELECT receipt."batchRequestDigest"
      FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
      WHERE receipt."tenantId" = NEW."tenantId"
      UNION ALL
      SELECT NEW."batchRequestDigest"
    );

  SELECT pg_catalog.count(*)::BIGINT
  INTO complete_session_count
  FROM public."GuestPortalSessionV1" AS session
  INNER JOIN public."GuestPortalSessionAuditV1" AS audit
    ON audit."tenantId" = session."tenantId"
   AND audit."sessionId" = session."id"
   AND audit."eventType" = 'REVOKED'
   AND audit."requestDigest" = session."revocationRequestDigest"
  WHERE session."tenantId" = NEW."tenantId"
    AND session."status" = 'REVOKED'
    AND session."revocationRequestDigest" IN (
      SELECT receipt."batchRequestDigest"
      FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
      WHERE receipt."tenantId" = NEW."tenantId"
      UNION ALL
      SELECT NEW."batchRequestDigest"
    );

  IF NOT fence_found
     OR fence_row."fenceVersion" <> NEW."fenceVersion"
     OR fence_row."requestDigest" <> NEW."fenceRequestDigest"
     OR fence_row."batchCount" <> NEW."batchSequence"
     OR fence_row."status" <> NEW."fenceStatus"
     OR fence_row."totalRevokedCount" <> NEW."totalRevokedCount"
     OR fence_row."updatedAt" <> NEW."completedAt"
     OR previous_batch_count <> NEW."batchSequence" - 1
     OR previous_total_revoked_count + NEW."revokedCount" <>
        NEW."totalRevokedCount"
     OR current_active_count <> NEW."remainingActiveCount"
     OR complete_audit_count <> NEW."totalRevokedCount"
     OR complete_session_count <> NEW."totalRevokedCount" THEN
    RAISE EXCEPTION 'Guest portal tenant revoke batch is incomplete'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$guard$;

CREATE TRIGGER "guest_portal_session_row_guard_current190"
BEFORE INSERT OR UPDATE OR DELETE
ON public."GuestPortalSessionV1"
FOR EACH ROW EXECUTE FUNCTION
public.guest_portal_session_row_guard_current190_v1();

CREATE TRIGGER "guest_portal_session_audit_guard_current190"
BEFORE INSERT OR UPDATE OR DELETE
ON public."GuestPortalSessionAuditV1"
FOR EACH ROW EXECUTE FUNCTION
public.guest_portal_session_audit_guard_current190_v1();

CREATE TRIGGER "guest_portal_tenant_session_fence_guard_current190"
BEFORE INSERT OR UPDATE OR DELETE
ON public."GuestPortalTenantSessionFenceV1"
FOR EACH ROW EXECUTE FUNCTION
public.guest_portal_tenant_session_fence_guard_current190_v1();

CREATE TRIGGER "guest_portal_tenant_session_batch_guard_current190"
BEFORE INSERT OR UPDATE OR DELETE
ON public."GuestPortalTenantSessionRevokeBatchV1"
FOR EACH ROW EXECUTE FUNCTION
public.guest_portal_tenant_session_batch_guard_current190_v1();

CREATE FUNCTION public.guest_portal_session_binding_validate_current190_v1(
  target_session_id TEXT,
  expected_token_version INTEGER,
  expected_jti_digest TEXT,
  expected_binding_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF target_session_id IS NULL
     OR target_session_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_token_version IS NULL
     OR expected_token_version < 1
     OR expected_token_version > 2147483647
     OR expected_jti_digest IS NULL
     OR expected_jti_digest !~ '^[a-f0-9]{64}$'
     OR expected_binding_digest IS NULL
     OR expected_binding_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid guest portal persisted session binding input'
      USING ERRCODE = '22023';
  END IF;
END;
$function$;

CREATE FUNCTION public.guest_portal_store_admit_current190_v1(
  target_tenant_id TEXT,
  target_store_id TEXT,
  requested_action TEXT,
  server_now TIMESTAMP(3) WITH TIME ZONE
)
RETURNS TABLE (
  "executionRevision" INTEGER,
  "entitlementProfileRevision" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  tenant_row RECORD;
  entitlement_row RECORD;
  entitlement_count INTEGER;
  entitlement_module_count INTEGER;
  entitlement_revision_match BOOLEAN;
  tenant_found BOOLEAN;
  gamification_entitlement_found BOOLEAN;
  store_found BOOLEAN;
  admission_now TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF target_tenant_id IS NULL OR pg_catalog.length(target_tenant_id) < 1
     OR target_store_id IS NULL OR pg_catalog.length(target_store_id) < 1
     OR requested_action IS NULL
     OR requested_action NOT IN ('READ', 'WRITE')
     OR server_now IS NULL THEN
    RAISE EXCEPTION 'Invalid guest portal store admission input'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    tenant."status"::TEXT AS status,
    tenant."customerStage"::TEXT AS customer_stage,
    tenant."onboardingStatus"::TEXT AS onboarding_status,
    tenant."trialStartsAt" AS trial_starts_at,
    tenant."trialEndsAt" AS trial_ends_at,
    tenant."entitlementProfileRevision" AS profile_revision,
    tenant."executionRevision" AS execution_revision
  INTO tenant_row
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
  FOR SHARE;
  tenant_found := FOUND;

  IF NOT tenant_found THEN
    RAISE EXCEPTION 'Guest portal tenant is not admitted'
      USING ERRCODE = '42501';
  END IF;

  -- The Tenant row is already locked. Absence of a fence is therefore stable
  -- until this transaction finishes; revoke-all must first take Tenant FOR
  -- UPDATE before it can create the persistent fence row.
  PERFORM fence."tenantId"
  FROM public."GuestPortalTenantSessionFenceV1" AS fence
  WHERE fence."tenantId" = target_tenant_id
  FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'Guest portal tenant session fence is closed'
      USING ERRCODE = '42501';
  END IF;

  -- Keep one lock order in every RPC: Tenant -> fence -> all entitlements
  -- (stable module/id order) -> Store -> Profile -> optional Guest -> session.
  PERFORM entitlement."id"
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = target_tenant_id
  ORDER BY entitlement."module"::TEXT, entitlement."id"
  FOR SHARE;

  SELECT
    pg_catalog.count(*)::INTEGER,
    pg_catalog.count(DISTINCT entitlement."module")::INTEGER,
    pg_catalog.bool_and(
      entitlement."profileRevision" = tenant_row.profile_revision
    )
  INTO
    entitlement_count,
    entitlement_module_count,
    entitlement_revision_match
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = target_tenant_id;

  SELECT
    entitlement."readEnabled" AS read_enabled,
    entitlement."writeEnabled" AS write_enabled,
    entitlement."outboundEnabled" AS outbound_enabled,
    entitlement."validFrom" AS valid_from,
    entitlement."validUntil" AS valid_until,
    entitlement."profileRevision" AS profile_revision
  INTO entitlement_row
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = target_tenant_id
    AND entitlement."module"::TEXT = 'GAMIFICATION';
  gamification_entitlement_found := FOUND;

  PERFORM 1
  FROM public."Store" AS store
  WHERE store."tenantId" = target_tenant_id
    AND store."id" = target_store_id
    AND store."isActive" = TRUE
    AND store."gamificationEnabled" = TRUE
  FOR SHARE;
  store_found := FOUND;

  -- Evaluate every time window only after the complete admission lock set has
  -- been acquired. A caller that waited behind any row mutation therefore
  -- cannot reuse the timestamp captured before that wait.
  admission_now := pg_catalog.clock_timestamp();

  IF tenant_row.status <> 'ACTIVE'
     OR tenant_row.customer_stage NOT IN ('PILOT', 'BETA', 'LIVE')
     OR tenant_row.onboarding_status NOT IN ('ONBOARDING', 'READY', 'ACTIVE')
     OR tenant_row.profile_revision < 1
     OR tenant_row.execution_revision < 1 THEN
    RAISE EXCEPTION 'Guest portal tenant is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF tenant_row.customer_stage IN ('PILOT', 'BETA') AND (
    tenant_row.trial_starts_at IS NULL
    OR tenant_row.trial_ends_at IS NULL
    OR tenant_row.trial_starts_at >= tenant_row.trial_ends_at
    OR admission_now < tenant_row.trial_starts_at
    OR admission_now >= tenant_row.trial_ends_at
  ) THEN
    RAISE EXCEPTION 'Guest portal trial is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF entitlement_count <> 6
     OR entitlement_module_count <> 6
     OR entitlement_revision_match IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Guest portal entitlement profile is incomplete'
      USING ERRCODE = '42501';
  END IF;

  IF NOT gamification_entitlement_found
     OR entitlement_row.profile_revision <> tenant_row.profile_revision
     OR entitlement_row.read_enabled IS DISTINCT FROM TRUE
     OR (
       requested_action = 'WRITE'
       AND entitlement_row.write_enabled IS DISTINCT FROM TRUE
     )
     OR (
       entitlement_row.write_enabled
       AND NOT entitlement_row.read_enabled
     )
     OR (
       entitlement_row.outbound_enabled
       AND NOT entitlement_row.write_enabled
     )
     OR (
       entitlement_row.valid_from IS NOT NULL
       AND entitlement_row.valid_until IS NOT NULL
       AND entitlement_row.valid_from >= entitlement_row.valid_until
     )
     OR (
       entitlement_row.valid_from IS NOT NULL
       AND admission_now < entitlement_row.valid_from
     )
     OR (
       entitlement_row.valid_until IS NOT NULL
       AND admission_now >= entitlement_row.valid_until
     ) THEN
    RAISE EXCEPTION 'Guest portal GAMIFICATION entitlement is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF NOT store_found THEN
    RAISE EXCEPTION 'Guest portal store is not admitted'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT
    tenant_row.execution_revision::INTEGER,
    tenant_row.profile_revision::INTEGER;
END;
$function$;

CREATE FUNCTION public.guest_portal_profile_phone_binding_current190_v1(
  target_tenant_id TEXT,
  target_profile_id TEXT,
  target_guest_id TEXT,
  require_active_identity BOOLEAN
)
RETURNS TABLE (
  "phoneBindingDigest" TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  profile_row RECORD;
  guest_row RECORD;
BEGIN
  IF target_tenant_id IS NULL OR pg_catalog.length(target_tenant_id) < 1
     OR target_profile_id IS NULL OR pg_catalog.length(target_profile_id) < 1
     OR require_active_identity IS NULL THEN
    RAISE EXCEPTION 'Invalid guest portal profile binding input'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    profile."guestId" AS guest_id,
    profile."phoneHash" AS phone_hash,
    profile."status" AS status
  INTO profile_row
  FROM public."GuestGameProfile" AS profile
  WHERE profile."tenantId" = target_tenant_id
    AND profile."id" = target_profile_id
  FOR SHARE;

  IF NOT FOUND
     OR profile_row.phone_hash IS NULL
     OR pg_catalog.length(profile_row.phone_hash) < 16
     OR profile_row.guest_id IS DISTINCT FROM target_guest_id
     OR (
       require_active_identity
       AND profile_row.status <> 'ACTIVE'
     ) THEN
    RAISE EXCEPTION 'Guest portal profile binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF target_guest_id IS NOT NULL THEN
    SELECT guest."isDisabled" AS is_disabled
    INTO guest_row
    FROM public."Guest" AS guest
    WHERE guest."tenantId" = target_tenant_id
      AND guest."id" = target_guest_id
    FOR SHARE;

    IF NOT FOUND
       OR (require_active_identity AND guest_row.is_disabled) THEN
      RAISE EXCEPTION 'Guest portal guest binding is not admitted'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY SELECT
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(profile_row.phone_hash, 'UTF8')
      ),
      'hex'
    );
END;
$function$;

CREATE FUNCTION public.guest_portal_identity_admit_current190_v1(
  target_tenant_id TEXT,
  target_store_id TEXT,
  target_profile_id TEXT,
  target_guest_id TEXT,
  requested_action TEXT,
  server_now TIMESTAMP(3) WITH TIME ZONE
)
RETURNS TABLE (
  "executionRevision" INTEGER,
  "entitlementProfileRevision" INTEGER,
  "phoneBindingDigest" TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  scope_row RECORD;
  identity_row RECORD;
BEGIN
  SELECT * INTO scope_row
  FROM public.guest_portal_store_admit_current190_v1(
    target_tenant_id,
    target_store_id,
    requested_action,
    server_now
  );

  SELECT * INTO identity_row
  FROM public.guest_portal_profile_phone_binding_current190_v1(
    target_tenant_id,
    target_profile_id,
    target_guest_id,
    TRUE
  );

  RETURN QUERY SELECT
    scope_row."executionRevision"::INTEGER,
    scope_row."entitlementProfileRevision"::INTEGER,
    identity_row."phoneBindingDigest"::TEXT;
END;
$function$;

-- Revocation is a terminal safety operation. It must remain persistable while
-- a tenant, entitlement, Store, profile or Guest is suspended/disabled, but it
-- still acquires the same tenant-first row-lock order and proves exact row
-- ownership before touching a session.
CREATE FUNCTION public.guest_portal_identity_lock_current190_v1(
  target_tenant_id TEXT,
  target_store_id TEXT,
  target_profile_id TEXT,
  target_guest_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  profile_guest_id TEXT;
BEGIN
  IF target_tenant_id IS NULL OR pg_catalog.length(target_tenant_id) < 1
     OR target_store_id IS NULL OR pg_catalog.length(target_store_id) < 1
     OR target_profile_id IS NULL OR pg_catalog.length(target_profile_id) < 1
     OR (target_guest_id IS NOT NULL AND pg_catalog.length(target_guest_id) < 1)
     THEN
    RAISE EXCEPTION 'Invalid guest portal revocation identity input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM tenant."id"
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest portal revocation tenant binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  -- Terminal per-session revoke stays available behind the tenant fence, but
  -- follows the same Tenant -> fence -> entitlements lock prefix.
  PERFORM fence."tenantId"
  FROM public."GuestPortalTenantSessionFenceV1" AS fence
  WHERE fence."tenantId" = target_tenant_id
  FOR SHARE;

  PERFORM entitlement."id"
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = target_tenant_id
  ORDER BY entitlement."module"::TEXT, entitlement."id"
  FOR SHARE;

  PERFORM store."id"
  FROM public."Store" AS store
  WHERE store."tenantId" = target_tenant_id
    AND store."id" = target_store_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest portal revocation Store binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  SELECT profile."guestId"
  INTO profile_guest_id
  FROM public."GuestGameProfile" AS profile
  WHERE profile."tenantId" = target_tenant_id
    AND profile."id" = target_profile_id
  FOR SHARE;
  IF NOT FOUND OR profile_guest_id IS DISTINCT FROM target_guest_id THEN
    RAISE EXCEPTION 'Guest portal revocation profile binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF target_guest_id IS NOT NULL THEN
    PERFORM guest."id"
    FROM public."Guest" AS guest
    WHERE guest."tenantId" = target_tenant_id
      AND guest."id" = target_guest_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Guest portal revocation Guest binding is not admitted'
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$function$;

CREATE FUNCTION public.guest_portal_public_store_assert_current190_v1(
  target_tenant_slug TEXT,
  target_store_locator TEXT
)
RETURNS TABLE (
  "tenantId" TEXT,
  "storeId" TEXT,
  "executionRevision" INTEGER,
  "entitlementProfileRevision" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  target_tenant_id TEXT;
  target_store_id TEXT;
  locator_match_count INTEGER;
  scope_row RECORD;
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
BEGIN
  IF target_tenant_slug IS NULL OR pg_catalog.length(target_tenant_slug) < 1
     OR target_store_locator IS NULL
     OR pg_catalog.length(target_store_locator) < 1 THEN
    RAISE EXCEPTION 'Invalid guest portal public store input'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO locator_match_count
  FROM public."Tenant" AS tenant
  INNER JOIN public."Store" AS store
    ON store."tenantId" = tenant."id"
  WHERE tenant."slug" = target_tenant_slug
    AND (
      store."id" = target_store_locator
      OR store."publicSlug" = target_store_locator
    );

  IF locator_match_count <> 1 THEN
    RAISE EXCEPTION 'Guest portal public store is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT tenant."id", store."id"
  INTO STRICT target_tenant_id, target_store_id
  FROM public."Tenant" AS tenant
  INNER JOIN public."Store" AS store
    ON store."tenantId" = tenant."id"
  WHERE tenant."slug" = target_tenant_slug
    AND (
      store."id" = target_store_locator
      OR store."publicSlug" = target_store_locator
    );

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    target_tenant_id,
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    '',
    TRUE
  );

  SELECT * INTO scope_row
  FROM public.guest_portal_store_admit_current190_v1(
    target_tenant_id,
    target_store_id,
    'READ',
    server_now
  );

  RETURN QUERY SELECT
    target_tenant_id,
    target_store_id,
    scope_row."executionRevision"::INTEGER,
    scope_row."entitlementProfileRevision"::INTEGER;
END;
$function$;

CREATE FUNCTION public.guest_portal_session_issue_current190_v1(
  proposed_session_id TEXT,
  target_tenant_id TEXT,
  target_store_id TEXT,
  target_profile_id TEXT,
  target_guest_id TEXT,
  target_jti_digest TEXT,
  target_binding_digest TEXT,
  ttl_seconds INTEGER
)
RETURNS TABLE (
  "sessionId" TEXT,
  "tokenVersion" INTEGER,
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "executionRevision" INTEGER,
  "entitlementProfileRevision" INTEGER,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  scope_row RECORD;
  session_row public."GuestPortalSessionV1"%ROWTYPE;
  inserted_count INTEGER;
BEGIN
  PERFORM public.guest_portal_session_binding_validate_current190_v1(
    proposed_session_id, 1, target_jti_digest, target_binding_digest
  );

  IF ttl_seconds IS NULL
     OR ttl_seconds < 60 OR ttl_seconds > 3600 THEN
    RAISE EXCEPTION 'Invalid guest portal session issue input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    COALESCE(target_tenant_id, ''),
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    '',
    TRUE
  );

  SELECT * INTO scope_row
  FROM public.guest_portal_identity_admit_current190_v1(
    target_tenant_id,
    target_store_id,
    target_profile_id,
    target_guest_id,
    'READ',
    server_now
  );

  server_now := pg_catalog.clock_timestamp();

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer',
    'issue',
    TRUE
  );

  INSERT INTO public."GuestPortalSessionV1" (
    "id", "tenantId", "storeId", "profileId", "guestId",
    "tokenVersion", "jtiDigest", "phoneBindingDigest", "bindingDigest",
    "status", "issuedAt", "expiresAt", "createdAt", "updatedAt"
  ) VALUES (
    proposed_session_id, target_tenant_id, target_store_id, target_profile_id,
    target_guest_id, 1, target_jti_digest,
    scope_row."phoneBindingDigest"::TEXT,
    target_binding_digest, 'ACTIVE', server_now,
    server_now + pg_catalog.make_interval(secs => ttl_seconds),
    server_now, server_now
  )
  ON CONFLICT ("id") DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT * INTO session_row
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."id" = proposed_session_id
  FOR UPDATE;

  server_now := pg_catalog.clock_timestamp();

  IF NOT FOUND
     OR session_row."tenantId" <> target_tenant_id
     OR session_row."storeId" <> target_store_id
     OR session_row."profileId" <> target_profile_id
     OR session_row."guestId" IS DISTINCT FROM target_guest_id
     OR session_row."tokenVersion" <> 1
     OR session_row."jtiDigest" <> target_jti_digest
     OR session_row."phoneBindingDigest" <>
        scope_row."phoneBindingDigest"::TEXT
     OR session_row."bindingDigest" <> target_binding_digest
     OR session_row."status" <> 'ACTIVE'
     OR session_row."expiresAt" <= server_now THEN
    RAISE EXCEPTION 'Guest portal session issue replay mismatch'
      USING ERRCODE = '23505';
  END IF;

  IF inserted_count = 1 THEN
    INSERT INTO public."GuestPortalSessionAuditV1" (
      "id", "tenantId", "sessionId", "eventType", "tokenVersion",
      "storeId", "profileId", "guestId", "bindingDigest", "requestDigest",
      "relatedSessionId", "eventAt", "transactionId", "createdAt"
    ) VALUES (
      proposed_session_id || ':ISSUED', target_tenant_id,
      proposed_session_id, 'ISSUED', 1, target_store_id, target_profile_id,
      target_guest_id, target_binding_digest, NULL, NULL, server_now,
      pg_catalog.txid_current()::TEXT, server_now
    );
  END IF;

  RETURN QUERY SELECT
    session_row."id",
    session_row."tokenVersion",
    session_row."issuedAt",
    session_row."expiresAt",
    scope_row."executionRevision"::INTEGER,
    scope_row."entitlementProfileRevision"::INTEGER,
    inserted_count = 0;
END;
$function$;

CREATE FUNCTION public.guest_portal_session_assert_current190_v1(
  target_session_id TEXT,
  expected_token_version INTEGER,
  expected_tenant_id TEXT,
  expected_store_id TEXT,
  expected_profile_id TEXT,
  expected_guest_id TEXT,
  expected_jti_digest TEXT,
  expected_binding_digest TEXT,
  requested_action TEXT
)
RETURNS TABLE (
  "sessionId" TEXT,
  "tenantId" TEXT,
  "storeId" TEXT,
  "profileId" TEXT,
  "guestId" TEXT,
  "tokenVersion" INTEGER,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "executionRevision" INTEGER,
  "entitlementProfileRevision" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  scope_row RECORD;
  session_row public."GuestPortalSessionV1"%ROWTYPE;
BEGIN
  PERFORM public.guest_portal_session_binding_validate_current190_v1(
    target_session_id,
    expected_token_version,
    expected_jti_digest,
    expected_binding_digest
  );

  IF requested_action IS NULL
     OR requested_action NOT IN ('READ', 'WRITE') THEN
    RAISE EXCEPTION 'Guest portal session action is not admitted'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    COALESCE(expected_tenant_id, ''),
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    '',
    TRUE
  );

  SELECT * INTO scope_row
  FROM public.guest_portal_identity_admit_current190_v1(
    expected_tenant_id,
    expected_store_id,
    expected_profile_id,
    expected_guest_id,
    requested_action,
    server_now
  );

  SELECT * INTO session_row
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."id" = target_session_id
  FOR SHARE;

  server_now := pg_catalog.clock_timestamp();

  IF NOT FOUND
     OR session_row."status" <> 'ACTIVE'
     OR session_row."expiresAt" <= server_now
     OR session_row."tokenVersion" <> expected_token_version
     OR session_row."tenantId" <> expected_tenant_id
     OR session_row."storeId" <> expected_store_id
     OR session_row."profileId" <> expected_profile_id
     OR session_row."guestId" IS DISTINCT FROM expected_guest_id
     OR session_row."jtiDigest" <> expected_jti_digest
     OR session_row."bindingDigest" <> expected_binding_digest THEN
    RAISE EXCEPTION 'Guest portal session binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF session_row."phoneBindingDigest" <>
     scope_row."phoneBindingDigest"::TEXT THEN
    RAISE EXCEPTION 'Guest portal live phone binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT
    session_row."id",
    session_row."tenantId",
    session_row."storeId",
    session_row."profileId",
    session_row."guestId",
    session_row."tokenVersion",
    session_row."expiresAt",
    scope_row."executionRevision"::INTEGER,
    scope_row."entitlementProfileRevision"::INTEGER;
END;
$function$;

CREATE FUNCTION public.guest_portal_session_rotate_current190_v1(
  source_session_id TEXT,
  source_token_version INTEGER,
  source_tenant_id TEXT,
  source_store_id TEXT,
  source_profile_id TEXT,
  source_guest_id TEXT,
  source_jti_digest TEXT,
  source_binding_digest TEXT,
  rotation_request_digest TEXT,
  proposed_session_id TEXT,
  target_tenant_id TEXT,
  target_store_id TEXT,
  target_profile_id TEXT,
  target_guest_id TEXT,
  target_jti_digest TEXT,
  target_binding_digest TEXT,
  ttl_seconds INTEGER
)
RETURNS TABLE (
  "sessionId" TEXT,
  "tokenVersion" INTEGER,
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiresAt" TIMESTAMP(3) WITH TIME ZONE,
  "executionRevision" INTEGER,
  "entitlementProfileRevision" INTEGER,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  source_row public."GuestPortalSessionV1"%ROWTYPE;
  target_row public."GuestPortalSessionV1"%ROWTYPE;
  source_scope RECORD;
  target_scope RECORD;
  next_version INTEGER;
BEGIN
  PERFORM public.guest_portal_session_binding_validate_current190_v1(
    source_session_id,
    source_token_version,
    source_jti_digest,
    source_binding_digest
  );

  IF proposed_session_id = source_session_id
     OR rotation_request_digest IS NULL
     OR rotation_request_digest !~ '^[a-f0-9]{64}$'
     OR ttl_seconds IS NULL
     OR ttl_seconds < 60 OR ttl_seconds > 3600
     OR source_token_version >= 2147483647 THEN
    RAISE EXCEPTION 'Invalid guest portal session rotation input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.guest_portal_session_binding_validate_current190_v1(
    proposed_session_id,
    source_token_version + 1,
    target_jti_digest,
    target_binding_digest
  );

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    COALESCE(source_tenant_id, ''),
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    COALESCE(target_tenant_id, ''),
    TRUE
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      LEAST(source_tenant_id, target_tenant_id),
      190
    )
  );
  IF source_tenant_id <> target_tenant_id THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        GREATEST(source_tenant_id, target_tenant_id),
        190
      )
    );
  END IF;

  SELECT * INTO source_scope
  FROM public.guest_portal_identity_admit_current190_v1(
    source_tenant_id, source_store_id, source_profile_id, source_guest_id,
    'WRITE', server_now
  );

  SELECT * INTO target_scope
  FROM public.guest_portal_identity_admit_current190_v1(
    target_tenant_id, target_store_id, target_profile_id, target_guest_id,
    'WRITE', server_now
  );

  SELECT * INTO source_row
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."id" = source_session_id
  FOR UPDATE;

  server_now := pg_catalog.clock_timestamp();

  IF NOT FOUND
     OR source_row."tokenVersion" <> source_token_version
     OR source_row."tenantId" <> source_tenant_id
     OR source_row."storeId" <> source_store_id
     OR source_row."profileId" <> source_profile_id
     OR source_row."guestId" IS DISTINCT FROM source_guest_id
     OR source_row."jtiDigest" <> source_jti_digest
     OR source_row."bindingDigest" <> source_binding_digest THEN
    RAISE EXCEPTION 'Guest portal source session binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF source_row."phoneBindingDigest" <>
     source_scope."phoneBindingDigest"::TEXT THEN
    RAISE EXCEPTION 'Guest portal source live phone binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF source_scope."phoneBindingDigest"::TEXT <>
     target_scope."phoneBindingDigest"::TEXT THEN
    RAISE EXCEPTION
      'Guest portal rotation identity continuity is not admitted'
      USING ERRCODE = '42501';
  END IF;

  next_version := source_token_version + 1;

  IF source_row."status" = 'ROTATED' THEN
    SELECT * INTO target_row
    FROM public."GuestPortalSessionV1" AS session
    WHERE session."id" = proposed_session_id;

    IF source_row."rotatedToSessionId" <> proposed_session_id
       OR source_row."rotationRequestDigest" <> rotation_request_digest
       OR NOT FOUND
       OR target_row."parentSessionId" <> source_session_id
       OR target_row."parentRotationRequestDigest" <>
          rotation_request_digest
       OR target_row."tokenVersion" <> next_version
       OR target_row."tenantId" <> target_tenant_id
       OR target_row."storeId" <> target_store_id
       OR target_row."profileId" <> target_profile_id
       OR target_row."guestId" IS DISTINCT FROM target_guest_id
       OR target_row."jtiDigest" <> target_jti_digest
       OR target_row."bindingDigest" <> target_binding_digest
       OR target_row."status" <> 'ACTIVE'
       OR target_row."expiresAt" <= server_now THEN
      RAISE EXCEPTION 'Guest portal rotation replay mismatch'
        USING ERRCODE = '23505';
    END IF;

    IF target_row."phoneBindingDigest" <>
       target_scope."phoneBindingDigest"::TEXT THEN
      RAISE EXCEPTION 'Guest portal target live phone binding is not admitted'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT
      target_row."id", target_row."tokenVersion", target_row."issuedAt",
      target_row."expiresAt", target_scope."executionRevision"::INTEGER,
      target_scope."entitlementProfileRevision"::INTEGER, TRUE;
    RETURN;
  END IF;

  IF source_row."status" <> 'ACTIVE'
     OR source_row."expiresAt" <= server_now THEN
    RAISE EXCEPTION 'Guest portal source session is inactive'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer',
    'rotate',
    TRUE
  );

  INSERT INTO public."GuestPortalSessionV1" (
    "id", "tenantId", "storeId", "profileId", "guestId",
    "tokenVersion", "jtiDigest", "phoneBindingDigest", "bindingDigest",
    "status", "issuedAt", "expiresAt", "parentSessionId",
    "parentRotationRequestDigest", "createdAt", "updatedAt"
  ) VALUES (
    proposed_session_id, target_tenant_id, target_store_id, target_profile_id,
    target_guest_id, next_version, target_jti_digest,
    target_scope."phoneBindingDigest"::TEXT,
    target_binding_digest, 'ACTIVE', server_now,
    server_now + pg_catalog.make_interval(secs => ttl_seconds),
    source_session_id, rotation_request_digest, server_now, server_now
  );

  UPDATE public."GuestPortalSessionV1"
  SET
    "status" = 'ROTATED',
    "rotatedToSessionId" = proposed_session_id,
    "rotationRequestDigest" = rotation_request_digest,
    "rotatedAt" = server_now,
    "updatedAt" = server_now
  WHERE "id" = source_session_id;

  INSERT INTO public."GuestPortalSessionAuditV1" (
    "id", "tenantId", "sessionId", "eventType", "tokenVersion",
    "storeId", "profileId", "guestId", "bindingDigest", "requestDigest",
    "relatedSessionId", "eventAt", "transactionId", "createdAt"
  ) VALUES
  (
    source_session_id || ':ROTATED', source_tenant_id, source_session_id,
    'ROTATED', source_token_version, source_store_id, source_profile_id,
    source_guest_id, source_binding_digest, rotation_request_digest,
    proposed_session_id, server_now, pg_catalog.txid_current()::TEXT,
    server_now
  ),
  (
    proposed_session_id || ':ISSUED', target_tenant_id, proposed_session_id,
    'ISSUED', next_version, target_store_id, target_profile_id,
    target_guest_id, target_binding_digest, rotation_request_digest,
    source_session_id, server_now, pg_catalog.txid_current()::TEXT,
    server_now
  );

  SELECT * INTO target_row
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."id" = proposed_session_id;

  RETURN QUERY SELECT
    target_row."id", target_row."tokenVersion", target_row."issuedAt",
    target_row."expiresAt", target_scope."executionRevision"::INTEGER,
    target_scope."entitlementProfileRevision"::INTEGER, FALSE;
END;
$function$;

CREATE FUNCTION public.guest_portal_session_revoke_current190_v1(
  target_session_id TEXT,
  expected_token_version INTEGER,
  expected_tenant_id TEXT,
  expected_store_id TEXT,
  expected_profile_id TEXT,
  expected_guest_id TEXT,
  expected_jti_digest TEXT,
  expected_binding_digest TEXT,
  revocation_request_digest TEXT
)
RETURNS TABLE (
  "sessionId" TEXT,
  "status" TEXT,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  server_now TIMESTAMP(3) WITH TIME ZONE := pg_catalog.clock_timestamp();
  session_row public."GuestPortalSessionV1"%ROWTYPE;
BEGIN
  PERFORM public.guest_portal_session_binding_validate_current190_v1(
    target_session_id,
    expected_token_version,
    expected_jti_digest,
    expected_binding_digest
  );

  IF revocation_request_digest IS NULL
     OR revocation_request_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid guest portal revocation input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    COALESCE(expected_tenant_id, ''),
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    '',
    TRUE
  );

  PERFORM public.guest_portal_identity_lock_current190_v1(
    expected_tenant_id,
    expected_store_id,
    expected_profile_id,
    expected_guest_id
  );

  SELECT * INTO session_row
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."id" = target_session_id
  FOR UPDATE;

  server_now := pg_catalog.clock_timestamp();

  IF NOT FOUND
     OR session_row."tokenVersion" <> expected_token_version
     OR session_row."tenantId" <> expected_tenant_id
     OR session_row."storeId" <> expected_store_id
     OR session_row."profileId" <> expected_profile_id
     OR session_row."guestId" IS DISTINCT FROM expected_guest_id
     OR session_row."jtiDigest" <> expected_jti_digest
     OR session_row."bindingDigest" <> expected_binding_digest THEN
    RAISE EXCEPTION 'Guest portal revocation binding is not admitted'
      USING ERRCODE = '42501';
  END IF;

  IF session_row."status" = 'REVOKED' THEN
    IF session_row."revocationRequestDigest" <> revocation_request_digest THEN
      RAISE EXCEPTION 'Guest portal revocation replay mismatch'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      session_row."id", session_row."status"::TEXT,
      session_row."revokedAt", TRUE;
    RETURN;
  END IF;

  IF session_row."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Guest portal session cannot be revoked from this state'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer',
    'revoke',
    TRUE
  );

  UPDATE public."GuestPortalSessionV1"
  SET
    "status" = 'REVOKED',
    "revocationRequestDigest" = revocation_request_digest,
    "revokedAt" = server_now,
    "updatedAt" = server_now
  WHERE "id" = target_session_id
  RETURNING * INTO session_row;

  INSERT INTO public."GuestPortalSessionAuditV1" (
    "id", "tenantId", "sessionId", "eventType", "tokenVersion",
    "storeId", "profileId", "guestId", "bindingDigest", "requestDigest",
    "relatedSessionId", "eventAt", "transactionId", "createdAt"
  ) VALUES (
    target_session_id || ':REVOKED', expected_tenant_id, target_session_id,
    'REVOKED', expected_token_version, expected_store_id,
    expected_profile_id, expected_guest_id, expected_binding_digest,
    revocation_request_digest, NULL, server_now,
    pg_catalog.txid_current()::TEXT, server_now
  );

  RETURN QUERY SELECT
    session_row."id", session_row."status"::TEXT,
    session_row."revokedAt", FALSE;
END;
$function$;

CREATE FUNCTION public.guest_portal_sessions_revoke_tenant_current190_v1(
  target_tenant_id TEXT,
  fence_request_digest TEXT,
  batch_request_digest TEXT,
  proposed_batch_id TEXT,
  batch_limit INTEGER
)
RETURNS TABLE (
  "batchId" TEXT,
  "fenceVersion" INTEGER,
  "batchSequence" INTEGER,
  "fenceStatus" TEXT,
  "revokedCount" INTEGER,
  "remainingActiveCount" BIGINT,
  "totalRevokedCount" BIGINT,
  "batchCompletedAt" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  fence_row public."GuestPortalTenantSessionFenceV1"%ROWTYPE;
  receipt_row public."GuestPortalTenantSessionRevokeBatchV1"%ROWTYPE;
  selected_session_ids TEXT[] := ARRAY[]::TEXT[];
  revoked_count INTEGER := 0;
  audit_count INTEGER := 0;
  remaining_active_count BIGINT := 0;
  next_batch_sequence INTEGER;
  next_fence_status TEXT;
  next_total_revoked_count BIGINT;
  fence_started_at TIMESTAMP(3) WITH TIME ZONE;
  terminal_now TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF target_tenant_id IS NULL OR pg_catalog.length(target_tenant_id) < 1
     OR fence_request_digest IS NULL
     OR fence_request_digest !~ '^[a-f0-9]{64}$'
     OR batch_request_digest IS NULL
     OR batch_request_digest !~ '^[a-f0-9]{64}$'
     OR proposed_batch_id IS NULL
     OR proposed_batch_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR batch_limit IS NULL
     OR batch_limit < 1 OR batch_limit > 500 THEN
    RAISE EXCEPTION 'Invalid guest portal tenant revoke-all input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_tenant_id',
    target_tenant_id,
    TRUE
  );
  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_peer_tenant_id',
    '',
    TRUE
  );

  -- All session RPCs take Tenant FOR SHARE first. Tenant FOR UPDATE therefore
  -- waits for already-admitted issue/rotate/revoke work, then prevents any new
  -- admission until the persistent fence is visible at commit.
  PERFORM tenant."id"
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = target_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest portal tenant revoke-all scope is not admitted'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.set_config(
    'leetplus.guest_portal_session_current190_writer',
    'revoke_all',
    TRUE
  );

  fence_started_at := pg_catalog.clock_timestamp();
  INSERT INTO public."GuestPortalTenantSessionFenceV1" (
    "tenantId", "fenceVersion", "requestDigest", "status", "batchCount",
    "totalRevokedCount", "startedAt", "completedAt", "updatedAt"
  ) VALUES (
    target_tenant_id, 1, fence_request_digest, 'DRAINING', 0, 0,
    fence_started_at, NULL, fence_started_at
  )
  ON CONFLICT ("tenantId") DO NOTHING;

  SELECT * INTO fence_row
  FROM public."GuestPortalTenantSessionFenceV1" AS fence
  WHERE fence."tenantId" = target_tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR fence_row."fenceVersion" <> 1
     OR fence_row."requestDigest" <> fence_request_digest THEN
    RAISE EXCEPTION 'Guest portal tenant revoke-all fence request mismatch'
      USING ERRCODE = '23505';
  END IF;

  SELECT * INTO receipt_row
  FROM public."GuestPortalTenantSessionRevokeBatchV1" AS receipt
  WHERE receipt."tenantId" = target_tenant_id
    AND receipt."batchRequestDigest" = batch_request_digest
  FOR UPDATE;

  IF FOUND THEN
    IF receipt_row."fenceVersion" <> fence_row."fenceVersion"
       OR receipt_row."fenceRequestDigest" <> fence_request_digest
       OR receipt_row."batchLimit" <> batch_limit THEN
      RAISE EXCEPTION 'Guest portal tenant revoke-all replay mismatch'
        USING ERRCODE = '23505';
    END IF;

    RETURN QUERY SELECT
      receipt_row."id",
      receipt_row."fenceVersion",
      receipt_row."batchSequence",
      receipt_row."fenceStatus"::TEXT,
      receipt_row."revokedCount",
      receipt_row."remainingActiveCount",
      receipt_row."totalRevokedCount",
      receipt_row."completedAt",
      TRUE;
    RETURN;
  END IF;

  IF fence_row."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'Guest portal tenant revoke-all fence is already closed'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(locked_session."id" ORDER BY locked_session."id"),
    ARRAY[]::TEXT[]
  )
  INTO selected_session_ids
  FROM (
    SELECT session."id"
    FROM public."GuestPortalSessionV1" AS session
    WHERE session."tenantId" = target_tenant_id
      AND session."status" = 'ACTIVE'
    ORDER BY session."id"
    LIMIT batch_limit
    FOR UPDATE
  ) AS locked_session;

  -- Refresh terminal time only after every selected session row lock has been
  -- acquired. Any wait is therefore reflected in session, audit and receipt.
  terminal_now := pg_catalog.clock_timestamp();

  WITH updated_session AS (
    UPDATE public."GuestPortalSessionV1" AS session
    SET
      "status" = 'REVOKED',
      "revocationRequestDigest" = batch_request_digest,
      "revokedAt" = terminal_now,
      "updatedAt" = terminal_now
    WHERE session."tenantId" = target_tenant_id
      AND session."id" = ANY(selected_session_ids)
      AND session."status" = 'ACTIVE'
    RETURNING
      session."id",
      session."tenantId",
      session."tokenVersion",
      session."storeId",
      session."profileId",
      session."guestId",
      session."bindingDigest"
  ), inserted_audit AS (
    INSERT INTO public."GuestPortalSessionAuditV1" (
      "id", "tenantId", "sessionId", "eventType", "tokenVersion",
      "storeId", "profileId", "guestId", "bindingDigest", "requestDigest",
      "relatedSessionId", "eventAt", "transactionId", "createdAt"
    )
    SELECT
      updated_session."id" || ':REVOKED',
      updated_session."tenantId",
      updated_session."id",
      'REVOKED',
      updated_session."tokenVersion",
      updated_session."storeId",
      updated_session."profileId",
      updated_session."guestId",
      updated_session."bindingDigest",
      batch_request_digest,
      NULL,
      terminal_now,
      pg_catalog.txid_current()::TEXT,
      terminal_now
    FROM updated_session
    RETURNING "sessionId"
  )
  SELECT
    (SELECT pg_catalog.count(*)::INTEGER FROM updated_session),
    (SELECT pg_catalog.count(*)::INTEGER FROM inserted_audit)
  INTO revoked_count, audit_count;

  IF revoked_count <> audit_count
     OR revoked_count > batch_limit THEN
    RAISE EXCEPTION 'Guest portal tenant revoke-all audit is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::BIGINT
  INTO remaining_active_count
  FROM public."GuestPortalSessionV1" AS session
  WHERE session."tenantId" = target_tenant_id
    AND session."status" = 'ACTIVE';

  next_batch_sequence := fence_row."batchCount" + 1;
  next_total_revoked_count :=
    fence_row."totalRevokedCount" + revoked_count;
  next_fence_status := CASE
    WHEN remaining_active_count = 0 THEN 'CLOSED'
    ELSE 'DRAINING'
  END;

  UPDATE public."GuestPortalTenantSessionFenceV1"
  SET
    "status" = next_fence_status,
    "batchCount" = next_batch_sequence,
    "totalRevokedCount" = next_total_revoked_count,
    "completedAt" = CASE
      WHEN fence_row."status" = 'CLOSED' THEN fence_row."completedAt"
      WHEN next_fence_status = 'CLOSED' THEN terminal_now
      ELSE NULL
    END,
    "updatedAt" = terminal_now
  WHERE "tenantId" = target_tenant_id
  RETURNING * INTO fence_row;

  INSERT INTO public."GuestPortalTenantSessionRevokeBatchV1" (
    "id", "tenantId", "fenceVersion", "fenceRequestDigest",
    "batchRequestDigest", "batchSequence", "batchLimit", "revokedCount",
    "remainingActiveCount", "totalRevokedCount", "fenceStatus",
    "completedAt", "createdAt"
  ) VALUES (
    proposed_batch_id,
    target_tenant_id,
    fence_row."fenceVersion",
    fence_request_digest,
    batch_request_digest,
    next_batch_sequence,
    batch_limit,
    revoked_count,
    remaining_active_count,
    next_total_revoked_count,
    next_fence_status,
    terminal_now,
    terminal_now
  )
  RETURNING * INTO receipt_row;

  RETURN QUERY SELECT
    receipt_row."id",
    receipt_row."fenceVersion",
    receipt_row."batchSequence",
    receipt_row."fenceStatus"::TEXT,
    receipt_row."revokedCount",
    receipt_row."remainingActiveCount",
    receipt_row."totalRevokedCount",
    receipt_row."completedAt",
    FALSE;
END;
$function$;

CREATE FUNCTION public.guest_portal_media_assert_current190_v1(
  target_session_id TEXT,
  expected_token_version INTEGER,
  expected_tenant_id TEXT,
  expected_store_id TEXT,
  expected_profile_id TEXT,
  expected_guest_id TEXT,
  expected_jti_digest TEXT,
  expected_binding_digest TEXT,
  target_media_asset_id TEXT
)
RETURNS TABLE (
  "assetId" TEXT,
  "tenantId" TEXT,
  "contentType" TEXT,
  "byteSize" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM public.guest_portal_session_binding_validate_current190_v1(
    target_session_id,
    expected_token_version,
    expected_jti_digest,
    expected_binding_digest
  );

  IF target_media_asset_id IS NULL
     OR pg_catalog.length(target_media_asset_id) < 1 THEN
    RAISE EXCEPTION 'Invalid guest portal media input'
      USING ERRCODE = '22023';
  END IF;

  PERFORM *
  FROM public.guest_portal_session_assert_current190_v1(
    target_session_id, expected_token_version, expected_tenant_id,
    expected_store_id, expected_profile_id, expected_guest_id,
    expected_jti_digest, expected_binding_digest, 'READ'
  );

  RETURN QUERY
  SELECT asset."id", asset."tenantId", asset."contentType", asset."byteSize"
  FROM public."GuestGameMediaAsset" AS asset
  WHERE asset."id" = target_media_asset_id
    AND asset."tenantId" = expected_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest portal media asset is not admitted'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON TABLE public."GuestPortalSessionV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."GuestPortalSessionAuditV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."GuestPortalTenantSessionFenceV1" FROM PUBLIC;
REVOKE ALL ON TABLE
public."GuestPortalTenantSessionRevokeBatchV1" FROM PUBLIC;

REVOKE ALL ON FUNCTION
public.guest_portal_session_row_guard_current190_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_session_audit_guard_current190_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_tenant_session_fence_guard_current190_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_tenant_session_batch_guard_current190_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_session_binding_validate_current190_v1(
  TEXT, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_store_admit_current190_v1(
  TEXT, TEXT, TEXT, TIMESTAMP(3) WITH TIME ZONE
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_identity_admit_current190_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP(3) WITH TIME ZONE
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_identity_lock_current190_v1(
  TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_profile_phone_binding_current190_v1(
  TEXT, TEXT, TEXT, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_public_store_assert_current190_v1(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_session_issue_current190_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_session_assert_current190_v1(
  TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_session_rotate_current190_v1(
  TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_session_revoke_current190_v1(
  TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_sessions_revoke_tenant_current190_v1(
  TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.guest_portal_media_assert_current190_v1(
  TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

DO $postcondition$
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
         'GuestPortalSessionV1_tenant_id_key'
         AND constraint_entry.contype = 'u'::"char"
         AND constraint_entry.conrelid = pg_catalog.to_regclass(
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
               AND attribute.attname = 'id'
           )
         ]::SMALLINT[]
     )
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
     )
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS routine
       INNER JOIN pg_catalog.pg_namespace AS namespace
         ON namespace.oid = routine.pronamespace
       WHERE namespace.nspname = 'public'
         AND routine.proname LIKE 'guest_portal%current190%'
         AND routine.proname NOT LIKE '%_guard_%'
         AND (
           routine.prosecdef IS DISTINCT FROM TRUE
           OR routine.provolatile IS DISTINCT FROM 'v'::"char"
           OR routine.proleakproof IS DISTINCT FROM FALSE
           OR routine.proconfig IS DISTINCT FROM
             ARRAY['search_path=pg_catalog']::TEXT[]
         )
     ) THEN
    RAISE EXCEPTION
      'CURRENT190 guest portal session objects require owner-only sealed ACL'
      USING ERRCODE = '55000';
  END IF;
END;
$postcondition$;

COMMIT;

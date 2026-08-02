-- Staff attachment ACL, EXPAND phase.
--
-- Existing and N-1-created blobs are deliberately UNRESOLVED. The strict
-- reader must never infer access from tenantId, uploader, URL, or a NULL store.
-- Parent discovery/backfill runs separately after this schema is deployed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 110000 THEN
    RAISE EXCEPTION
      'Staff attachment ACL expand requires PostgreSQL 11 or newer'
      USING ERRCODE = '0A000';
  END IF;
END
$$;

LOCK TABLE "StaffAttachment" IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE "StaffAttachmentState" AS ENUM (
  'PENDING',
  'BOUND',
  'UNRESOLVED',
  'QUARANTINED'
);

CREATE TYPE "StaffAttachmentBindingState" AS ENUM (
  'BOUND',
  'UNRESOLVED',
  'QUARANTINED'
);

CREATE TYPE "StaffAttachmentResourceKind" AS ENUM (
  'CHAT_MESSAGE',
  'STAFF_TASK',
  'CHECKLIST_RUN',
  'KNOWLEDGE_ARTICLE',
  'SHIFT_REGULATION',
  'TRAINING_COURSE',
  'ONBOARDING_PLAN'
);

CREATE TYPE "StaffAttachmentBindingSource" AS ENUM (
  'NATIVE',
  'CHAT_RELATION_BACKFILL',
  'LEGACY_REFERENCE_BACKFILL',
  'MANUAL_RECONCILIATION'
);

-- Constant defaults are metadata-only on supported PostgreSQL versions. They
-- make old application instances fail closed after the strict reader rollout:
-- N-1 uploads become UNRESOLVED rather than owner- or tenant-readable PENDING.
ALTER TABLE "StaffAttachment"
ADD COLUMN "state" "StaffAttachmentState"
  NOT NULL DEFAULT 'UNRESOLVED',
ADD COLUMN "pendingExpiresAt" TIMESTAMP(3),
ADD COLUMN "stateReasonCode" TEXT
  DEFAULT 'LEGACY_UNCLASSIFIED',
ADD COLUMN "stateChangedAt" TIMESTAMP(3)
  NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "StaffAttachment"
ADD CONSTRAINT "StaffAttachment_state_shape_check"
CHECK (
  (
    "state" = 'PENDING'
    AND "uploadedByUserId" IS NOT NULL
    AND "pendingExpiresAt" IS NOT NULL
    AND "pendingExpiresAt" > "createdAt"
    AND "stateReasonCode" IS NULL
  )
  OR (
    "state" = 'BOUND'
    AND "pendingExpiresAt" IS NULL
    AND "stateReasonCode" IS NULL
  )
  OR (
    "state" IN ('UNRESOLVED', 'QUARANTINED')
    AND "pendingExpiresAt" IS NULL
    AND NULLIF(BTRIM("stateReasonCode"), '') IS NOT NULL
  )
) NOT VALID;

CREATE TABLE "StaffAttachmentBinding" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "attachmentId" TEXT,
  "candidateAttachmentId" TEXT NOT NULL,
  "resourceKind" "StaffAttachmentResourceKind" NOT NULL,
  "resourceId" TEXT NOT NULL,
  "resourceStoreId" TEXT,
  "state" "StaffAttachmentBindingState"
    NOT NULL DEFAULT 'UNRESOLVED',
  "source" "StaffAttachmentBindingSource" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "reasonCode" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StaffAttachmentBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffAttachmentBinding_state_shape_check" CHECK (
    (
      "state" = 'BOUND'
      AND "attachmentId" IS NOT NULL
      AND "attachmentId" = "candidateAttachmentId"
      AND "resolvedAt" IS NOT NULL
      AND "reasonCode" IS NULL
    )
    OR (
      "state" IN ('UNRESOLVED', 'QUARANTINED')
      AND "attachmentId" IS NULL
      AND "resolvedAt" IS NULL
      AND NULLIF(BTRIM("reasonCode"), '') IS NOT NULL
    )
  ),
  CONSTRAINT "StaffAttachmentBinding_source_key_check" CHECK (
    "sourceKey" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "StaffAttachmentBinding_candidate_id_check" CHECK (
    CHAR_LENGTH("candidateAttachmentId") BETWEEN 1 AND 128
  ),
  CONSTRAINT "StaffAttachmentBinding_resource_id_check" CHECK (
    CHAR_LENGTH(BTRIM("resourceId")) BETWEEN 1 AND 128
  )
);

ALTER TABLE "StaffAttachmentBinding"
ADD CONSTRAINT "StaffAttachmentBinding_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAttachmentBinding"
ADD CONSTRAINT "StaffAttachmentBinding_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "StaffAttachment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffAttachmentBinding"
ADD CONSTRAINT "StaffAttachmentBinding_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "staff_attachment_binding_source_unique"
ON "StaffAttachmentBinding"(
  "tenantId",
  "resourceKind",
  "resourceId",
  "sourceKey"
);

CREATE INDEX "staff_attachment_binding_attachment_state_idx"
ON "StaffAttachmentBinding"("tenantId", "attachmentId", "state");

CREATE INDEX "staff_attachment_binding_resource_state_idx"
ON "StaffAttachmentBinding"(
  "tenantId",
  "resourceKind",
  "resourceId",
  "state"
);

CREATE INDEX "staff_attachment_binding_candidate_state_idx"
ON "StaffAttachmentBinding"(
  "tenantId",
  "candidateAttachmentId",
  "state"
);

CREATE INDEX "staff_attachment_binding_tenant_state_created_idx"
ON "StaffAttachmentBinding"("tenantId", "state", "createdAt");

CREATE INDEX "staff_attachment_binding_attachment_fk_idx"
ON "StaffAttachmentBinding"("attachmentId");

CREATE INDEX "staff_attachment_binding_created_by_idx"
ON "StaffAttachmentBinding"("createdByUserId");

-- This resolver returns the top-level ACL parent. It deliberately collapses
-- task comments to StaffTask and current/history JSON slots to the owning
-- article/regulation. Raw URLs and version rows never become authorization.
CREATE FUNCTION "resolve_staff_attachment_resource_scope"(
  resource_kind "StaffAttachmentResourceKind",
  resource_id TEXT
)
RETURNS TABLE (
  "tenantId" TEXT,
  "storeId" TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  CASE resource_kind
    WHEN 'CHAT_MESSAGE' THEN
      RETURN QUERY
      SELECT message."tenantId", message."storeId"
      FROM "StaffChatMessage" AS message
      JOIN "StaffChatChannel" AS channel
        ON channel."id" = message."channelId"
       AND channel."tenantId" = message."tenantId"
      WHERE message."id" = resource_id
        AND (
          channel."scope" <> 'STORE'
          OR (
            channel."storeId" IS NOT NULL
            AND message."storeId" IS NOT DISTINCT FROM channel."storeId"
          )
        )
      FOR KEY SHARE OF message, channel;

    WHEN 'STAFF_TASK' THEN
      RETURN QUERY
      SELECT task."tenantId", task."storeId"
      FROM "StaffTask" AS task
      WHERE task."id" = resource_id
      FOR KEY SHARE OF task;

    WHEN 'CHECKLIST_RUN' THEN
      RETURN QUERY
      SELECT run."tenantId", run."storeId"
      FROM "StaffChecklistRun" AS run
      WHERE run."id" = resource_id
      FOR KEY SHARE OF run;

    WHEN 'KNOWLEDGE_ARTICLE' THEN
      RETURN QUERY
      SELECT article."tenantId", article."storeId"
      FROM "StaffKnowledgeArticle" AS article
      WHERE article."id" = resource_id
      FOR KEY SHARE OF article;

    WHEN 'SHIFT_REGULATION' THEN
      RETURN QUERY
      SELECT regulation."tenantId", regulation."storeId"
      FROM "StaffShiftRegulation" AS regulation
      WHERE regulation."id" = resource_id
      FOR KEY SHARE OF regulation;

    WHEN 'TRAINING_COURSE' THEN
      RETURN QUERY
      SELECT course."tenantId", course."storeId"
      FROM "StaffTrainingCourse" AS course
      WHERE course."id" = resource_id
      FOR KEY SHARE OF course;

    WHEN 'ONBOARDING_PLAN' THEN
      RETURN QUERY
      SELECT plan."tenantId", plan."storeId"
      FROM "StaffOnboardingPlan" AS plan
      WHERE plan."id" = resource_id
      FOR KEY SHARE OF plan;

    ELSE
      RAISE EXCEPTION
        'Unsupported staff attachment resource kind: %',
        resource_kind
        USING ERRCODE = '23514',
              CONSTRAINT = 'StaffAttachmentBinding_resource_kind_check';
  END CASE;
END
$$;

CREATE FUNCTION "prepare_staff_attachment_binding"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant_id TEXT;
  parent_store_id TEXT;
  attachment_tenant_id TEXT;
  creator_tenant_id TEXT;
  store_tenant_id TEXT;
BEGIN
  -- A BOUND link serializes on its blob. This closes races between two bind
  -- attempts and between a bind and an attachment lifecycle transition.
  IF NEW."attachmentId" IS NOT NULL THEN
    SELECT attachment."tenantId"
    INTO attachment_tenant_id
    FROM "StaffAttachment" AS attachment
    WHERE attachment."id" = NEW."attachmentId"
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Staff attachment binding references a missing attachment'
        USING ERRCODE = '23503',
              CONSTRAINT = 'StaffAttachmentBinding_attachmentId_fkey';
    END IF;

    IF attachment_tenant_id <> NEW."tenantId" THEN
      RAISE EXCEPTION
        'Staff attachment binding and attachment must share a tenant'
        USING ERRCODE = '23514',
              CONSTRAINT = 'StaffAttachmentBinding_attachment_tenant_check';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."attachmentId" IS NOT NULL
     AND OLD."attachmentId" IS DISTINCT FROM NEW."attachmentId" THEN
    PERFORM 1
    FROM "StaffAttachment" AS attachment
    WHERE attachment."id" = OLD."attachmentId"
    FOR UPDATE;
  END IF;

  IF NEW."createdByUserId" IS NOT NULL THEN
    SELECT app_user."tenantId"
    INTO creator_tenant_id
    FROM "User" AS app_user
    WHERE app_user."id" = NEW."createdByUserId"
    FOR KEY SHARE;

    IF NOT FOUND OR creator_tenant_id <> NEW."tenantId" THEN
      RAISE EXCEPTION
        'Staff attachment binding creator must belong to the binding tenant'
        USING ERRCODE = '23514',
              CONSTRAINT = 'StaffAttachmentBinding_creator_tenant_check';
    END IF;
  END IF;

  SELECT scope."tenantId", scope."storeId"
  INTO parent_tenant_id, parent_store_id
  FROM "resolve_staff_attachment_resource_scope"(
    NEW."resourceKind",
    NEW."resourceId"
  ) AS scope;

  IF NOT FOUND THEN
    IF NEW."state" = 'BOUND' THEN
      RAISE EXCEPTION
        'Staff attachment binding references a missing or inconsistent parent'
        USING ERRCODE = '23503',
              CONSTRAINT = 'StaffAttachmentBinding_parent_check';
    END IF;

    NEW."resourceStoreId" := NULL;
    RETURN NEW;
  END IF;

  IF parent_tenant_id <> NEW."tenantId" THEN
    RAISE EXCEPTION
      'Staff attachment binding and parent must share a tenant'
      USING ERRCODE = '23514',
            CONSTRAINT = 'StaffAttachmentBinding_parent_tenant_check';
  END IF;

  IF parent_store_id IS NOT NULL THEN
    SELECT store."tenantId"
    INTO store_tenant_id
    FROM "Store" AS store
    WHERE store."id" = parent_store_id
    FOR KEY SHARE;

    IF NOT FOUND OR store_tenant_id <> parent_tenant_id THEN
      RAISE EXCEPTION
        'Staff attachment parent references a store from another tenant'
        USING ERRCODE = '23514',
              CONSTRAINT = 'StaffAttachmentBinding_parent_store_check';
    END IF;
  END IF;

  -- Snapshot only. Authorization always re-reads the current parent.
  NEW."resourceStoreId" := parent_store_id;

  RETURN NEW;
END
$$;

CREATE TRIGGER "StaffAttachmentBinding_prepare"
BEFORE INSERT OR UPDATE ON "StaffAttachmentBinding"
FOR EACH ROW
EXECUTE FUNCTION "prepare_staff_attachment_binding"();

CREATE FUNCTION "assert_staff_attachment_state"(
  attachment_id TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  attachment_state "StaffAttachmentState";
  has_bound_binding BOOLEAN;
BEGIN
  IF attachment_id IS NULL THEN
    RETURN;
  END IF;

  SELECT attachment."state"
  INTO attachment_state
  FROM "StaffAttachment" AS attachment
  WHERE attachment."id" = attachment_id;

  -- The attachment can disappear only after every RESTRICTed binding is gone.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "StaffAttachmentBinding" AS binding
    WHERE binding."attachmentId" = attachment_id
      AND binding."state" = 'BOUND'
  )
  INTO has_bound_binding;

  IF (attachment_state = 'BOUND') IS DISTINCT FROM has_bound_binding THEN
    RAISE EXCEPTION
      'Staff attachment BOUND state must match the existence of a BOUND binding'
      USING ERRCODE = '23514',
            CONSTRAINT = 'StaffAttachment_bound_binding_check';
  END IF;
END
$$;

CREATE FUNCTION "check_staff_attachment_row_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM "assert_staff_attachment_state"(NEW."id");
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "StaffAttachment_bound_binding_check"
AFTER INSERT OR UPDATE ON "StaffAttachment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_staff_attachment_row_state"();

CREATE FUNCTION "check_staff_attachment_binding_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM "assert_staff_attachment_state"(OLD."attachmentId");
  END IF;

  IF TG_OP <> 'DELETE'
     AND (
       TG_OP = 'INSERT'
       OR NEW."attachmentId" IS DISTINCT FROM OLD."attachmentId"
     ) THEN
    PERFORM "assert_staff_attachment_state"(NEW."attachmentId");
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "StaffAttachmentBinding_attachment_state_check"
AFTER INSERT OR UPDATE OR DELETE ON "StaffAttachmentBinding"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_staff_attachment_binding_state"();

COMMIT;

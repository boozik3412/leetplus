-- Staff attachment ACL invariant hardening.
--
-- Every relationship-changing write serializes on StaffAttachment. In
-- particular, two concurrent transactions may not each delete the last
-- different BOUND binding while observing the other transaction's row.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

CREATE OR REPLACE FUNCTION "assert_staff_attachment_state"(
  attachment_id TEXT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  attachment_state "StaffAttachmentState";
  attachment_tenant_id TEXT;
  has_bound_binding BOOLEAN;
  has_foreign_tenant_binding BOOLEAN;
BEGIN
  IF attachment_id IS NULL THEN
    RETURN;
  END IF;

  SELECT attachment."state", attachment."tenantId"
  INTO attachment_state, attachment_tenant_id
  FROM "StaffAttachment" AS attachment
  WHERE attachment."id" = attachment_id;

  -- The attachment can disappear only after every RESTRICTed binding is gone.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM "StaffAttachmentBinding" AS binding
      WHERE binding."attachmentId" = attachment_id
        AND binding."state" = 'BOUND'
        AND binding."tenantId" = attachment_tenant_id
    ),
    EXISTS (
      SELECT 1
      FROM "StaffAttachmentBinding" AS binding
      WHERE binding."attachmentId" = attachment_id
        AND binding."state" = 'BOUND'
        AND binding."tenantId" IS DISTINCT FROM attachment_tenant_id
    )
  INTO has_bound_binding, has_foreign_tenant_binding;

  IF has_foreign_tenant_binding THEN
    RAISE EXCEPTION
      'Staff attachment and all BOUND bindings must share a tenant'
      USING ERRCODE = '23514',
            CONSTRAINT = 'StaffAttachment_binding_tenant_check';
  END IF;

  IF (attachment_state = 'BOUND') IS DISTINCT FROM has_bound_binding THEN
    RAISE EXCEPTION
      'Staff attachment BOUND state must match the existence of a BOUND binding'
      USING ERRCODE = '23514',
            CONSTRAINT = 'StaffAttachment_bound_binding_check';
  END IF;
END
$$;

CREATE FUNCTION "lock_staff_attachment_binding_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."attachmentId" IS NOT NULL THEN
    PERFORM 1
    FROM "StaffAttachment" AS attachment
    WHERE attachment."id" = OLD."attachmentId"
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Staff attachment binding references a missing attachment'
        USING ERRCODE = '23503',
              CONSTRAINT = 'StaffAttachmentBinding_attachmentId_fkey';
    END IF;
  END IF;

  RETURN OLD;
END
$$;

CREATE TRIGGER "StaffAttachmentBinding_lock_delete"
BEFORE DELETE ON "StaffAttachmentBinding"
FOR EACH ROW
EXECUTE FUNCTION "lock_staff_attachment_binding_delete"();

COMMIT;

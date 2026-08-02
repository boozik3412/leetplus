-- AccessScope v1, EXPAND phase.
--
-- The mode is intentionally nullable during classification. NULL is never
-- equivalent to NETWORK; application readers must deny it by default.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Freeze every table participating in the classification invariant before
-- preflight. Reads remain available, while concurrent grants, invites and
-- tenant/scope changes wait or fail on lock_timeout.
LOCK TABLE "Store", "User", "UserInvite", "UserStoreAccess"
IN SHARE ROW EXCLUSIVE MODE;

CREATE TYPE "UserAccessScope" AS ENUM ('NETWORK', 'STORES');

ALTER TABLE "User"
ADD COLUMN "accessScope" "UserAccessScope";

ALTER TABLE "UserInvite"
ADD COLUMN "accessScope" "UserAccessScope";

-- Abort instead of preserving an already-invalid cross-tenant relation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "UserStoreAccess" AS access
    JOIN "User" AS app_user ON app_user."id" = access."userId"
    JOIN "Store" AS store ON store."id" = access."storeId"
    WHERE app_user."tenantId" <> store."tenantId"
  ) THEN
    RAISE EXCEPTION
      'AccessScope expand blocked: cross-tenant UserStoreAccess rows exist'
      USING ERRCODE = '23514',
            CONSTRAINT = 'UserStoreAccess_same_tenant_check';
  END IF;
END
$$;

-- A non-empty legacy allow-list can only narrow access, so it is safe to
-- classify as STORES. Empty legacy lists remain unresolved (NULL); they are
-- never promoted to NETWORK automatically.
UPDATE "User" AS app_user
SET "accessScope" = 'STORES'
WHERE EXISTS (
  SELECT 1
  FROM "UserStoreAccess" AS access
  WHERE access."userId" = app_user."id"
);

UPDATE "UserInvite"
SET "accessScope" = 'STORES'
WHERE COALESCE(cardinality("storeIds"), 0) > 0;

ALTER TABLE "UserInvite"
ADD CONSTRAINT "UserInvite_network_store_ids_check"
CHECK (
  "accessScope" IS NULL
  OR "accessScope" <> 'NETWORK'
  OR COALESCE(cardinality("storeIds"), 0) = 0
);

CREATE INDEX "User_tenantId_accessScope_idx"
ON "User"("tenantId", "accessScope");

CREATE INDEX "UserInvite_tenantId_accessScope_idx"
ON "UserInvite"("tenantId", "accessScope");

-- Access-scope changes and tenant moves are rare control-plane operations.
-- A short SHARE ROW EXCLUSIVE lock serializes them with UserStoreAccess DML,
-- closing races between a scope/tenant change and a concurrent access grant.
CREATE FUNCTION "serialize_user_access_scope_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."accessScope" IS DISTINCT FROM OLD."accessScope" THEN
    LOCK TABLE "UserStoreAccess" IN SHARE ROW EXCLUSIVE MODE;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "User_serialize_access_scope_change"
BEFORE UPDATE OF "tenantId", "accessScope" ON "User"
FOR EACH ROW
EXECUTE FUNCTION "serialize_user_access_scope_change"();

CREATE FUNCTION "serialize_store_tenant_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId" THEN
    LOCK TABLE "UserStoreAccess" IN SHARE ROW EXCLUSIVE MODE;
  END IF;

  RETURN NEW;
END
$$;

CREATE TRIGGER "Store_serialize_tenant_change"
BEFORE UPDATE OF "tenantId" ON "Store"
FOR EACH ROW
EXECUTE FUNCTION "serialize_store_tenant_change"();

-- Constraint triggers inspect the final row state at transaction commit.
-- This lets Prisma replace grants atomically in either statement order while
-- still rejecting an invalid final state.
CREATE FUNCTION "check_user_store_access_invariants"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  user_tenant_id text;
  user_access_scope "UserAccessScope";
  store_tenant_id text;
BEGIN
  SELECT
    app_user."tenantId",
    app_user."accessScope",
    store."tenantId"
  INTO
    user_tenant_id,
    user_access_scope,
    store_tenant_id
  FROM "UserStoreAccess" AS access
  JOIN "User" AS app_user ON app_user."id" = access."userId"
  JOIN "Store" AS store ON store."id" = access."storeId"
  WHERE access."id" = NEW."id";

  -- The row may have been deleted later in the same transaction.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF user_tenant_id <> store_tenant_id THEN
    RAISE EXCEPTION
      'UserStoreAccess must link a user and store from the same tenant'
      USING ERRCODE = '23514',
            CONSTRAINT = 'UserStoreAccess_same_tenant_check';
  END IF;

  IF user_access_scope = 'NETWORK' THEN
    RAISE EXCEPTION
      'NETWORK users must not have UserStoreAccess rows'
      USING ERRCODE = '23514',
            CONSTRAINT = 'UserStoreAccess_network_scope_check';
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "UserStoreAccess_access_scope_check"
AFTER INSERT OR UPDATE ON "UserStoreAccess"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_user_store_access_invariants"();

CREATE FUNCTION "check_user_access_scope_invariants"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_tenant_id text;
  current_access_scope "UserAccessScope";
BEGIN
  IF NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId"
     AND NEW."accessScope" IS NOT DISTINCT FROM OLD."accessScope" THEN
    RETURN NULL;
  END IF;

  SELECT app_user."tenantId", app_user."accessScope"
  INTO current_tenant_id, current_access_scope
  FROM "User" AS app_user
  WHERE app_user."id" = NEW."id";

  -- The user may have been deleted later in the same transaction.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_access_scope = 'NETWORK'
     AND EXISTS (
       SELECT 1
       FROM "UserStoreAccess" AS access
       WHERE access."userId" = NEW."id"
     ) THEN
    RAISE EXCEPTION
      'NETWORK users must not have UserStoreAccess rows'
      USING ERRCODE = '23514',
            CONSTRAINT = 'User_network_scope_check';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "UserStoreAccess" AS access
    JOIN "Store" AS store ON store."id" = access."storeId"
    WHERE access."userId" = NEW."id"
      AND store."tenantId" <> current_tenant_id
  ) THEN
    RAISE EXCEPTION
      'UserStoreAccess must link a user and store from the same tenant'
      USING ERRCODE = '23514',
            CONSTRAINT = 'User_same_tenant_access_check';
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "User_access_scope_check"
AFTER UPDATE ON "User"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_user_access_scope_invariants"();

CREATE FUNCTION "check_store_access_scope_invariants"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_tenant_id text;
BEGIN
  IF NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId" THEN
    RETURN NULL;
  END IF;

  SELECT store."tenantId"
  INTO current_tenant_id
  FROM "Store" AS store
  WHERE store."id" = NEW."id";

  -- The store may have been deleted later in the same transaction.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "UserStoreAccess" AS access
    JOIN "User" AS app_user ON app_user."id" = access."userId"
    WHERE access."storeId" = NEW."id"
      AND app_user."tenantId" <> current_tenant_id
  ) THEN
    RAISE EXCEPTION
      'UserStoreAccess must link a user and store from the same tenant'
      USING ERRCODE = '23514',
            CONSTRAINT = 'Store_same_tenant_access_check';
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER "Store_access_scope_check"
AFTER UPDATE ON "Store"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "check_store_access_scope_invariants"();

COMMIT;

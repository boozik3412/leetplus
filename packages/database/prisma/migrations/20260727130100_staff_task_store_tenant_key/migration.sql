-- Parent key for same-tenant staff task references.
-- Kept in its own migration because concurrent index builds cannot run inside
-- a transaction and must be repaired independently if PostgreSQL reports an
-- invalid index.
CREATE UNIQUE INDEX CONCURRENTLY "store_tenant_id_uidx"
  ON "Store"("tenantId", "id");

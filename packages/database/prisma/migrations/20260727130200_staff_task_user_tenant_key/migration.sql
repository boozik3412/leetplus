-- Parent key for same-tenant staff task references.
CREATE UNIQUE INDEX CONCURRENTLY "user_tenant_id_uidx"
  ON "User"("tenantId", "id");

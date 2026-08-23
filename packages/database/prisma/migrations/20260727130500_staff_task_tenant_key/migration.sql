-- Parent key for same-tenant staff task references.
CREATE UNIQUE INDEX CONCURRENTLY "staff_task_tenant_id_uidx"
  ON "StaffTask"("tenantId", "id");

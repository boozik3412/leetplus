-- Parent key for same-tenant staff task references.
CREATE UNIQUE INDEX CONCURRENTLY "staff_task_rule_tenant_id_uidx"
  ON "StaffTaskRecurringRule"("tenantId", "id");

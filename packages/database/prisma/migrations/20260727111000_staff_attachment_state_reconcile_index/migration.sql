-- Run outside a transaction so production reads/writes remain available.
CREATE INDEX CONCURRENTLY "staff_attachment_tenant_state_created_idx"
ON "StaffAttachment"("tenantId", "state", "createdAt", "id");

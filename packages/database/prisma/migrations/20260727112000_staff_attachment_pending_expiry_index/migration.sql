-- Run outside a transaction so production reads/writes remain available.
CREATE INDEX CONCURRENTLY "staff_attachment_pending_expiry_idx"
ON "StaffAttachment"("pendingExpiresAt", "id")
WHERE "state" = 'PENDING';

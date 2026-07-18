CREATE UNIQUE INDEX CONCURRENTLY "staff_chat_message_tenant_dedupe_unique"
  ON "StaffChatMessage"("tenantId", "dedupeKey");

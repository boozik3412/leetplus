CREATE TABLE "StaffChatMessageAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffChatMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_chat_message_attachment_unique"
  ON "StaffChatMessageAttachment"("messageId", "attachmentId");

CREATE INDEX "staff_chat_message_attachment_message_idx"
  ON "StaffChatMessageAttachment"("tenantId", "messageId");

CREATE INDEX "staff_chat_message_attachment_attachment_idx"
  ON "StaffChatMessageAttachment"("attachmentId");

ALTER TABLE "StaffChatMessageAttachment"
  ADD CONSTRAINT "StaffChatMessageAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffChatMessageAttachment"
  ADD CONSTRAINT "StaffChatMessageAttachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "StaffChatMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffChatMessageAttachment"
  ADD CONSTRAINT "StaffChatMessageAttachment_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "StaffAttachment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

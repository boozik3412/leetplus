CREATE TABLE "StaffChatMention" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "mentionedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffChatMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_chat_mention_message_user_unique"
  ON "StaffChatMention"("messageId", "mentionedUserId");

CREATE INDEX "staff_chat_mention_user_idx"
  ON "StaffChatMention"("tenantId", "mentionedUserId", "createdAt");

CREATE INDEX "staff_chat_mention_message_idx"
  ON "StaffChatMention"("tenantId", "messageId");

ALTER TABLE "StaffChatMention"
  ADD CONSTRAINT "StaffChatMention_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffChatMention"
  ADD CONSTRAINT "StaffChatMention_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "StaffChatMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffChatMention"
  ADD CONSTRAINT "StaffChatMention_mentionedUserId_fkey"
  FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

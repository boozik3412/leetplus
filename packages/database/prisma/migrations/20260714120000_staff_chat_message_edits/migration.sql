-- CreateTable
CREATE TABLE "StaffChatMessageEdit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "previousBody" TEXT NOT NULL,
    "nextBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffChatMessageEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_chat_message_edit_message_idx" ON "StaffChatMessageEdit"("tenantId", "messageId", "createdAt");

-- CreateIndex
CREATE INDEX "staff_chat_message_edit_actor_idx" ON "StaffChatMessageEdit"("actorUserId");

-- AddForeignKey
ALTER TABLE "StaffChatMessageEdit" ADD CONSTRAINT "StaffChatMessageEdit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatMessageEdit" ADD CONSTRAINT "StaffChatMessageEdit_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StaffChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatMessageEdit" ADD CONSTRAINT "StaffChatMessageEdit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

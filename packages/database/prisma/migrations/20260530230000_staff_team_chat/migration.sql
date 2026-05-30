-- CreateTable
CREATE TABLE "StaffChatChannel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'NETWORK',
    "roleScope" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "storeId" TEXT,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffChatReadReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffChatReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_chat_channel_tenant_name_unique" ON "StaffChatChannel"("tenantId", "name");

-- CreateIndex
CREATE INDEX "staff_chat_channel_scope_idx" ON "StaffChatChannel"("tenantId", "isArchived", "scope");

-- CreateIndex
CREATE INDEX "staff_chat_channel_store_idx" ON "StaffChatChannel"("storeId");

-- CreateIndex
CREATE INDEX "staff_chat_channel_created_by_idx" ON "StaffChatChannel"("createdByUserId");

-- CreateIndex
CREATE INDEX "staff_chat_message_tenant_created_idx" ON "StaffChatMessage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "staff_chat_message_pinned_idx" ON "StaffChatMessage"("tenantId", "isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "staff_chat_message_channel_created_idx" ON "StaffChatMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "staff_chat_message_author_idx" ON "StaffChatMessage"("authorUserId");

-- CreateIndex
CREATE INDEX "staff_chat_message_store_idx" ON "StaffChatMessage"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_chat_read_receipt_message_user_unique" ON "StaffChatReadReceipt"("messageId", "userId");

-- CreateIndex
CREATE INDEX "staff_chat_read_receipt_user_idx" ON "StaffChatReadReceipt"("tenantId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "staff_chat_read_receipt_channel_user_idx" ON "StaffChatReadReceipt"("channelId", "userId");

-- AddForeignKey
ALTER TABLE "StaffChatChannel" ADD CONSTRAINT "StaffChatChannel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatChannel" ADD CONSTRAINT "StaffChatChannel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatChannel" ADD CONSTRAINT "StaffChatChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatReadReceipt" ADD CONSTRAINT "StaffChatReadReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatReadReceipt" ADD CONSTRAINT "StaffChatReadReceipt_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatReadReceipt" ADD CONSTRAINT "StaffChatReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StaffChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatReadReceipt" ADD CONSTRAINT "StaffChatReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

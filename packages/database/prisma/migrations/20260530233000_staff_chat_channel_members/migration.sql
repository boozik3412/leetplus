-- CreateTable
CREATE TABLE "StaffChatChannelMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedByUserId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffChatChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_chat_channel_member_unique" ON "StaffChatChannelMember"("channelId", "userId");

-- CreateIndex
CREATE INDEX "staff_chat_channel_member_user_idx" ON "StaffChatChannelMember"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "staff_chat_channel_member_channel_idx" ON "StaffChatChannelMember"("tenantId", "channelId");

-- CreateIndex
CREATE INDEX "staff_chat_channel_member_added_by_idx" ON "StaffChatChannelMember"("addedByUserId");

-- AddForeignKey
ALTER TABLE "StaffChatChannelMember" ADD CONSTRAINT "StaffChatChannelMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatChannelMember" ADD CONSTRAINT "StaffChatChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "StaffChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatChannelMember" ADD CONSTRAINT "StaffChatChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffChatChannelMember" ADD CONSTRAINT "StaffChatChannelMember_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

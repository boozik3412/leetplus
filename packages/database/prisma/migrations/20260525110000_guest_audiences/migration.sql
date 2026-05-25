-- CreateTable
CREATE TABLE "GuestAudience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "guestsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestAudienceMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "guestId" TEXT,
    "externalDomain" TEXT NOT NULL DEFAULT '',
    "externalGuestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestAudienceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_audience_tenant_created_idx" ON "GuestAudience"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "guest_audience_user_idx" ON "GuestAudience"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "guest_audience_member_unique" ON "GuestAudienceMember"("audienceId", "externalDomain", "externalGuestId");

-- CreateIndex
CREATE INDEX "guest_audience_member_audience_idx" ON "GuestAudienceMember"("tenantId", "audienceId");

-- CreateIndex
CREATE INDEX "guest_audience_member_guest_idx" ON "GuestAudienceMember"("guestId");

-- AddForeignKey
ALTER TABLE "GuestAudience" ADD CONSTRAINT "GuestAudience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAudience" ADD CONSTRAINT "GuestAudience_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAudienceMember" ADD CONSTRAINT "GuestAudienceMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAudienceMember" ADD CONSTRAINT "GuestAudienceMember_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAudienceMember" ADD CONSTRAINT "GuestAudienceMember_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

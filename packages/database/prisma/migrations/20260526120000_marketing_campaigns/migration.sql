-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "audienceId" TEXT,
    "storeIds" JSONB,
    "createdByUserId" TEXT,
    "ownerUserId" TEXT,
    "goal" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "channel" TEXT,
    "mechanic" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "budget" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_campaign_status_idx" ON "MarketingCampaign"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "marketing_campaign_audience_idx" ON "MarketingCampaign"("audienceId");

-- CreateIndex
CREATE INDEX "marketing_campaign_created_by_idx" ON "MarketingCampaign"("createdByUserId");

-- CreateIndex
CREATE INDEX "marketing_campaign_owner_idx" ON "MarketingCampaign"("ownerUserId");

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

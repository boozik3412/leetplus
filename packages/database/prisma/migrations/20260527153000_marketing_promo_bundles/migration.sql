CREATE TABLE "MarketingPromoBundle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "bundleType" TEXT NOT NULL,
  "mechanicConfig" JSONB NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingPromoBundle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketingCampaign" ADD COLUMN "promoBundleId" TEXT;

CREATE INDEX "marketing_promo_bundle_status_idx" ON "MarketingPromoBundle"("tenantId", "status", "updatedAt");

CREATE INDEX "marketing_promo_bundle_type_idx" ON "MarketingPromoBundle"("tenantId", "bundleType");

CREATE INDEX "marketing_promo_bundle_created_by_idx" ON "MarketingPromoBundle"("createdByUserId");

CREATE INDEX "marketing_campaign_promo_bundle_idx" ON "MarketingCampaign"("promoBundleId");

ALTER TABLE "MarketingPromoBundle"
  ADD CONSTRAINT "MarketingPromoBundle_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingPromoBundle"
  ADD CONSTRAINT "MarketingPromoBundle_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_promoBundleId_fkey"
  FOREIGN KEY ("promoBundleId") REFERENCES "MarketingPromoBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

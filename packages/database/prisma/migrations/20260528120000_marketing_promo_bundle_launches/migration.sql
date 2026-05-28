CREATE TABLE "MarketingPromoBundleLaunch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "promoBundleId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "storeIds" JSONB,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "maxUses" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingPromoBundleLaunch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_promo_bundle_launch_status_idx"
  ON "MarketingPromoBundleLaunch"("tenantId", "status", "updatedAt");

CREATE INDEX "marketing_promo_bundle_launch_bundle_idx"
  ON "MarketingPromoBundleLaunch"("promoBundleId");

CREATE INDEX "marketing_promo_bundle_launch_created_by_idx"
  ON "MarketingPromoBundleLaunch"("createdByUserId");

ALTER TABLE "MarketingPromoBundleLaunch"
  ADD CONSTRAINT "MarketingPromoBundleLaunch_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingPromoBundleLaunch"
  ADD CONSTRAINT "MarketingPromoBundleLaunch_promoBundleId_fkey"
  FOREIGN KEY ("promoBundleId") REFERENCES "MarketingPromoBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingPromoBundleLaunch"
  ADD CONSTRAINT "MarketingPromoBundleLaunch_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

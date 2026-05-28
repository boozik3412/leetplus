-- CreateTable
CREATE TABLE "MarketingPromoBundleUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "promoBundleId" TEXT NOT NULL,
    "launchId" TEXT,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalId" TEXT,
    "guestExternalId" TEXT,
    "receiptExternalId" TEXT,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(12,2),
    "note" TEXT,
    "sourcePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingPromoBundleUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_promo_bundle_usage_external_uidx" ON "MarketingPromoBundleUsage"("tenantId", "source", "externalProvider", "externalDomain", "externalId");

-- CreateIndex
CREATE INDEX "marketing_promo_bundle_usage_used_at_idx" ON "MarketingPromoBundleUsage"("tenantId", "usedAt");

-- CreateIndex
CREATE INDEX "marketing_promo_bundle_usage_bundle_idx" ON "MarketingPromoBundleUsage"("promoBundleId");

-- CreateIndex
CREATE INDEX "marketing_promo_bundle_usage_launch_idx" ON "MarketingPromoBundleUsage"("launchId");

-- CreateIndex
CREATE INDEX "marketing_promo_bundle_usage_store_idx" ON "MarketingPromoBundleUsage"("storeId");

-- CreateIndex
CREATE INDEX "marketing_promo_bundle_usage_user_idx" ON "MarketingPromoBundleUsage"("createdByUserId");

-- AddForeignKey
ALTER TABLE "MarketingPromoBundleUsage" ADD CONSTRAINT "MarketingPromoBundleUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPromoBundleUsage" ADD CONSTRAINT "MarketingPromoBundleUsage_promoBundleId_fkey" FOREIGN KEY ("promoBundleId") REFERENCES "MarketingPromoBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPromoBundleUsage" ADD CONSTRAINT "MarketingPromoBundleUsage_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "MarketingPromoBundleLaunch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPromoBundleUsage" ADD CONSTRAINT "MarketingPromoBundleUsage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingPromoBundleUsage" ADD CONSTRAINT "MarketingPromoBundleUsage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

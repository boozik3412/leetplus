ALTER TABLE "MarketingPromoBundleLaunch" ADD COLUMN "audienceId" TEXT;

CREATE INDEX "marketing_promo_bundle_launch_audience_idx"
  ON "MarketingPromoBundleLaunch"("audienceId");

ALTER TABLE "MarketingPromoBundleLaunch"
  ADD CONSTRAINT "MarketingPromoBundleLaunch_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

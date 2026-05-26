ALTER TABLE "GuestCrmContactEvent" ADD COLUMN "marketingCampaignId" TEXT;

CREATE INDEX "guest_crm_contact_campaign_idx" ON "GuestCrmContactEvent"("marketingCampaignId");

ALTER TABLE "GuestCrmContactEvent"
  ADD CONSTRAINT "GuestCrmContactEvent_marketingCampaignId_fkey"
  FOREIGN KEY ("marketingCampaignId")
  REFERENCES "MarketingCampaign"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

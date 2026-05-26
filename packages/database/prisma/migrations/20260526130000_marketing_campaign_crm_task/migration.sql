ALTER TABLE "MarketingCampaign" ADD COLUMN "crmTaskId" TEXT;

CREATE INDEX "marketing_campaign_crm_task_idx" ON "MarketingCampaign"("crmTaskId");

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_crmTaskId_fkey"
  FOREIGN KEY ("crmTaskId")
  REFERENCES "GuestCrmTask"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

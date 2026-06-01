CREATE TABLE "MarketingMission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "audienceId" TEXT,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "missionType" TEXT NOT NULL,
  "triggerKind" TEXT NOT NULL,
  "rewardType" TEXT NOT NULL,
  "rewardAmount" DECIMAL(12,2),
  "rewardLabel" TEXT,
  "conditions" JSONB NOT NULL,
  "storeIds" JSONB,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "budgetAmount" DECIMAL(12,2),
  "perGuestLimit" INTEGER,
  "totalRewardLimit" INTEGER,
  "antiFraudRules" JSONB,
  "manualApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingMission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingMissionReward" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "guestId" TEXT,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "externalProvider" "IntegrationProvider",
  "externalDomain" TEXT,
  "externalId" TEXT,
  "guestExternalId" TEXT,
  "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rewardAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "rewardLabel" TEXT NOT NULL,
  "note" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MarketingMissionReward_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_mission_status_idx"
  ON "MarketingMission"("tenantId", "status", "updatedAt");

CREATE INDEX "marketing_mission_type_idx"
  ON "MarketingMission"("tenantId", "missionType");

CREATE INDEX "marketing_mission_audience_idx"
  ON "MarketingMission"("audienceId");

CREATE INDEX "marketing_mission_created_by_idx"
  ON "MarketingMission"("createdByUserId");

CREATE UNIQUE INDEX "marketing_mission_reward_external_uidx"
  ON "MarketingMissionReward"("tenantId", "source", "externalProvider", "externalDomain", "externalId");

CREATE INDEX "marketing_mission_reward_status_idx"
  ON "MarketingMissionReward"("tenantId", "status", "qualifiedAt");

CREATE INDEX "marketing_mission_reward_mission_idx"
  ON "MarketingMissionReward"("missionId");

CREATE INDEX "marketing_mission_reward_guest_idx"
  ON "MarketingMissionReward"("guestId");

CREATE INDEX "marketing_mission_reward_store_idx"
  ON "MarketingMissionReward"("storeId");

CREATE INDEX "marketing_mission_reward_created_by_idx"
  ON "MarketingMissionReward"("createdByUserId");

CREATE INDEX "marketing_mission_reward_approved_by_idx"
  ON "MarketingMissionReward"("approvedByUserId");

ALTER TABLE "MarketingMission"
  ADD CONSTRAINT "MarketingMission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingMission"
  ADD CONSTRAINT "MarketingMission_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingMission"
  ADD CONSTRAINT "MarketingMission_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingMissionReward"
  ADD CONSTRAINT "MarketingMissionReward_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingMissionReward"
  ADD CONSTRAINT "MarketingMissionReward_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "MarketingMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingMissionReward"
  ADD CONSTRAINT "MarketingMissionReward_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingMissionReward"
  ADD CONSTRAINT "MarketingMissionReward_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingMissionReward"
  ADD CONSTRAINT "MarketingMissionReward_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingMissionReward"
  ADD CONSTRAINT "MarketingMissionReward_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

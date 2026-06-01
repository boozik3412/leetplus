CREATE TABLE "GuestGameProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "leadId" TEXT,
  "createdByUserId" TEXT,
  "displayName" TEXT,
  "contactMasked" TEXT,
  "phoneHash" TEXT,
  "telegramIdentity" TEXT,
  "maxIdentity" TEXT,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastActivityAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameLootBox" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "audienceId" TEXT,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "triggerKind" TEXT NOT NULL,
  "rewardType" TEXT NOT NULL,
  "rewardAmount" DECIMAL(12,2),
  "rewardLabel" TEXT,
  "segment" TEXT,
  "sessionType" TEXT,
  "storeIds" JSONB,
  "periodRules" JSONB,
  "limits" JSONB,
  "probabilityRules" JSONB NOT NULL,
  "budgetAmount" DECIMAL(12,2),
  "antiFraudRules" JSONB,
  "manualApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameLootBox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameMission" (
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
  "xpReward" INTEGER NOT NULL DEFAULT 0,
  "progressTarget" INTEGER,
  "progressUnit" TEXT,
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

  CONSTRAINT "GuestGameMission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameSeason" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "audienceId" TEXT,
  "createdByUserId" TEXT,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "seasonType" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "xpRules" JSONB NOT NULL,
  "levels" JSONB NOT NULL,
  "freeRewards" JSONB,
  "premiumRewards" JSONB,
  "premiumEnabled" BOOLEAN NOT NULL DEFAULT false,
  "premiumUpgradeMode" TEXT,
  "budgetAmount" DECIMAL(12,2),
  "manualApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameReward" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT,
  "guestId" TEXT,
  "lootBoxId" TEXT,
  "missionId" TEXT,
  "seasonId" TEXT,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "externalProvider" "IntegrationProvider",
  "externalDomain" TEXT,
  "externalId" TEXT,
  "guestExternalId" TEXT,
  "rewardType" TEXT NOT NULL,
  "rewardAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "rewardLabel" TEXT NOT NULL,
  "rewardCode" TEXT,
  "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "note" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT,
  "guestId" TEXT,
  "lootBoxId" TEXT,
  "missionId" TEXT,
  "seasonId" TEXT,
  "createdByUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "externalProvider" "IntegrationProvider",
  "externalDomain" TEXT,
  "externalId" TEXT,
  "xpDelta" INTEGER NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestGameEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_game_profile_guest_uidx"
  ON "GuestGameProfile"("tenantId", "guestId");

CREATE UNIQUE INDEX "guest_game_profile_lead_uidx"
  ON "GuestGameProfile"("tenantId", "leadId");

CREATE INDEX "guest_game_profile_status_idx"
  ON "GuestGameProfile"("tenantId", "status", "updatedAt");

CREATE INDEX "guest_game_profile_phone_idx"
  ON "GuestGameProfile"("tenantId", "phoneHash");

CREATE INDEX "guest_game_profile_level_idx"
  ON "GuestGameProfile"("tenantId", "level");

CREATE INDEX "guest_game_profile_created_by_idx"
  ON "GuestGameProfile"("createdByUserId");

CREATE INDEX "guest_game_loot_box_status_idx"
  ON "GuestGameLootBox"("tenantId", "status", "updatedAt");

CREATE INDEX "guest_game_loot_box_trigger_idx"
  ON "GuestGameLootBox"("tenantId", "triggerKind");

CREATE INDEX "guest_game_loot_box_audience_idx"
  ON "GuestGameLootBox"("audienceId");

CREATE INDEX "guest_game_loot_box_created_by_idx"
  ON "GuestGameLootBox"("createdByUserId");

CREATE INDEX "guest_game_mission_status_idx"
  ON "GuestGameMission"("tenantId", "status", "updatedAt");

CREATE INDEX "guest_game_mission_type_idx"
  ON "GuestGameMission"("tenantId", "missionType");

CREATE INDEX "guest_game_mission_audience_idx"
  ON "GuestGameMission"("audienceId");

CREATE INDEX "guest_game_mission_created_by_idx"
  ON "GuestGameMission"("createdByUserId");

CREATE INDEX "guest_game_season_status_idx"
  ON "GuestGameSeason"("tenantId", "status", "updatedAt");

CREATE INDEX "guest_game_season_type_idx"
  ON "GuestGameSeason"("tenantId", "seasonType");

CREATE INDEX "guest_game_season_audience_idx"
  ON "GuestGameSeason"("audienceId");

CREATE INDEX "guest_game_season_created_by_idx"
  ON "GuestGameSeason"("createdByUserId");

CREATE UNIQUE INDEX "guest_game_reward_external_uidx"
  ON "GuestGameReward"("tenantId", "source", "externalProvider", "externalDomain", "externalId");

CREATE INDEX "guest_game_reward_status_idx"
  ON "GuestGameReward"("tenantId", "status", "qualifiedAt");

CREATE INDEX "guest_game_reward_profile_idx"
  ON "GuestGameReward"("profileId");

CREATE INDEX "guest_game_reward_guest_idx"
  ON "GuestGameReward"("guestId");

CREATE INDEX "guest_game_reward_loot_box_idx"
  ON "GuestGameReward"("lootBoxId");

CREATE INDEX "guest_game_reward_mission_idx"
  ON "GuestGameReward"("missionId");

CREATE INDEX "guest_game_reward_season_idx"
  ON "GuestGameReward"("seasonId");

CREATE INDEX "guest_game_reward_store_idx"
  ON "GuestGameReward"("storeId");

CREATE INDEX "guest_game_reward_created_by_idx"
  ON "GuestGameReward"("createdByUserId");

CREATE INDEX "guest_game_reward_approved_by_idx"
  ON "GuestGameReward"("approvedByUserId");

CREATE UNIQUE INDEX "guest_game_event_external_uidx"
  ON "GuestGameEvent"("tenantId", "source", "externalProvider", "externalDomain", "externalId");

CREATE INDEX "guest_game_event_type_idx"
  ON "GuestGameEvent"("tenantId", "eventType", "occurredAt");

CREATE INDEX "guest_game_event_profile_idx"
  ON "GuestGameEvent"("profileId");

CREATE INDEX "guest_game_event_guest_idx"
  ON "GuestGameEvent"("guestId");

CREATE INDEX "guest_game_event_loot_box_idx"
  ON "GuestGameEvent"("lootBoxId");

CREATE INDEX "guest_game_event_mission_idx"
  ON "GuestGameEvent"("missionId");

CREATE INDEX "guest_game_event_season_idx"
  ON "GuestGameEvent"("seasonId");

CREATE INDEX "guest_game_event_created_by_idx"
  ON "GuestGameEvent"("createdByUserId");

ALTER TABLE "GuestGameProfile"
  ADD CONSTRAINT "GuestGameProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameProfile"
  ADD CONSTRAINT "GuestGameProfile_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameProfile"
  ADD CONSTRAINT "GuestGameProfile_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "GuestCrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameProfile"
  ADD CONSTRAINT "GuestGameProfile_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameLootBox"
  ADD CONSTRAINT "GuestGameLootBox_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameLootBox"
  ADD CONSTRAINT "GuestGameLootBox_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameLootBox"
  ADD CONSTRAINT "GuestGameLootBox_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameMission"
  ADD CONSTRAINT "GuestGameMission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameMission"
  ADD CONSTRAINT "GuestGameMission_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameMission"
  ADD CONSTRAINT "GuestGameMission_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameSeason"
  ADD CONSTRAINT "GuestGameSeason_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameSeason"
  ADD CONSTRAINT "GuestGameSeason_audienceId_fkey"
  FOREIGN KEY ("audienceId") REFERENCES "GuestAudience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameSeason"
  ADD CONSTRAINT "GuestGameSeason_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_lootBoxId_fkey"
  FOREIGN KEY ("lootBoxId") REFERENCES "GuestGameLootBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "GuestGameMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "GuestGameSeason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameReward"
  ADD CONSTRAINT "GuestGameReward_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_lootBoxId_fkey"
  FOREIGN KEY ("lootBoxId") REFERENCES "GuestGameLootBox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "GuestGameMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "GuestGameSeason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameEvent"
  ADD CONSTRAINT "GuestGameEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

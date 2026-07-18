CREATE TABLE "GuestGameXpPosting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestedDelta" INTEGER NOT NULL,
  "appliedDelta" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "evidence" JSONB,
  "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestGameXpPosting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestGameXpPosting_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuestGameXpPosting_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuestGameXpPosting_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "GuestGameEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GuestGameXpPosting_eventId_key"
  ON "GuestGameXpPosting"("eventId");

CREATE UNIQUE INDEX "guest_game_xp_posting_idempotency_uidx"
  ON "GuestGameXpPosting"("tenantId", "idempotencyKey");

CREATE INDEX "guest_game_xp_posting_profile_idx"
  ON "GuestGameXpPosting"("profileId", "postedAt");

CREATE INDEX "guest_game_xp_posting_tenant_idx"
  ON "GuestGameXpPosting"("tenantId", "postedAt");

CREATE TABLE "GuestGameRewardIntent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "profileId" TEXT,
  "rewardId" TEXT,
  "originKey" TEXT,
  "ruleType" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "effectKind" TEXT NOT NULL DEFAULT 'REWARD',
  "slotKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "claimKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "plan" JSONB NOT NULL,
  "qualifiedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameRewardIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestGameRewardIntent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuestGameRewardIntent_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "GuestGameEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GuestGameRewardIntent_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GuestGameRewardIntent_rewardId_fkey"
    FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GuestGameRewardIntent_rewardId_key"
  ON "GuestGameRewardIntent"("rewardId");

CREATE UNIQUE INDEX "guest_game_reward_intent_idempotency_uidx"
  ON "GuestGameRewardIntent"("tenantId", "idempotencyKey");

CREATE UNIQUE INDEX "guest_game_reward_intent_claim_uidx"
  ON "GuestGameRewardIntent"("tenantId", "claimKey");

CREATE INDEX "guest_game_reward_intent_queue_idx"
  ON "GuestGameRewardIntent"("tenantId", "status", "nextAttemptAt", "createdAt", "id");

CREATE INDEX "guest_game_reward_intent_claim_idx"
  ON "GuestGameRewardIntent"("tenantId", "status", "claimExpiresAt");

CREATE INDEX "guest_game_reward_intent_event_idx"
  ON "GuestGameRewardIntent"("eventId");

CREATE INDEX "guest_game_reward_intent_profile_idx"
  ON "GuestGameRewardIntent"("profileId", "status", "qualifiedAt");

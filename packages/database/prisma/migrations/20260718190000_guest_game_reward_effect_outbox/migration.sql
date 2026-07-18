ALTER TABLE "StaffChatMessage"
  ADD COLUMN "dedupeKey" TEXT;

CREATE TABLE "GuestGameRewardEffect" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "effectKind" TEXT NOT NULL,
  "slotKey" TEXT NOT NULL DEFAULT 'primary',
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameRewardEffect_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestGameRewardEffect_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuestGameRewardEffect_rewardId_fkey"
    FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guest_game_reward_effect_idempotency_uidx"
  ON "GuestGameRewardEffect"("tenantId", "idempotencyKey");

CREATE UNIQUE INDEX "guest_game_reward_effect_slot_uidx"
  ON "GuestGameRewardEffect"("tenantId", "rewardId", "effectKind", "slotKey");

CREATE INDEX "guest_game_reward_effect_queue_idx"
  ON "GuestGameRewardEffect"("tenantId", "status", "nextAttemptAt", "createdAt", "id");

CREATE INDEX "guest_game_reward_effect_claim_idx"
  ON "GuestGameRewardEffect"("tenantId", "status", "claimExpiresAt");

CREATE INDEX "guest_game_reward_effect_reward_idx"
  ON "GuestGameRewardEffect"("rewardId", "status");

CREATE INDEX "guest_game_reward_intent_ready_partial_idx"
  ON "GuestGameRewardIntent"("tenantId", "nextAttemptAt", "createdAt", "id")
  WHERE "status" IN ('PENDING', 'FAILED', 'PROCESSING');

CREATE INDEX "guest_game_reward_effect_ready_partial_idx"
  ON "GuestGameRewardEffect"("tenantId", "nextAttemptAt", "createdAt", "id")
  WHERE "status" IN ('PENDING', 'FAILED', 'PROCESSING');

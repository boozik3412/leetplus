CREATE TABLE "GuestGameCompletionNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestGameCompletionNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_game_completion_notification_reward_uidx"
ON "GuestGameCompletionNotification"("tenantId", "rewardId");

CREATE INDEX "guest_game_completion_notification_pending_idx"
ON "GuestGameCompletionNotification"("tenantId", "profileId", "acknowledgedAt", "createdAt");

ALTER TABLE "GuestGameCompletionNotification"
ADD CONSTRAINT "GuestGameCompletionNotification_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameCompletionNotification"
ADD CONSTRAINT "GuestGameCompletionNotification_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameCompletionNotification"
ADD CONSTRAINT "GuestGameCompletionNotification_rewardId_fkey"
FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

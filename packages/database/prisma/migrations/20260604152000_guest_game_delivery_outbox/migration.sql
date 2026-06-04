CREATE TABLE "GuestGameDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "profileId" TEXT,
  "guestId" TEXT,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'READY',
  "readinessStatus" TEXT NOT NULL,
  "recipientMasked" TEXT,
  "channelIdentityMasked" TEXT,
  "messageTitle" TEXT NOT NULL,
  "messageBody" TEXT NOT NULL,
  "blockers" JSONB,
  "metadata" JSONB,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGameDeliveryEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "channel" TEXT,
  "note" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestGameDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_game_delivery_reward_channel_uidx"
  ON "GuestGameDelivery"("tenantId", "rewardId", "channel");

CREATE INDEX "guest_game_delivery_status_idx"
  ON "GuestGameDelivery"("tenantId", "status", "preparedAt");

CREATE INDEX "guest_game_delivery_readiness_idx"
  ON "GuestGameDelivery"("tenantId", "readinessStatus");

CREATE INDEX "guest_game_delivery_reward_idx"
  ON "GuestGameDelivery"("rewardId");

CREATE INDEX "guest_game_delivery_profile_idx"
  ON "GuestGameDelivery"("profileId");

CREATE INDEX "guest_game_delivery_guest_idx"
  ON "GuestGameDelivery"("guestId");

CREATE INDEX "guest_game_delivery_store_idx"
  ON "GuestGameDelivery"("storeId");

CREATE INDEX "guest_game_delivery_created_by_idx"
  ON "GuestGameDelivery"("createdByUserId");

CREATE INDEX "guest_game_delivery_event_type_idx"
  ON "GuestGameDeliveryEvent"("tenantId", "eventType", "createdAt");

CREATE INDEX "guest_game_delivery_event_delivery_idx"
  ON "GuestGameDeliveryEvent"("deliveryId");

CREATE INDEX "guest_game_delivery_event_reward_idx"
  ON "GuestGameDeliveryEvent"("rewardId");

CREATE INDEX "guest_game_delivery_event_actor_idx"
  ON "GuestGameDeliveryEvent"("actorUserId");

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameDelivery"
  ADD CONSTRAINT "GuestGameDelivery_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestGameDeliveryEvent"
  ADD CONSTRAINT "GuestGameDeliveryEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestGameDeliveryEvent"
  ADD CONSTRAINT "GuestGameDeliveryEvent_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "GuestGameDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameDeliveryEvent"
  ADD CONSTRAINT "GuestGameDeliveryEvent_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestGameDeliveryEvent"
  ADD CONSTRAINT "GuestGameDeliveryEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

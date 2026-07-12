CREATE TABLE "GuestGameEntitlement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT,
  "guestId" TEXT,
  "storeId" TEXT,
  "eventId" TEXT,
  "evaluationRunId" TEXT,
  "ruleType" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "ruleName" TEXT,
  "sourceEventType" TEXT,
  "sourceFactId" TEXT,
  "sourceFactKind" TEXT,
  "traceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "idempotencyKey" TEXT NOT NULL,
  "qualifiedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "rewardId" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_game_entitlement_idempotency_uidx"
  ON "GuestGameEntitlement" ("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "guest_game_entitlement_reward_uidx"
  ON "GuestGameEntitlement" ("rewardId");
CREATE INDEX "guest_game_entitlement_status_idx"
  ON "GuestGameEntitlement" ("tenantId", "status", "qualifiedAt");
CREATE INDEX "guest_game_entitlement_profile_idx"
  ON "GuestGameEntitlement" ("profileId", "status", "qualifiedAt");
CREATE INDEX "guest_game_entitlement_guest_idx"
  ON "GuestGameEntitlement" ("guestId", "status", "qualifiedAt");
CREATE INDEX "guest_game_entitlement_store_idx"
  ON "GuestGameEntitlement" ("storeId", "status", "qualifiedAt");
CREATE INDEX "guest_game_entitlement_rule_idx"
  ON "GuestGameEntitlement" ("tenantId", "ruleType", "ruleId", "qualifiedAt");
CREATE INDEX "guest_game_entitlement_event_idx"
  ON "GuestGameEntitlement" ("eventId");
CREATE INDEX "guest_game_entitlement_run_idx"
  ON "GuestGameEntitlement" ("evaluationRunId");

ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "GuestGameEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestGameEntitlement"
  ADD CONSTRAINT "GuestGameEntitlement_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

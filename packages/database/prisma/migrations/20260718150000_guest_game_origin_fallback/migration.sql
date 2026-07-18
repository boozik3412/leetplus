ALTER TABLE "GuestGameEvent"
  ADD COLUMN "originKey" TEXT;

ALTER TABLE "GuestGameReward"
  ADD COLUMN "originKey" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "GuestGameRuleDecision"
  ADD COLUMN "originKey" TEXT;

ALTER TABLE "GuestGameEntitlement"
  ADD COLUMN "originKey" TEXT;

ALTER TABLE "GuestActivityRawRecord"
  ADD COLUMN "sourceExternalId" TEXT;

ALTER TABLE "GuestActivityFact"
  ADD COLUMN "sourceExternalId" TEXT;

CREATE TABLE "GuestGameOriginReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "originKey" TEXT NOT NULL,
  "factId" TEXT,
  "eventId" TEXT,
  "eventType" TEXT NOT NULL,
  "externalProvider" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" TEXT NOT NULL,
  "policy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_LIVE',
  "claimedSource" TEXT,
  "ledgerFirstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "graceUntil" TIMESTAMP(3) NOT NULL,
  "claimExpiresAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestGameOriginReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestGameOriginReceipt_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guest_game_origin_receipt_origin_uidx"
  ON "GuestGameOriginReceipt"("tenantId", "originKey");

CREATE INDEX "guest_game_origin_receipt_queue_idx"
  ON "GuestGameOriginReceipt"("tenantId", "status", "graceUntil");

CREATE INDEX "guest_game_origin_receipt_claim_idx"
  ON "GuestGameOriginReceipt"("tenantId", "status", "claimExpiresAt");

CREATE INDEX "guest_game_origin_receipt_event_idx"
  ON "GuestGameOriginReceipt"("tenantId", "eventType", "status");

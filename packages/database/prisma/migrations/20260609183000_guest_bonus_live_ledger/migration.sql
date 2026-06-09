CREATE TABLE "GuestBonusBalanceCurrent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "externalProvider" "IntegrationProvider",
  "externalDomain" TEXT,
  "externalGuestId" TEXT NOT NULL,
  "bonusBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'LANGAME_SNAPSHOT',
  "sourcePayloadHash" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestBonusBalanceCurrent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestBonusLedgerEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "profileId" TEXT,
  "rewardId" TEXT,
  "storeId" TEXT,
  "createdByUserId" TEXT,
  "processedByUserId" TEXT,
  "externalProvider" "IntegrationProvider",
  "externalDomain" TEXT,
  "externalGuestId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "entryType" TEXT NOT NULL DEFAULT 'EARN',
  "source" TEXT NOT NULL DEFAULT 'GAMIFICATION',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,2) NOT NULL,
  "balanceBefore" DECIMAL(12,2),
  "balanceAfter" DECIMAL(12,2),
  "reason" TEXT,
  "langameRequest" JSONB,
  "langameResponse" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestBonusLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_bonus_balance_current_guest_uidx"
  ON "GuestBonusBalanceCurrent"("guestId");

CREATE UNIQUE INDEX "guest_bonus_balance_current_external_uidx"
  ON "GuestBonusBalanceCurrent"("tenantId", "externalProvider", "externalDomain", "externalGuestId");

CREATE INDEX "guest_bonus_balance_current_snapshot_idx"
  ON "GuestBonusBalanceCurrent"("tenantId", "snapshotDate");

CREATE INDEX "guest_bonus_balance_current_balance_idx"
  ON "GuestBonusBalanceCurrent"("tenantId", "bonusBalance");

CREATE UNIQUE INDEX "guest_bonus_ledger_idempotency_uidx"
  ON "GuestBonusLedgerEntry"("tenantId", "idempotencyKey");

CREATE INDEX "guest_bonus_ledger_queue_idx"
  ON "GuestBonusLedgerEntry"("tenantId", "status", "nextAttemptAt");

CREATE INDEX "guest_bonus_ledger_guest_idx"
  ON "GuestBonusLedgerEntry"("tenantId", "guestId", "createdAt");

CREATE INDEX "guest_bonus_ledger_source_idx"
  ON "GuestBonusLedgerEntry"("tenantId", "source", "createdAt");

CREATE INDEX "guest_bonus_ledger_external_guest_idx"
  ON "GuestBonusLedgerEntry"("tenantId", "externalProvider", "externalDomain", "externalGuestId");

CREATE INDEX "guest_bonus_ledger_profile_idx"
  ON "GuestBonusLedgerEntry"("profileId");

CREATE INDEX "guest_bonus_ledger_reward_idx"
  ON "GuestBonusLedgerEntry"("rewardId");

CREATE INDEX "guest_bonus_ledger_store_idx"
  ON "GuestBonusLedgerEntry"("storeId");

CREATE INDEX "guest_bonus_ledger_created_by_idx"
  ON "GuestBonusLedgerEntry"("createdByUserId");

CREATE INDEX "guest_bonus_ledger_processed_by_idx"
  ON "GuestBonusLedgerEntry"("processedByUserId");

ALTER TABLE "GuestBonusBalanceCurrent"
  ADD CONSTRAINT "GuestBonusBalanceCurrent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestBonusBalanceCurrent"
  ADD CONSTRAINT "GuestBonusBalanceCurrent_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "GuestGameReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestBonusLedgerEntry"
  ADD CONSTRAINT "GuestBonusLedgerEntry_processedByUserId_fkey"
  FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "GuestBonusBalanceCurrent" (
  "id",
  "tenantId",
  "guestId",
  "externalProvider",
  "externalDomain",
  "externalGuestId",
  "bonusBalance",
  "snapshotDate",
  "source",
  "sourcePayloadHash",
  "lastSyncedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  latest."tenantId",
  latest."guestId",
  latest."externalProvider",
  latest."externalDomain",
  latest."externalGuestId",
  latest."bonusBalance"::DECIMAL(12,2),
  latest."snapshotDate",
  'LANGAME_SNAPSHOT',
  latest."sourcePayloadHash",
  latest."updatedAt",
  latest."createdAt",
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (
    "tenantId",
    "externalProvider",
    "externalDomain",
    "externalGuestId"
  )
    "tenantId",
    "guestId",
    "externalProvider",
    "externalDomain",
    "externalGuestId",
    "bonusBalance",
    "snapshotDate",
    "sourcePayloadHash",
    "createdAt",
    "updatedAt"
  FROM "GuestBonusBalanceSnapshot"
  ORDER BY
    "tenantId",
    "externalProvider",
    "externalDomain",
    "externalGuestId",
    "snapshotDate" DESC,
    "updatedAt" DESC
) latest
ON CONFLICT ("tenantId", "externalProvider", "externalDomain", "externalGuestId") DO NOTHING;

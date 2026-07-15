ALTER TABLE "GuestGameMission"
ADD COLUMN "definitionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "evaluationPolicy" TEXT NOT NULL DEFAULT 'LIVE_PRIMARY';

CREATE INDEX "guest_game_mission_evaluation_policy_idx"
ON "GuestGameMission"("tenantId", "status", "evaluationPolicy");

CREATE TABLE "GuestGameSupplementalFactReceipt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "factId" TEXT,
  "eventId" TEXT,
  "factType" TEXT NOT NULL,
  "externalDomain" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestGameSupplementalFactReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestGameSupplementalFactReceipt_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "guest_game_supplemental_fact_uidx"
ON "GuestGameSupplementalFactReceipt"("tenantId", "factType", "externalDomain", "sourceHash");

CREATE INDEX "guest_game_supplemental_fact_status_idx"
ON "GuestGameSupplementalFactReceipt"("tenantId", "status", "updatedAt");

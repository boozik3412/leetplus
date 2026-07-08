-- Guest Langame activity ledger: raw records, normalized facts and per-guest sync state.

CREATE TABLE "GuestActivityRawRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "profileId" TEXT,
  "storeId" TEXT,
  "integrationSourceId" TEXT,
  "externalProvider" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" TEXT NOT NULL,
  "externalGuestId" TEXT NOT NULL,
  "externalClubId" TEXT,
  "sourceKind" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "rawType" TEXT,
  "rawText" TEXT,
  "happenedAt" TIMESTAMP(3),
  "sourceLocalDate" TEXT,
  "sessionExternalId" TEXT,
  "amount" DECIMAL(12,2),
  "bonusAmount" DECIMAL(12,2),
  "rawPayload" JSONB NOT NULL,
  "parseStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestActivityRawRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestActivityFact" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "rawRecordId" TEXT,
  "guestId" TEXT,
  "profileId" TEXT,
  "storeId" TEXT,
  "externalProvider" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" TEXT NOT NULL,
  "externalGuestId" TEXT NOT NULL,
  "externalClubId" TEXT,
  "sourceKind" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "factType" TEXT NOT NULL,
  "happenedAt" TIMESTAMP(3),
  "sourceLocalDate" TEXT,
  "sessionExternalId" TEXT,
  "tariffName" TEXT,
  "tariffType" TEXT,
  "amount" DECIMAL(12,2),
  "bonusAmount" DECIMAL(12,2),
  "durationMinutes" INTEGER,
  "confidence" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestActivityFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestActivitySyncState" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "profileId" TEXT,
  "storeId" TEXT,
  "integrationSourceId" TEXT,
  "externalProvider" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" TEXT NOT NULL,
  "externalGuestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "syncFrom" TIMESTAMP(3),
  "lastRequestedFrom" TIMESTAMP(3),
  "lastRequestedTo" TIMESTAMP(3),
  "lastSuccessfulTo" TIMESTAMP(3),
  "lastStartedAt" TIMESTAMP(3),
  "lastFinishedAt" TIMESTAMP(3),
  "rawRecordsCount" INTEGER NOT NULL DEFAULT 0,
  "factsCount" INTEGER NOT NULL DEFAULT 0,
  "diagnostics" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestActivitySyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_activity_raw_source_hash_uidx"
  ON "GuestActivityRawRecord" ("tenantId", "sourceKind", "externalProvider", "externalDomain", "sourceHash");
CREATE INDEX "guest_activity_raw_happened_idx"
  ON "GuestActivityRawRecord" ("tenantId", "happenedAt");
CREATE INDEX "guest_activity_raw_external_guest_idx"
  ON "GuestActivityRawRecord" ("tenantId", "externalProvider", "externalDomain", "externalGuestId");
CREATE INDEX "guest_activity_raw_kind_idx"
  ON "GuestActivityRawRecord" ("tenantId", "sourceKind");
CREATE INDEX "guest_activity_raw_type_idx"
  ON "GuestActivityRawRecord" ("tenantId", "rawType");
CREATE INDEX "guest_activity_raw_guest_idx"
  ON "GuestActivityRawRecord" ("guestId");
CREATE INDEX "guest_activity_raw_profile_idx"
  ON "GuestActivityRawRecord" ("profileId");
CREATE INDEX "guest_activity_raw_store_idx"
  ON "GuestActivityRawRecord" ("storeId");
CREATE INDEX "guest_activity_raw_source_idx"
  ON "GuestActivityRawRecord" ("integrationSourceId");

CREATE UNIQUE INDEX "guest_activity_fact_hash_uidx"
  ON "GuestActivityFact" ("tenantId", "factType", "sourceHash");
CREATE INDEX "guest_activity_fact_happened_idx"
  ON "GuestActivityFact" ("tenantId", "happenedAt");
CREATE INDEX "guest_activity_fact_external_guest_idx"
  ON "GuestActivityFact" ("tenantId", "externalProvider", "externalDomain", "externalGuestId");
CREATE INDEX "guest_activity_fact_type_idx"
  ON "GuestActivityFact" ("tenantId", "factType", "happenedAt");
CREATE INDEX "guest_activity_fact_tariff_type_idx"
  ON "GuestActivityFact" ("tenantId", "tariffType");
CREATE INDEX "guest_activity_fact_raw_idx"
  ON "GuestActivityFact" ("rawRecordId");
CREATE INDEX "guest_activity_fact_guest_idx"
  ON "GuestActivityFact" ("guestId");
CREATE INDEX "guest_activity_fact_profile_idx"
  ON "GuestActivityFact" ("profileId");
CREATE INDEX "guest_activity_fact_store_idx"
  ON "GuestActivityFact" ("storeId");

CREATE UNIQUE INDEX "guest_activity_sync_external_guest_uidx"
  ON "GuestActivitySyncState" ("tenantId", "externalProvider", "externalDomain", "externalGuestId");
CREATE INDEX "guest_activity_sync_status_idx"
  ON "GuestActivitySyncState" ("tenantId", "status", "lastStartedAt");
CREATE INDEX "guest_activity_sync_success_idx"
  ON "GuestActivitySyncState" ("tenantId", "lastSuccessfulTo");
CREATE INDEX "guest_activity_sync_guest_idx"
  ON "GuestActivitySyncState" ("guestId");
CREATE INDEX "guest_activity_sync_profile_idx"
  ON "GuestActivitySyncState" ("profileId");
CREATE INDEX "guest_activity_sync_store_idx"
  ON "GuestActivitySyncState" ("storeId");
CREATE INDEX "guest_activity_sync_source_idx"
  ON "GuestActivitySyncState" ("integrationSourceId");

ALTER TABLE "GuestActivityRawRecord"
  ADD CONSTRAINT "GuestActivityRawRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestActivityRawRecord"
  ADD CONSTRAINT "GuestActivityRawRecord_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivityRawRecord"
  ADD CONSTRAINT "GuestActivityRawRecord_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivityRawRecord"
  ADD CONSTRAINT "GuestActivityRawRecord_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivityRawRecord"
  ADD CONSTRAINT "GuestActivityRawRecord_integrationSourceId_fkey"
  FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestActivityFact"
  ADD CONSTRAINT "GuestActivityFact_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestActivityFact"
  ADD CONSTRAINT "GuestActivityFact_rawRecordId_fkey"
  FOREIGN KEY ("rawRecordId") REFERENCES "GuestActivityRawRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestActivityFact"
  ADD CONSTRAINT "GuestActivityFact_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivityFact"
  ADD CONSTRAINT "GuestActivityFact_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivityFact"
  ADD CONSTRAINT "GuestActivityFact_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestActivitySyncState"
  ADD CONSTRAINT "GuestActivitySyncState_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncState"
  ADD CONSTRAINT "GuestActivitySyncState_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncState"
  ADD CONSTRAINT "GuestActivitySyncState_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncState"
  ADD CONSTRAINT "GuestActivitySyncState_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncState"
  ADD CONSTRAINT "GuestActivitySyncState_integrationSourceId_fkey"
  FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

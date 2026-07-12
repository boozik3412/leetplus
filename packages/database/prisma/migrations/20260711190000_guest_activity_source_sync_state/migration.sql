CREATE TABLE "GuestActivitySourceSyncState" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "guestId" TEXT,
  "profileId" TEXT,
  "storeId" TEXT,
  "integrationSourceId" TEXT,
  "externalProvider" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
  "externalDomain" TEXT NOT NULL,
  "externalGuestId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "syncFrom" TIMESTAMP(3),
  "lastRequestedFrom" TIMESTAMP(3),
  "lastRequestedTo" TIMESTAMP(3),
  "lastSuccessfulTo" TIMESTAMP(3),
  "lastStartedAt" TIMESTAMP(3),
  "lastFinishedAt" TIMESTAMP(3),
  "lastPage" INTEGER,
  "nextPage" INTEGER,
  "rowsFetched" INTEGER NOT NULL DEFAULT 0,
  "rowsMatched" INTEGER NOT NULL DEFAULT 0,
  "diagnostics" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestActivitySourceSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_activity_source_sync_uidx"
  ON "GuestActivitySourceSyncState" ("tenantId", "externalProvider", "externalDomain", "externalGuestId", "sourceKind");
CREATE INDEX "guest_activity_source_sync_status_idx"
  ON "GuestActivitySourceSyncState" ("tenantId", "status", "lastStartedAt");
CREATE INDEX "guest_activity_source_sync_success_idx"
  ON "GuestActivitySourceSyncState" ("tenantId", "sourceKind", "lastSuccessfulTo");
CREATE INDEX "guest_activity_source_sync_guest_idx"
  ON "GuestActivitySourceSyncState" ("guestId");
CREATE INDEX "guest_activity_source_sync_profile_idx"
  ON "GuestActivitySourceSyncState" ("profileId");
CREATE INDEX "guest_activity_source_sync_store_idx"
  ON "GuestActivitySourceSyncState" ("storeId");
CREATE INDEX "guest_activity_source_sync_source_idx"
  ON "GuestActivitySourceSyncState" ("integrationSourceId");

ALTER TABLE "GuestActivitySourceSyncState"
  ADD CONSTRAINT "GuestActivitySourceSyncState_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySourceSyncState"
  ADD CONSTRAINT "GuestActivitySourceSyncState_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySourceSyncState"
  ADD CONSTRAINT "GuestActivitySourceSyncState_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySourceSyncState"
  ADD CONSTRAINT "GuestActivitySourceSyncState_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySourceSyncState"
  ADD CONSTRAINT "GuestActivitySourceSyncState_integrationSourceId_fkey"
  FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GuestActivitySyncJob" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "guestId" TEXT,
  "storeId" TEXT,
  "jobKey" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "rerunRequested" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB,
  "lastError" TEXT,
  "lastStartedAt" TIMESTAMP(3),
  "lastFinishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GuestActivitySyncJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_activity_sync_job_key_uidx"
  ON "GuestActivitySyncJob" ("jobKey");
CREATE INDEX "guest_activity_sync_job_queue_idx"
  ON "GuestActivitySyncJob" ("status", "nextAttemptAt");
CREATE INDEX "guest_activity_sync_job_tenant_queue_idx"
  ON "GuestActivitySyncJob" ("tenantId", "status", "nextAttemptAt");
CREATE INDEX "guest_activity_sync_job_profile_idx"
  ON "GuestActivitySyncJob" ("profileId", "updatedAt");
CREATE INDEX "guest_activity_sync_job_guest_idx"
  ON "GuestActivitySyncJob" ("guestId");
CREATE INDEX "guest_activity_sync_job_store_idx"
  ON "GuestActivitySyncJob" ("storeId");

ALTER TABLE "GuestActivitySyncJob"
  ADD CONSTRAINT "GuestActivitySyncJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncJob"
  ADD CONSTRAINT "GuestActivitySyncJob_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "GuestGameProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncJob"
  ADD CONSTRAINT "GuestActivitySyncJob_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestActivitySyncJob"
  ADD CONSTRAINT "GuestActivitySyncJob_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guest module data foundation.
-- First stage keeps LAngame guest data tenant-scoped and idempotent, while
-- avoiding raw phone/email/full-name/document storage.

ALTER TABLE "SalesFact"
  ADD COLUMN "externalGuestId" TEXT,
  ADD COLUMN "guestId" TEXT;

CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalGuestId" TEXT NOT NULL,
    "externalGuestTypeId" TEXT,
    "phoneHash" TEXT,
    "phoneMasked" TEXT,
    "emailHash" TEXT,
    "emailMasked" TEXT,
    "fullNameHash" TEXT,
    "fullNameMasked" TEXT,
    "birthYear" INTEGER,
    "birthMonth" INTEGER,
    "birthDay" INTEGER,
    "gender" TEXT,
    "insertedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "isTemporary" BOOLEAN NOT NULL DEFAULT false,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "isSimpleRegistration" BOOLEAN NOT NULL DEFAULT false,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "currentCountHours" DECIMAL(65,30),
    "isMobileRegistration" BOOLEAN NOT NULL DEFAULT false,
    "identityDocumentPresent" BOOLEAN NOT NULL DEFAULT false,
    "bonusProgramNumber" TEXT,
    "sourcePayloadHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(65,30),
    "countHoursFrom" DECIMAL(65,30),
    "countHoursTo" DECIMAL(65,30),
    "bonusBirthday" DECIMAL(65,30),
    "sourcePayloadHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestId" TEXT,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalGuestId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL,
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestBonusBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestId" TEXT,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalGuestId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "bonusBalance" DECIMAL(65,30) NOT NULL,
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestBonusBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestId" TEXT,
    "storeId" TEXT,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalSessionId" TEXT NOT NULL,
    "externalGuestId" TEXT,
    "externalClubId" TEXT,
    "externalUuid" TEXT,
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "normalStop" BOOLEAN,
    "expand" BOOLEAN,
    "createByRezerv" BOOLEAN,
    "packet" BOOLEAN,
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestId" TEXT,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "sourceKey" TEXT NOT NULL,
    "externalGuestId" TEXT,
    "type" TEXT,
    "happenedAt" TIMESTAMP(3),
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestId" TEXT,
    "storeId" TEXT,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalTransactionId" TEXT NOT NULL,
    "externalGuestId" TEXT,
    "externalClubId" TEXT,
    "type" TEXT,
    "happenedAt" TIMESTAMP(3),
    "updatedAtExternal" TIMESTAMP(3),
    "amount" DECIMAL(65,30),
    "balance" DECIMAL(65,30),
    "bonusBalance" DECIMAL(65,30),
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestOperationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "sourceKey" TEXT NOT NULL,
    "externalClubId" TEXT,
    "type" TEXT,
    "happenedAt" TIMESTAMP(3),
    "amount" DECIMAL(65,30),
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestOperationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestDataProfileRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationSourceId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "guestsCount" INTEGER NOT NULL DEFAULT 0,
    "sessionsCount" INTEGER NOT NULL DEFAULT 0,
    "transactionsCount" INTEGER NOT NULL DEFAULT 0,
    "productSalesLinked" INTEGER NOT NULL DEFAULT 0,
    "profile" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "GuestDataProfileRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Guest_tenantId_externalProvider_externalDomain_externalGuestId_key" ON "Guest"("tenantId", "externalProvider", "externalDomain", "externalGuestId");
CREATE INDEX "Guest_tenantId_idx" ON "Guest"("tenantId");
CREATE INDEX "Guest_tenantId_externalGuestTypeId_idx" ON "Guest"("tenantId", "externalGuestTypeId");
CREATE INDEX "Guest_tenantId_lastActivityAt_idx" ON "Guest"("tenantId", "lastActivityAt");
CREATE INDEX "Guest_tenantId_phoneHash_idx" ON "Guest"("tenantId", "phoneHash");
CREATE INDEX "Guest_tenantId_emailHash_idx" ON "Guest"("tenantId", "emailHash");

CREATE UNIQUE INDEX "GuestGroup_tenantId_externalProvider_externalDomain_externalGroupId_key" ON "GuestGroup"("tenantId", "externalProvider", "externalDomain", "externalGroupId");
CREATE INDEX "GuestGroup_tenantId_idx" ON "GuestGroup"("tenantId");

CREATE UNIQUE INDEX "GuestBalanceSnapshot_tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate_key" ON "GuestBalanceSnapshot"("tenantId", "externalProvider", "externalDomain", "externalGuestId", "snapshotDate");
CREATE INDEX "GuestBalanceSnapshot_tenantId_snapshotDate_idx" ON "GuestBalanceSnapshot"("tenantId", "snapshotDate");
CREATE INDEX "GuestBalanceSnapshot_guestId_idx" ON "GuestBalanceSnapshot"("guestId");

CREATE UNIQUE INDEX "GuestBonusBalanceSnapshot_tenantId_externalProvider_externalDomain_externalGuestId_snapshotDate_key" ON "GuestBonusBalanceSnapshot"("tenantId", "externalProvider", "externalDomain", "externalGuestId", "snapshotDate");
CREATE INDEX "GuestBonusBalanceSnapshot_tenantId_snapshotDate_idx" ON "GuestBonusBalanceSnapshot"("tenantId", "snapshotDate");
CREATE INDEX "GuestBonusBalanceSnapshot_guestId_idx" ON "GuestBonusBalanceSnapshot"("guestId");

CREATE UNIQUE INDEX "GuestSession_tenantId_externalProvider_externalDomain_externalSessionId_key" ON "GuestSession"("tenantId", "externalProvider", "externalDomain", "externalSessionId");
CREATE INDEX "GuestSession_tenantId_startedAt_idx" ON "GuestSession"("tenantId", "startedAt");
CREATE INDEX "GuestSession_tenantId_externalGuestId_idx" ON "GuestSession"("tenantId", "externalGuestId");
CREATE INDEX "GuestSession_guestId_idx" ON "GuestSession"("guestId");
CREATE INDEX "GuestSession_storeId_idx" ON "GuestSession"("storeId");

CREATE UNIQUE INDEX "GuestLog_tenantId_externalProvider_externalDomain_sourceKey_key" ON "GuestLog"("tenantId", "externalProvider", "externalDomain", "sourceKey");
CREATE INDEX "GuestLog_tenantId_happenedAt_idx" ON "GuestLog"("tenantId", "happenedAt");
CREATE INDEX "GuestLog_tenantId_type_idx" ON "GuestLog"("tenantId", "type");
CREATE INDEX "GuestLog_tenantId_externalGuestId_idx" ON "GuestLog"("tenantId", "externalGuestId");
CREATE INDEX "GuestLog_guestId_idx" ON "GuestLog"("guestId");

CREATE UNIQUE INDEX "GuestTransaction_tenantId_externalProvider_externalDomain_externalTransactionId_key" ON "GuestTransaction"("tenantId", "externalProvider", "externalDomain", "externalTransactionId");
CREATE INDEX "GuestTransaction_tenantId_happenedAt_idx" ON "GuestTransaction"("tenantId", "happenedAt");
CREATE INDEX "GuestTransaction_tenantId_type_idx" ON "GuestTransaction"("tenantId", "type");
CREATE INDEX "GuestTransaction_tenantId_externalGuestId_idx" ON "GuestTransaction"("tenantId", "externalGuestId");
CREATE INDEX "GuestTransaction_guestId_idx" ON "GuestTransaction"("guestId");
CREATE INDEX "GuestTransaction_storeId_idx" ON "GuestTransaction"("storeId");

CREATE UNIQUE INDEX "GuestOperationLog_tenantId_externalProvider_externalDomain_sourceKey_key" ON "GuestOperationLog"("tenantId", "externalProvider", "externalDomain", "sourceKey");
CREATE INDEX "GuestOperationLog_tenantId_happenedAt_idx" ON "GuestOperationLog"("tenantId", "happenedAt");
CREATE INDEX "GuestOperationLog_tenantId_type_idx" ON "GuestOperationLog"("tenantId", "type");
CREATE INDEX "GuestOperationLog_storeId_idx" ON "GuestOperationLog"("storeId");

CREATE INDEX "GuestDataProfileRun_tenantId_startedAt_idx" ON "GuestDataProfileRun"("tenantId", "startedAt");
CREATE INDEX "GuestDataProfileRun_integrationSourceId_idx" ON "GuestDataProfileRun"("integrationSourceId");
CREATE INDEX "GuestDataProfileRun_status_idx" ON "GuestDataProfileRun"("status");

CREATE INDEX "SalesFact_tenantId_externalGuestId_idx" ON "SalesFact"("tenantId", "externalGuestId");
CREATE INDEX "SalesFact_guestId_idx" ON "SalesFact"("guestId");

ALTER TABLE "Guest" ADD CONSTRAINT "Guest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestGroup" ADD CONSTRAINT "GuestGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestBalanceSnapshot" ADD CONSTRAINT "GuestBalanceSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestBalanceSnapshot" ADD CONSTRAINT "GuestBalanceSnapshot_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestBonusBalanceSnapshot" ADD CONSTRAINT "GuestBonusBalanceSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestBonusBalanceSnapshot" ADD CONSTRAINT "GuestBonusBalanceSnapshot_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestLog" ADD CONSTRAINT "GuestLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestLog" ADD CONSTRAINT "GuestLog_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestTransaction" ADD CONSTRAINT "GuestTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestTransaction" ADD CONSTRAINT "GuestTransaction_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestTransaction" ADD CONSTRAINT "GuestTransaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestOperationLog" ADD CONSTRAINT "GuestOperationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestOperationLog" ADD CONSTRAINT "GuestOperationLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestDataProfileRun" ADD CONSTRAINT "GuestDataProfileRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GuestDataProfileRun" ADD CONSTRAINT "GuestDataProfileRun_integrationSourceId_fkey" FOREIGN KEY ("integrationSourceId") REFERENCES "IntegrationSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesFact" ADD CONSTRAINT "SalesFact_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

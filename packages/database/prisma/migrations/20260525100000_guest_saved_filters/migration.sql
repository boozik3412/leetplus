-- CreateTable
CREATE TABLE "GuestSavedFilter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "report" TEXT NOT NULL DEFAULT 'guest_report',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guest_saved_filter_report_idx" ON "GuestSavedFilter"("tenantId", "report", "createdAt");

-- CreateIndex
CREATE INDEX "guest_saved_filter_user_idx" ON "GuestSavedFilter"("createdByUserId");

-- AddForeignKey
ALTER TABLE "GuestSavedFilter" ADD CONSTRAINT "GuestSavedFilter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSavedFilter" ADD CONSTRAINT "GuestSavedFilter_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

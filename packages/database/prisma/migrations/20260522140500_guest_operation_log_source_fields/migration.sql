-- AlterTable
ALTER TABLE "GuestOperationLog" ADD COLUMN "operationName" TEXT;
ALTER TABLE "GuestOperationLog" ADD COLUMN "operationSource" TEXT;
ALTER TABLE "GuestOperationLog" ADD COLUMN "operationForm" TEXT;

-- CreateIndex
CREATE INDEX "GuestOperationLog_tenantId_operationSource_idx" ON "GuestOperationLog"("tenantId", "operationSource");

-- CreateIndex
CREATE INDEX "GuestOperationLog_tenantId_operationForm_idx" ON "GuestOperationLog"("tenantId", "operationForm");

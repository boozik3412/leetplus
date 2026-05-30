-- CreateTable
CREATE TABLE "StaffShiftRegulationAcknowledgement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "comment" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShiftRegulationAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_shift_regulation_ack_unique" ON "StaffShiftRegulationAcknowledgement"("regulationId", "userId", "version");

-- CreateIndex
CREATE INDEX "staff_shift_regulation_ack_user_idx" ON "StaffShiftRegulationAcknowledgement"("tenantId", "userId", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "staff_shift_regulation_ack_regulation_idx" ON "StaffShiftRegulationAcknowledgement"("tenantId", "regulationId", "version");

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationAcknowledgement" ADD CONSTRAINT "StaffShiftRegulationAcknowledgement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationAcknowledgement" ADD CONSTRAINT "StaffShiftRegulationAcknowledgement_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "StaffShiftRegulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffShiftRegulationAcknowledgement" ADD CONSTRAINT "StaffShiftRegulationAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

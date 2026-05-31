-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CLUB_ADMINISTRATOR',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "position" TEXT,
    "employmentType" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "hiredAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT,
    "externalUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_member_user_id_unique" ON "StaffMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_member_external_identity_unique" ON "StaffMember"("tenantId", "externalProvider", "externalDomain", "externalUserId");

-- CreateIndex
CREATE INDEX "staff_member_status_role_idx" ON "StaffMember"("tenantId", "status", "role");

-- CreateIndex
CREATE INDEX "staff_member_store_idx" ON "StaffMember"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "staff_member_created_by_idx" ON "StaffMember"("createdByUserId");

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

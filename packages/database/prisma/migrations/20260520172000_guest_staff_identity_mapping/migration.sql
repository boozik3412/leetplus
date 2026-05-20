-- CreateTable
CREATE TABLE "GuestStaffIdentityMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestStaffIdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_staff_identity_mapping_unique" ON "GuestStaffIdentityMapping"("tenantId", "externalProvider", "externalDomain", "externalUserId");

-- CreateIndex
CREATE INDEX "guest_staff_identity_mapping_tenant_idx" ON "GuestStaffIdentityMapping"("tenantId");

-- CreateIndex
CREATE INDEX "guest_staff_identity_mapping_guest_idx" ON "GuestStaffIdentityMapping"("guestId");

-- CreateIndex
CREATE INDEX "guest_staff_identity_mapping_user_idx" ON "GuestStaffIdentityMapping"("createdByUserId");

-- AddForeignKey
ALTER TABLE "GuestStaffIdentityMapping" ADD CONSTRAINT "GuestStaffIdentityMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestStaffIdentityMapping" ADD CONSTRAINT "GuestStaffIdentityMapping_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestStaffIdentityMapping" ADD CONSTRAINT "GuestStaffIdentityMapping_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

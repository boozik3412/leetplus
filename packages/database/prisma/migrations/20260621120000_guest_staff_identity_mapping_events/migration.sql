CREATE TABLE "GuestStaffIdentityMappingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mappingId" TEXT,
    "action" TEXT NOT NULL,
    "externalProvider" "IntegrationProvider",
    "externalDomain" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "previousGuestId" TEXT,
    "nextGuestId" TEXT,
    "note" TEXT,
    "updatedShifts" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestStaffIdentityMappingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guest_staff_identity_mapping_event_created_idx"
  ON "GuestStaffIdentityMappingEvent"("tenantId", "createdAt");

CREATE INDEX "guest_staff_identity_mapping_event_external_idx"
  ON "GuestStaffIdentityMappingEvent"("tenantId", "externalDomain", "externalUserId");

CREATE INDEX "guest_staff_identity_mapping_event_mapping_idx"
  ON "GuestStaffIdentityMappingEvent"("mappingId");

CREATE INDEX "guest_staff_identity_mapping_event_user_idx"
  ON "GuestStaffIdentityMappingEvent"("createdByUserId");

ALTER TABLE "GuestStaffIdentityMappingEvent"
  ADD CONSTRAINT "GuestStaffIdentityMappingEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuestStaffIdentityMappingEvent"
  ADD CONSTRAINT "GuestStaffIdentityMappingEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

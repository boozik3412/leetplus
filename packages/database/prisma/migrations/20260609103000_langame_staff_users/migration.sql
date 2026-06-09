CREATE TABLE "LangameStaffUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalProvider" "IntegrationProvider" NOT NULL DEFAULT 'LANGAME',
    "externalDomain" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "adminStatus" TEXT,
    "verified" BOOLEAN,
    "comment" TEXT,
    "registeredAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "phone" TEXT,
    "birthday" TIMESTAMP(3),
    "workSchedule" JSONB,
    "identityDocument" TEXT,
    "identityDocumentData" JSONB,
    "externalGuestId" TEXT,
    "workPoint" JSONB,
    "sourcePayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LangameStaffUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "langame_staff_user_external_identity_unique" ON "LangameStaffUser"("tenantId", "externalProvider", "externalDomain", "externalUserId");
CREATE INDEX "langame_staff_user_domain_idx" ON "LangameStaffUser"("tenantId", "externalDomain");
CREATE INDEX "langame_staff_user_external_user_idx" ON "LangameStaffUser"("tenantId", "externalUserId");

ALTER TABLE "LangameStaffUser" ADD CONSTRAINT "LangameStaffUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserRoleOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserRoleOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserRoleOverride_tenantId_role_key" ON "UserRoleOverride"("tenantId", "role");
CREATE INDEX "UserRoleOverride_tenantId_updatedAt_idx" ON "UserRoleOverride"("tenantId", "updatedAt");

ALTER TABLE "UserRoleOverride"
  ADD CONSTRAINT "UserRoleOverride_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

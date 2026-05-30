CREATE TABLE "UserAccessRole" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAccessRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAccessRole_tenantId_name_key" ON "UserAccessRole"("tenantId", "name");
CREATE INDEX "UserAccessRole_tenantId_createdAt_idx" ON "UserAccessRole"("tenantId", "createdAt");

ALTER TABLE "UserAccessRole"
  ADD CONSTRAINT "UserAccessRole_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "Tenant"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD COLUMN "customRoleId" TEXT;

CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_customRoleId_fkey"
  FOREIGN KEY ("customRoleId")
  REFERENCES "UserAccessRole"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

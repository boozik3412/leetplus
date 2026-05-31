CREATE TABLE "StaffAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "uploadedByUserId" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StaffAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_attachment_tenant_created_idx" ON "StaffAttachment"("tenantId", "createdAt");
CREATE INDEX "staff_attachment_uploaded_by_idx" ON "StaffAttachment"("uploadedByUserId");

ALTER TABLE "StaffAttachment"
  ADD CONSTRAINT "StaffAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAttachment"
  ADD CONSTRAINT "StaffAttachment_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

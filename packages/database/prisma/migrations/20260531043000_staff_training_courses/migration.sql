CREATE TABLE "StaffTrainingCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "roleScope" TEXT NOT NULL DEFAULT 'ALL_STAFF',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "dueDays" INTEGER,
    "steps" JSONB NOT NULL,
    "stepsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTrainingCourse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_training_course_status_role_idx" ON "StaffTrainingCourse"("tenantId", "status", "roleScope");
CREATE INDEX "staff_training_course_required_idx" ON "StaffTrainingCourse"("tenantId", "required");
CREATE INDEX "staff_training_course_created_idx" ON "StaffTrainingCourse"("tenantId", "createdAt");
CREATE INDEX "staff_training_course_store_idx" ON "StaffTrainingCourse"("storeId");
CREATE INDEX "staff_training_course_created_by_idx" ON "StaffTrainingCourse"("createdByUserId");

ALTER TABLE "StaffTrainingCourse"
ADD CONSTRAINT "StaffTrainingCourse_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTrainingCourse"
ADD CONSTRAINT "StaffTrainingCourse_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffTrainingCourse"
ADD CONSTRAINT "StaffTrainingCourse_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

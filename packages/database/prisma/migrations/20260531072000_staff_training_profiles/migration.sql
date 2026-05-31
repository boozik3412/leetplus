CREATE TABLE "StaffTrainingProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "certificateIssuedAt" TIMESTAMP(3),
    "certificateExpiresAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTrainingProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_training_progress_course_user_unique" ON "StaffTrainingProgress"("courseId", "userId");
CREATE INDEX "staff_training_progress_user_status_idx" ON "StaffTrainingProgress"("tenantId", "userId", "status");
CREATE INDEX "staff_training_progress_due_idx" ON "StaffTrainingProgress"("tenantId", "dueAt");
CREATE INDEX "staff_training_progress_course_idx" ON "StaffTrainingProgress"("courseId");
CREATE INDEX "staff_training_progress_updated_by_idx" ON "StaffTrainingProgress"("updatedByUserId");

ALTER TABLE "StaffTrainingProgress"
ADD CONSTRAINT "StaffTrainingProgress_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTrainingProgress"
ADD CONSTRAINT "StaffTrainingProgress_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "StaffTrainingCourse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTrainingProgress"
ADD CONSTRAINT "StaffTrainingProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffTrainingProgress"
ADD CONSTRAINT "StaffTrainingProgress_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

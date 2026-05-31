CREATE TABLE "StaffAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT,
    "createdByUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "roleScope" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "assessmentKind" TEXT NOT NULL DEFAULT 'TEST',
    "passThreshold" INTEGER NOT NULL DEFAULT 80,
    "retakeLimit" INTEGER,
    "expiresInDays" INTEGER,
    "timeLimitMinutes" INTEGER,
    "questions" JSONB NOT NULL,
    "questionsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffAssessmentResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FAILED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "answers" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAssessmentResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_assessment_status_role_idx" ON "StaffAssessment"("tenantId", "status", "roleScope");
CREATE INDEX "staff_assessment_kind_idx" ON "StaffAssessment"("tenantId", "assessmentKind");
CREATE INDEX "staff_assessment_created_idx" ON "StaffAssessment"("tenantId", "createdAt");
CREATE INDEX "staff_assessment_store_idx" ON "StaffAssessment"("storeId");
CREATE INDEX "staff_assessment_created_by_idx" ON "StaffAssessment"("createdByUserId");

CREATE INDEX "staff_assessment_result_user_idx" ON "StaffAssessmentResult"("tenantId", "assessmentId", "userId");
CREATE INDEX "staff_assessment_result_passed_idx" ON "StaffAssessmentResult"("tenantId", "passed", "submittedAt");
CREATE INDEX "staff_assessment_result_expires_idx" ON "StaffAssessmentResult"("tenantId", "expiresAt");
CREATE INDEX "staff_assessment_result_assessment_idx" ON "StaffAssessmentResult"("assessmentId");
CREATE INDEX "staff_assessment_result_user_only_idx" ON "StaffAssessmentResult"("userId");
CREATE INDEX "staff_assessment_result_reviewed_by_idx" ON "StaffAssessmentResult"("reviewedByUserId");

ALTER TABLE "StaffAssessment"
ADD CONSTRAINT "StaffAssessment_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAssessment"
ADD CONSTRAINT "StaffAssessment_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffAssessment"
ADD CONSTRAINT "StaffAssessment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffAssessmentResult"
ADD CONSTRAINT "StaffAssessmentResult_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAssessmentResult"
ADD CONSTRAINT "StaffAssessmentResult_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "StaffAssessment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAssessmentResult"
ADD CONSTRAINT "StaffAssessmentResult_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAssessmentResult"
ADD CONSTRAINT "StaffAssessmentResult_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffShiftRegulation"
ADD COLUMN "assessmentId" TEXT,
ADD COLUMN "requiresAssessmentRetake" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StaffShiftRegulationVersion"
ADD COLUMN "assessmentId" TEXT,
ADD COLUMN "requiresAssessmentRetake" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assessmentTitle" TEXT;

CREATE INDEX "staff_shift_regulation_assessment_idx" ON "StaffShiftRegulation"("assessmentId");

ALTER TABLE "StaffShiftRegulation"
ADD CONSTRAINT "StaffShiftRegulation_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "StaffAssessment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

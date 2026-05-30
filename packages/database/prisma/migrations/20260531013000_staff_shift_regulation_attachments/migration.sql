ALTER TABLE "StaffShiftRegulation"
ADD COLUMN "attachments" JSONB;

ALTER TABLE "StaffShiftRegulationVersion"
ADD COLUMN "attachments" JSONB;

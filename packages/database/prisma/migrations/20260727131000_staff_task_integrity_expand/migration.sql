-- Staff task integrity, EXPAND phase.
--
-- Same-tenant composite keys are added alongside existing globally keyed
-- foreign keys. NOT VALID deliberately tolerates legacy rows, while
-- PostgreSQL checks every new or changed row immediately.
--
-- The three legacy Store SET NULL keys are the only exception: each is
-- replaced under the same table lock by two safeguards. The composite key
-- enforces same-tenant writes; a temporary simple RESTRICT key preserves
-- global existence for legacy cross-tenant rows until reconciliation and
-- composite VALIDATE are complete. Leaving SET NULL beside RESTRICT could
-- turn a store-bound resource into a tenant-global resource.
--
-- The eleven remaining simple keys are also swapped in place without changing
-- their delete action. Their update action becomes RESTRICT so an older
-- ON UPDATE CASCADE trigger cannot bypass the composite immutable-key policy.
-- All simple replacements remain NOT VALID: the constraints that they replace
-- already proved global existence, and the fixed table locks prevent a gap.
--
-- PostgreSQL 15+ is required for column-list ON DELETE SET NULL. LeetPlus CI
-- and the supported production database use PostgreSQL 16.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Lock every participating child/parent table before the first FK is removed.
-- This closes the compatibility gap for concurrent N/N-1 writes and fixes the
-- lock order for this short metadata-only migration.
LOCK TABLE
  "Store",
  "User",
  "StaffTaskTemplate",
  "StaffTaskRecurringRule",
  "StaffTaskRecurringRuleRun",
  "StaffTask"
IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "StaffTaskTemplate"
  DROP CONSTRAINT "StaffTaskTemplate_storeId_fkey",
  DROP CONSTRAINT "StaffTaskTemplate_createdByUserId_fkey",
  ADD CONSTRAINT "StaffTaskTemplate_storeId_fkey"
    FOREIGN KEY ("storeId")
    REFERENCES "Store"("id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskTemplate_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskTemplate_tenantId_storeId_fkey"
    FOREIGN KEY ("tenantId", "storeId")
    REFERENCES "Store"("tenantId", "id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskTemplate_tenantId_createdByUserId_fkey"
    FOREIGN KEY ("tenantId", "createdByUserId")
    REFERENCES "User"("tenantId", "id")
    ON DELETE SET NULL ("createdByUserId")
    ON UPDATE RESTRICT
    NOT VALID;

ALTER TABLE "StaffTaskRecurringRule"
  DROP CONSTRAINT "StaffTaskRecurringRule_storeId_fkey",
  DROP CONSTRAINT "StaffTaskRecurringRule_templateId_fkey",
  DROP CONSTRAINT "StaffTaskRecurringRule_createdByUserId_fkey",
  DROP CONSTRAINT "StaffTaskRecurringRule_assignedToUserId_fkey",
  DROP CONSTRAINT "StaffTaskRecurringRule_lastCreatedTaskId_fkey",
  ADD CONSTRAINT "StaffTaskRecurringRule_storeId_fkey"
    FOREIGN KEY ("storeId")
    REFERENCES "Store"("id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_templateId_fkey"
    FOREIGN KEY ("templateId")
    REFERENCES "StaffTaskTemplate"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_lastCreatedTaskId_fkey"
    FOREIGN KEY ("lastCreatedTaskId")
    REFERENCES "StaffTask"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_tenantId_templateId_fkey"
    FOREIGN KEY ("tenantId", "templateId")
    REFERENCES "StaffTaskTemplate"("tenantId", "id")
    ON DELETE SET NULL ("templateId")
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_tenantId_storeId_fkey"
    FOREIGN KEY ("tenantId", "storeId")
    REFERENCES "Store"("tenantId", "id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_tenantId_createdByUserId_fkey"
    FOREIGN KEY ("tenantId", "createdByUserId")
    REFERENCES "User"("tenantId", "id")
    ON DELETE SET NULL ("createdByUserId")
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_tenantId_assignedToUserId_fkey"
    FOREIGN KEY ("tenantId", "assignedToUserId")
    REFERENCES "User"("tenantId", "id")
    ON DELETE SET NULL ("assignedToUserId")
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRule_tenantId_lastCreatedTaskId_fkey"
    FOREIGN KEY ("tenantId", "lastCreatedTaskId")
    REFERENCES "StaffTask"("tenantId", "id")
    ON DELETE SET NULL ("lastCreatedTaskId")
    ON UPDATE RESTRICT
    NOT VALID;

ALTER TABLE "StaffTaskRecurringRuleRun"
  DROP CONSTRAINT "StaffTaskRecurringRuleRun_ruleId_fkey",
  DROP CONSTRAINT "StaffTaskRecurringRuleRun_createdTaskId_fkey",
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_ruleId_fkey"
    FOREIGN KEY ("ruleId")
    REFERENCES "StaffTaskRecurringRule"("id")
    ON DELETE CASCADE
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_createdTaskId_fkey"
    FOREIGN KEY ("createdTaskId")
    REFERENCES "StaffTask"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_tenantId_ruleId_fkey"
    FOREIGN KEY ("tenantId", "ruleId")
    REFERENCES "StaffTaskRecurringRule"("tenantId", "id")
    ON DELETE CASCADE
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTaskRecurringRuleRun_tenantId_createdTaskId_fkey"
    FOREIGN KEY ("tenantId", "createdTaskId")
    REFERENCES "StaffTask"("tenantId", "id")
    ON DELETE SET NULL ("createdTaskId")
    ON UPDATE RESTRICT
    NOT VALID;

ALTER TABLE "StaffTask"
  DROP CONSTRAINT "StaffTask_storeId_fkey",
  DROP CONSTRAINT "StaffTask_sourceTemplateId_fkey",
  DROP CONSTRAINT "StaffTask_sourceRecurringRuleId_fkey",
  DROP CONSTRAINT "StaffTask_createdByUserId_fkey",
  DROP CONSTRAINT "StaffTask_assignedToUserId_fkey",
  ADD CONSTRAINT "StaffTask_storeId_fkey"
    FOREIGN KEY ("storeId")
    REFERENCES "Store"("id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_sourceTemplateId_fkey"
    FOREIGN KEY ("sourceTemplateId")
    REFERENCES "StaffTaskTemplate"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_sourceRecurringRuleId_fkey"
    FOREIGN KEY ("sourceRecurringRuleId")
    REFERENCES "StaffTaskRecurringRule"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_assignedToUserId_fkey"
    FOREIGN KEY ("assignedToUserId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_tenantId_storeId_fkey"
    FOREIGN KEY ("tenantId", "storeId")
    REFERENCES "Store"("tenantId", "id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_tenantId_sourceTemplateId_fkey"
    FOREIGN KEY ("tenantId", "sourceTemplateId")
    REFERENCES "StaffTaskTemplate"("tenantId", "id")
    ON DELETE SET NULL ("sourceTemplateId")
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_tenantId_sourceRecurringRuleId_fkey"
    FOREIGN KEY ("tenantId", "sourceRecurringRuleId")
    REFERENCES "StaffTaskRecurringRule"("tenantId", "id")
    ON DELETE SET NULL ("sourceRecurringRuleId")
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_tenantId_createdByUserId_fkey"
    FOREIGN KEY ("tenantId", "createdByUserId")
    REFERENCES "User"("tenantId", "id")
    ON DELETE SET NULL ("createdByUserId")
    ON UPDATE RESTRICT
    NOT VALID,
  ADD CONSTRAINT "StaffTask_tenantId_assignedToUserId_fkey"
    FOREIGN KEY ("tenantId", "assignedToUserId")
    REFERENCES "User"("tenantId", "id")
    ON DELETE SET NULL ("assignedToUserId")
    ON UPDATE RESTRICT
    NOT VALID;

COMMIT;

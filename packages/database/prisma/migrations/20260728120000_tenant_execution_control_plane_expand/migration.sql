-- Shared multi-tenant execution control plane, EXPAND phase.
--
-- Existing tenants keep their current session behaviour by being classified
-- as INTERNAL / ACTIVE. Every tenant created after this migration starts in
-- PROVISIONING and therefore cannot receive an admitted product session until
-- an audited control-plane operation advances it.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

LOCK TABLE "Tenant", "User", "PlatformAdminAuditEvent" IN ACCESS EXCLUSIVE MODE;

CREATE TYPE "TenantCustomerStage" AS ENUM (
  'INTERNAL',
  'PILOT',
  'BETA',
  'LIVE'
);

CREATE TYPE "TenantOnboardingStatus" AS ENUM (
  'PROVISIONING',
  'OWNER_INVITED',
  'ONBOARDING',
  'READY',
  'ACTIVE',
  'OFFBOARDING'
);

CREATE TYPE "TenantModule" AS ENUM (
  'GAMIFICATION',
  'ASSORTMENT',
  'STAFF',
  'COMMUNICATIONS',
  'USERS_ROLES',
  'INTEGRATIONS'
);

ALTER TABLE "Tenant"
  ADD COLUMN "customerStage" "TenantCustomerStage" NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "onboardingStatus" "TenantOnboardingStatus" NOT NULL DEFAULT 'PROVISIONING',
  ADD COLUMN "cohortKey" TEXT,
  ADD COLUMN "supportOwnerUserId" TEXT,
  ADD COLUMN "trialStartsAt" TIMESTAMPTZ(3),
  ADD COLUMN "trialEndsAt" TIMESTAMPTZ(3),
  ADD COLUMN "entitlementProfileRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PlatformAdminAuditEvent"
  ADD COLUMN "requestId" TEXT;

-- Legacy create paths must not be able to create a runnable tenant merely by
-- omitting lifecycle fields. Existing rows keep their persisted status.
ALTER TABLE "Tenant"
ALTER COLUMN "status" SET DEFAULT 'SUSPENDED';

-- No future/raw User create may silently receive the maximum tenant role.
-- Every account-creation and owner-transfer path must choose a role explicitly.
ALTER TABLE "User"
ALTER COLUMN "role" DROP DEFAULT;

-- This migration is an expand, not a cutover. Preserve access for every
-- already-known tenant at the session boundary. Module enforcement remains
-- fail-closed until each tenant receives an explicit revisioned profile.
UPDATE "Tenant"
SET "onboardingStatus" = 'ACTIVE'
WHERE "status" = 'ACTIVE';

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_entitlement_profile_revision_check"
    CHECK ("entitlementProfileRevision" >= 0),
  ADD CONSTRAINT "Tenant_cohort_key_check"
    CHECK ("cohortKey" IS NULL OR length(btrim("cohortKey")) > 0),
  ADD CONSTRAINT "Tenant_trial_window_order_check"
    CHECK (
      (
        "trialStartsAt" IS NULL
        AND "trialEndsAt" IS NULL
      )
      OR (
        "trialStartsAt" IS NOT NULL
        AND "trialEndsAt" IS NOT NULL
        AND "trialStartsAt" < "trialEndsAt"
      )
    ),
  ADD CONSTRAINT "Tenant_external_stage_trial_check"
    CHECK (
      "customerStage" NOT IN ('PILOT', 'BETA')
      OR (
        "trialStartsAt" IS NOT NULL
        AND "trialEndsAt" IS NOT NULL
        AND "trialStartsAt" < "trialEndsAt"
      )
    );

CREATE TABLE "TenantModuleEntitlement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "module" "TenantModule" NOT NULL,
  "readEnabled" BOOLEAN NOT NULL DEFAULT false,
  "writeEnabled" BOOLEAN NOT NULL DEFAULT false,
  "outboundEnabled" BOOLEAN NOT NULL DEFAULT false,
  "validFrom" TIMESTAMPTZ(3),
  "validUntil" TIMESTAMPTZ(3),
  "profileRevision" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenantModuleEntitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantModuleEntitlement_profile_revision_check"
    CHECK ("profileRevision" > 0),
  CONSTRAINT "TenantModuleEntitlement_reason_check"
    CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "TenantModuleEntitlement_access_hierarchy_check"
    CHECK (
      (NOT "writeEnabled" OR "readEnabled")
      AND (NOT "outboundEnabled" OR "writeEnabled")
    ),
  CONSTRAINT "TenantModuleEntitlement_validity_check"
    CHECK (
      "validFrom" IS NULL
      OR "validUntil" IS NULL
      OR "validFrom" < "validUntil"
  )
);

-- profileRevision is the revision of the complete entitlement set, not an
-- independent per-module counter. A later control-plane transaction must
-- replace/upsert all profile rows before advancing
-- Tenant.entitlementProfileRevision.
CREATE UNIQUE INDEX "TenantModuleEntitlement_tenantId_module_key"
ON "TenantModuleEntitlement"("tenantId", "module");

CREATE INDEX "TenantModuleEntitlement_tenantId_validUntil_idx"
ON "TenantModuleEntitlement"("tenantId", "validUntil");

-- Trial/entitlement expiry jobs scan only finite windows. Partial indexes keep
-- those cross-tenant sweeps small while tenant lookups use the composite keys.
CREATE INDEX "Tenant_trialEndsAt_active_idx"
ON "Tenant"("trialEndsAt")
WHERE "trialEndsAt" IS NOT NULL;

CREATE INDEX "TenantModuleEntitlement_validUntil_active_idx"
ON "TenantModuleEntitlement"("validUntil")
WHERE "validUntil" IS NOT NULL;

CREATE INDEX "Tenant_status_onboardingStatus_customerStage_idx"
ON "Tenant"("status", "onboardingStatus", "customerStage");

CREATE INDEX "Tenant_supportOwnerUserId_idx"
ON "Tenant"("supportOwnerUserId");

ALTER TABLE "PlatformAdminAuditEvent"
ADD CONSTRAINT "PlatformAdminAuditEvent_requestId_check"
CHECK (
  "requestId" IS NULL
  OR (
    length(btrim("requestId")) > 0
    AND length("requestId") <= 200
  )
);

CREATE UNIQUE INDEX "platform_admin_audit_tenant_action_request_uidx"
ON "PlatformAdminAuditEvent"("tenantId", "action", "requestId");

-- PostgreSQL treats NULL values as distinct in a normal unique index. Keep
-- global control-plane operations idempotent as well, without coalescing a
-- real tenant identifier into a magic sentinel.
CREATE UNIQUE INDEX "platform_admin_audit_global_action_request_uidx"
ON "PlatformAdminAuditEvent"("action", "requestId")
WHERE "tenantId" IS NULL AND "requestId" IS NOT NULL;

ALTER TABLE "TenantModuleEntitlement"
ADD CONSTRAINT "TenantModuleEntitlement_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_supportOwnerUserId_fkey"
FOREIGN KEY ("supportOwnerUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

COMMIT;

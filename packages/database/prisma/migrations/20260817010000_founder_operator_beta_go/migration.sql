-- Beta-only single-founder admission authority.
-- This successor deliberately avoids the offline CURRENT198-CURRENT202 key
-- ceremony while preserving exact tenant, release, trial and audit binding.

CREATE TABLE public."FounderOperatorBetaGo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "contractVersion" VARCHAR(48) NOT NULL
    DEFAULT 'FOUNDER_OPERATOR_BETA_GO_V1',
  "decision" VARCHAR(8) NOT NULL DEFAULT 'GO',
  "releaseSha" CHAR(40) NOT NULL,
  "environment" VARCHAR(64) NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "reservationSubjectId" TEXT NOT NULL,
  "expectedClaimRevision" INTEGER NOT NULL,
  "shellEvidenceDigest" CHAR(64) NOT NULL,
  "expectedEntitlementProfileRevision" INTEGER NOT NULL,
  "expectedExecutionRevision" INTEGER NOT NULL,
  "trialPolicyVersion" VARCHAR(64) NOT NULL
    DEFAULT 'FOUNDER_OPERATOR_BETA_TRIAL_V1',
  "trialDurationSeconds" INTEGER NOT NULL,
  "approvedByUserId" TEXT NOT NULL,
  "rollbackOwnerUserId" TEXT NOT NULL,
  "singleFounderRiskAccepted" BOOLEAN NOT NULL DEFAULT TRUE,
  "stopConditions" JSONB NOT NULL,
  "stopConditionsDigest" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadDigest" CHAR(64) NOT NULL,
  "approvedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "stateRevision" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revocationReasonDigest" CHAR(64),
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FounderOperatorBetaGo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FounderOperatorBetaGo_id_check" CHECK (
    "id" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "tenantId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "requestId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "workflowLocator" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "reservationSubjectId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "approvedByUserId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "rollbackOwnerUserId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "FounderOperatorBetaGo_contract_check" CHECK (
    "contractVersion" = 'FOUNDER_OPERATOR_BETA_GO_V1'
    AND "decision" = 'GO'
    AND "trialPolicyVersion" = 'FOUNDER_OPERATOR_BETA_TRIAL_V1'
    AND "singleFounderRiskAccepted" = TRUE
  ),
  CONSTRAINT "FounderOperatorBetaGo_digest_check" CHECK (
    "requestDigest" ~ '^[0-9a-f]{64}$'
    AND "shellEvidenceDigest" ~ '^[0-9a-f]{64}$'
    AND "stopConditionsDigest" ~ '^[0-9a-f]{64}$'
    AND "payloadDigest" ~ '^[0-9a-f]{64}$'
    AND (
      "revocationReasonDigest" IS NULL
      OR "revocationReasonDigest" ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT "FounderOperatorBetaGo_release_check" CHECK (
    "releaseSha" ~ '^[0-9a-f]{40}$'
    AND "environment" ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ),
  CONSTRAINT "FounderOperatorBetaGo_revision_check" CHECK (
    "expectedClaimRevision" = 1
    AND "expectedEntitlementProfileRevision" >= 1
    AND "expectedExecutionRevision" >= 0
    AND "trialDurationSeconds" BETWEEN 3600 AND 7776000
  ),
  CONSTRAINT "FounderOperatorBetaGo_window_check" CHECK (
    "approvedAt" < "validUntil"
    AND "validUntil" <= "approvedAt" + INTERVAL '24 hours'
    AND "createdAt" <= "approvedAt"
  ),
  CONSTRAINT "FounderOperatorBetaGo_stop_conditions_check" CHECK (
    pg_catalog.jsonb_typeof("stopConditions") = 'array'
    AND pg_catalog.jsonb_array_length("stopConditions") = 5
  ),
  CONSTRAINT "FounderOperatorBetaGo_payload_check" CHECK (
    pg_catalog.jsonb_typeof("payload") = 'object'
    AND "payload" ->> 'contractVersion' = "contractVersion"
    AND "payload" ->> 'decision' = "decision"
    AND "payload" ->> 'tenantId' = "tenantId"
    AND "payload" ->> 'requestId' = "requestId"
    AND "payload" ->> 'releaseSha' = "releaseSha"
    AND "payload" ->> 'environment' = "environment"
    AND "payload" ->> 'workflowLocator' = "workflowLocator"
    AND "payload" ->> 'shellEvidenceDigest' = "shellEvidenceDigest"
    AND "payload" ->> 'trialPolicyVersion' = "trialPolicyVersion"
    AND ("payload" ->> 'trialDurationSeconds')::INTEGER =
      "trialDurationSeconds"
    AND "payload" ->> 'approvedByUserId' = "approvedByUserId"
    AND "payload" ->> 'rollbackOwnerUserId' = "rollbackOwnerUserId"
    AND ("payload" ->> 'singleFounderRiskAccepted')::BOOLEAN = TRUE
    AND "payload" -> 'stopConditions' = "stopConditions"
  ),
  CONSTRAINT "FounderOperatorBetaGo_state_check" CHECK (
    (
      "stateRevision" = 1
      AND "revokedAt" IS NULL
      AND "revocationReasonDigest" IS NULL
      AND "consumedAt" IS NULL
    )
    OR (
      "stateRevision" = 2
      AND "revokedAt" IS NULL
      AND "revocationReasonDigest" IS NULL
      AND "consumedAt" IS NOT NULL
      AND "consumedAt" >= "approvedAt"
    )
    OR (
      "stateRevision" = 3
      AND "revokedAt" IS NOT NULL
      AND "revokedAt" >= "approvedAt"
      AND "revocationReasonDigest" IS NOT NULL
      AND "consumedAt" IS NULL
    )
  )
);

CREATE UNIQUE INDEX "founder_operator_beta_go_request_uidx"
  ON public."FounderOperatorBetaGo" ("tenantId", "requestId");

CREATE UNIQUE INDEX "founder_operator_beta_go_locator_uidx"
  ON public."FounderOperatorBetaGo" ("workflowLocator");

CREATE UNIQUE INDEX "founder_operator_beta_go_payload_digest_uidx"
  ON public."FounderOperatorBetaGo" ("payloadDigest");

CREATE UNIQUE INDEX "founder_operator_beta_go_active_tenant_uidx"
  ON public."FounderOperatorBetaGo" ("tenantId")
  WHERE "stateRevision" = 1;

CREATE INDEX "founder_operator_beta_go_tenant_state_idx"
  ON public."FounderOperatorBetaGo" (
    "tenantId",
    "stateRevision",
    "validUntil"
  );

CREATE INDEX "founder_operator_beta_go_release_valid_idx"
  ON public."FounderOperatorBetaGo" (
    "releaseSha",
    "environment",
    "validUntil"
  );

CREATE INDEX "founder_operator_beta_go_approver_idx"
  ON public."FounderOperatorBetaGo" ("approvedByUserId", "approvedAt");

CREATE INDEX "founder_operator_beta_go_rollback_idx"
  ON public."FounderOperatorBetaGo" ("rollbackOwnerUserId", "approvedAt");

ALTER TABLE public."FounderOperatorBetaGo"
  ADD CONSTRAINT "FounderOperatorBetaGo_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."FounderOperatorBetaGo"
  ADD CONSTRAINT "FounderOperatorBetaGo_approved_by_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES public."User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."FounderOperatorBetaGo"
  ADD CONSTRAINT "FounderOperatorBetaGo_rollback_owner_fkey"
  FOREIGN KEY ("rollbackOwnerUserId") REFERENCES public."User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION public."founder_operator_beta_go_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Founder operator beta GO is append-only'
      USING ERRCODE = '42501';
  END IF;

  IF (
       pg_catalog.to_jsonb(NEW)
       - 'stateRevision'
       - 'revokedAt'
       - 'revocationReasonDigest'
       - 'consumedAt'
     ) IS DISTINCT FROM (
       pg_catalog.to_jsonb(OLD)
       - 'stateRevision'
       - 'revokedAt'
       - 'revocationReasonDigest'
       - 'consumedAt'
     )
  THEN
    RAISE EXCEPTION 'Founder operator beta GO authority is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."consumedAt" IS NOT NULL
     OR NEW."stateRevision" <> 3
     OR NEW."consumedAt" IS NOT NULL
     OR NEW."revokedAt" IS NULL
     OR NEW."revocationReasonDigest" IS NULL
  THEN
    RAISE EXCEPTION 'Founder operator beta GO transition is invalid'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "FounderOperatorBetaGo_guard_trigger"
BEFORE UPDATE OR DELETE ON public."FounderOperatorBetaGo"
FOR EACH ROW EXECUTE FUNCTION public."founder_operator_beta_go_guard_v1"();

COMMENT ON TABLE public."FounderOperatorBetaGo" IS
  'Single-founder, beta-only, one-time tenant admission authority. It is independent of the deferred offline platform-key ceremony.';

COMMENT ON FUNCTION public."founder_operator_beta_go_guard_v1"() IS
  'Foundation guard allows only revoke. Consumption remains DB-denied until the v2 atomic activation command and same-transaction proof are installed.';

REVOKE ALL ON FUNCTION public."founder_operator_beta_go_guard_v1"()
FROM PUBLIC;

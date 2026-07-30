BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Bounded persisted-GO foundation. This migration deliberately does not
-- consume a decision and does not mutate Tenant lifecycle/trial state,
-- IdentityMailOutbox, UserInvite, or any provider-visible state.
CREATE TYPE public."SharedBetaReleaseGateCode" AS ENUM (
  'MODULE_POLICY_ENFORCED',
  'EMAIL_INVITE_WORKFLOW_VERIFIED',
  'POSTGRESQL_RELEASE_REHEARSAL_VERIFIED'
);

CREATE TABLE public."ReleaseGateAttestation" (
  "id" TEXT NOT NULL,
  "gateCode" public."SharedBetaReleaseGateCode" NOT NULL,
  "contractVersion" VARCHAR(40) NOT NULL
    DEFAULT 'RELEASE_GATE_ATTESTATION_V1',
  "releaseSha" CHAR(40) NOT NULL,
  "environment" VARCHAR(64) NOT NULL,
  "artifactDigest" CHAR(64) NOT NULL,
  "schemaHead" VARCHAR(128) NOT NULL,
  "migrationCount" INTEGER NOT NULL,
  "policyManifestDigest" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadDigest" CHAR(64) NOT NULL,
  "signatureAlgorithm" VARCHAR(16) NOT NULL DEFAULT 'Ed25519',
  "signingKeyId" VARCHAR(64) NOT NULL,
  "provenanceKeyVersion" VARCHAR(64) NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "signature" BYTEA NOT NULL,
  "passedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "stateRevision" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revocationReasonDigest" CHAR(64),
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReleaseGateAttestation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReleaseGateAttestation_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "ReleaseGateAttestation_release_check" CHECK (
    "contractVersion" = 'RELEASE_GATE_ATTESTATION_V1'
    AND
    ("releaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
    AND "environment" =
      pg_catalog.lower(pg_catalog.btrim("environment") COLLATE "C")
    AND ("environment" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{0,63}$'
    AND ("artifactDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("schemaHead" COLLATE "C") ~
      '^[0-9]{14}_[a-z0-9_]{1,100}$'
    AND "migrationCount" >= 172
    AND ("policyManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "ReleaseGateAttestation_provenance_check" CHECK (
    ("payloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "signatureAlgorithm" = 'Ed25519'
    AND "signingKeyId" =
      pg_catalog.lower(pg_catalog.btrim("signingKeyId") COLLATE "C")
    AND ("signingKeyId" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND "provenanceKeyVersion" =
      pg_catalog.lower(
        pg_catalog.btrim("provenanceKeyVersion") COLLATE "C"
      )
    AND ("provenanceKeyVersion" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND pg_catalog.octet_length("signature") = 64
  ),
  CONSTRAINT "ReleaseGateAttestation_payload_check" CHECK (
    pg_catalog.jsonb_typeof("payload") = 'object'
    AND "payload" = pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'kind', 'LEETPLUS_SHARED_BETA_RELEASE_GATE_ATTESTATION',
      'purpose', 'SHARED_BETA_TENANT_ADMISSION',
      'profile', 'SHARED_BETA_ADMISSION_V1',
      'contractVersion', "contractVersion",
      'gateCode', "gateCode"::TEXT,
      'releaseSha', "releaseSha",
      'environment', "environment",
      'artifactDigest', "artifactDigest",
      'schemaHead', "schemaHead",
      'migrationCount', "migrationCount",
      'policyManifestDigest', "policyManifestDigest",
      'signingKeyId', "signingKeyId",
      'provenanceKeyVersion', "provenanceKeyVersion",
      'publicKeyFingerprint', "publicKeyFingerprint",
      'passedAtEpochMs',
        (
          EXTRACT(EPOCH FROM "passedAt") * 1000
        )::BIGINT,
      'validUntilEpochMs',
        (
          EXTRACT(EPOCH FROM "validUntil") * 1000
        )::BIGINT
    )
  ),
  CONSTRAINT "ReleaseGateAttestation_timeline_check" CHECK (
    "passedAt" <= "createdAt" + INTERVAL '5 minutes'
    AND "validUntil" > "passedAt"
    AND "validUntil" <= "passedAt" + INTERVAL '7 days'
  ),
  CONSTRAINT "ReleaseGateAttestation_state_check" CHECK (
    "stateRevision" IN (1, 2)
    AND (
      (
        "stateRevision" = 1
        AND "revokedAt" IS NULL
        AND "revocationReasonDigest" IS NULL
      )
      OR (
        "stateRevision" = 2
        AND "revokedAt" IS NOT NULL
        AND "revokedAt" >= "createdAt"
        AND ("revocationReasonDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
      )
    )
  )
);

CREATE UNIQUE INDEX "release_gate_attestation_id_code_key"
  ON public."ReleaseGateAttestation" ("id", "gateCode");

CREATE UNIQUE INDEX "release_gate_attestation_payload_digest_key"
  ON public."ReleaseGateAttestation" ("payloadDigest");

CREATE INDEX "release_gate_attestation_release_env_code_valid_idx"
  ON public."ReleaseGateAttestation" (
    "releaseSha",
    "environment",
    "gateCode",
    "validUntil"
  );

CREATE TABLE public."TenantAdmissionDecision" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "decision" VARCHAR(8) NOT NULL DEFAULT 'GO',
  "requestId" TEXT NOT NULL,
  "requestDigest" CHAR(64) NOT NULL,
  "workflowLocator" TEXT NOT NULL,
  "reservationSubjectId" TEXT NOT NULL,
  "expectedClaimRevision" INTEGER NOT NULL,
  "shellEvidenceDigest" CHAR(64) NOT NULL,
  "releaseSha" CHAR(40) NOT NULL,
  "environment" VARCHAR(64) NOT NULL,
  "artifactDigest" CHAR(64) NOT NULL,
  "schemaHead" VARCHAR(128) NOT NULL,
  "migrationCount" INTEGER NOT NULL,
  "policyManifestDigest" CHAR(64) NOT NULL,
  "databaseIdentityDigest" CHAR(64) NOT NULL,
  "expectedEntitlementProfileRevision" INTEGER NOT NULL,
  "expectedExecutionRevision" INTEGER NOT NULL,
  "profileDigest" CHAR(64) NOT NULL,
  "gateSetVersion" VARCHAR(32) NOT NULL
    DEFAULT 'SHARED_BETA_GATE_SET_V1',
  "gateSetDigest" CHAR(64) NOT NULL,
  "approvedByUserId" TEXT NOT NULL,
  "approvalReferenceDigest" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadDigest" CHAR(64) NOT NULL,
  "signatureAlgorithm" VARCHAR(16) NOT NULL DEFAULT 'Ed25519',
  "signingKeyId" VARCHAR(64) NOT NULL,
  "publicKeyFingerprint" CHAR(64) NOT NULL,
  "signature" BYTEA NOT NULL,
  "approvedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "stateRevision" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revocationReasonDigest" CHAR(64),
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantAdmissionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantAdmissionDecision_id_check" CHECK (
    "id" = pg_catalog.lower(pg_catalog.btrim("id") COLLATE "C")
    AND ("id" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "TenantAdmissionDecision_tenant_check" CHECK (
    "tenantId" = pg_catalog.lower(
      pg_catalog.btrim("tenantId") COLLATE "C"
    )
    AND ("tenantId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "TenantAdmissionDecision_request_identity_check" CHECK (
    "requestId" = pg_catalog.lower(
      pg_catalog.btrim("requestId") COLLATE "C"
    )
    AND ("requestId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND ("requestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "workflowLocator" = pg_catalog.lower(
      pg_catalog.btrim("workflowLocator") COLLATE "C"
    )
    AND ("workflowLocator" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "reservationSubjectId" = pg_catalog.lower(
      pg_catalog.btrim("reservationSubjectId") COLLATE "C"
    )
    AND ("reservationSubjectId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND "expectedClaimRevision" >= 1
    AND ("shellEvidenceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "TenantAdmissionDecision_kind_check" CHECK (
    "decision" = 'GO'
    AND "gateSetVersion" = 'SHARED_BETA_GATE_SET_V1'
  ),
  CONSTRAINT "TenantAdmissionDecision_release_check" CHECK (
    ("releaseSha" COLLATE "C") ~ '^[0-9a-f]{40}$'
    AND "environment" =
      pg_catalog.lower(pg_catalog.btrim("environment") COLLATE "C")
    AND ("environment" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{0,63}$'
    AND ("artifactDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("schemaHead" COLLATE "C") ~
      '^[0-9]{14}_[a-z0-9_]{1,100}$'
    AND "migrationCount" >= 172
    AND ("policyManifestDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("databaseIdentityDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "TenantAdmissionDecision_revision_check" CHECK (
    "expectedEntitlementProfileRevision" >= 1
    AND "expectedExecutionRevision" >= 0
  ),
  CONSTRAINT "TenantAdmissionDecision_digest_check" CHECK (
    ("profileDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("gateSetDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND ("approvalReferenceDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "TenantAdmissionDecision_provenance_check" CHECK (
    pg_catalog.jsonb_typeof("payload") = 'object'
    AND ("payloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND "signatureAlgorithm" = 'Ed25519'
    AND "signingKeyId" =
      pg_catalog.lower(pg_catalog.btrim("signingKeyId") COLLATE "C")
    AND ("signingKeyId" COLLATE "C") ~
      '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND ("publicKeyFingerprint" COLLATE "C") ~ '^[0-9a-f]{64}$'
    AND pg_catalog.octet_length("signature") = 64
  ),
  CONSTRAINT "TenantAdmissionDecision_payload_check" CHECK (
    "payload" = pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'kind', 'LEETPLUS_SHARED_BETA_TENANT_ADMISSION_DECISION',
      'purpose', 'SHARED_BETA_TENANT_ADMISSION',
      'profile', 'SHARED_BETA_ADMISSION_V1',
      'contractVersion', 'TENANT_ADMISSION_DECISION_V1',
      'decisionId', "id",
      'tenantId', "tenantId",
      'decision', "decision",
      'requestId', "requestId",
      'requestDigest', "requestDigest",
      'workflowLocator', "workflowLocator",
      'reservationSubjectId', "reservationSubjectId",
      'expectedClaimRevision', "expectedClaimRevision",
      'shellEvidenceDigest', "shellEvidenceDigest",
      'releaseSha', "releaseSha",
      'environment', "environment",
      'artifactDigest', "artifactDigest",
      'schemaHead', "schemaHead",
      'migrationCount', "migrationCount",
      'policyManifestDigest', "policyManifestDigest",
      'databaseIdentityDigest', "databaseIdentityDigest",
      'expectedEntitlementProfileRevision',
        "expectedEntitlementProfileRevision",
      'expectedExecutionRevision', "expectedExecutionRevision",
      'profileDigest', "profileDigest",
      'gateSetVersion', "gateSetVersion",
      'gateSetDigest', "gateSetDigest",
      'approvedByUserId', "approvedByUserId",
      'approvalReferenceDigest', "approvalReferenceDigest",
      'signingKeyId', "signingKeyId",
      'publicKeyFingerprint', "publicKeyFingerprint",
      'approvedAtEpochMs',
        (
          EXTRACT(EPOCH FROM "approvedAt") * 1000
        )::BIGINT,
      'validUntilEpochMs',
        (
          EXTRACT(EPOCH FROM "validUntil") * 1000
        )::BIGINT
    )
  ),
  CONSTRAINT "TenantAdmissionDecision_approver_check" CHECK (
    "approvedByUserId" = pg_catalog.lower(
      pg_catalog.btrim("approvedByUserId") COLLATE "C"
    )
    AND ("approvedByUserId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "TenantAdmissionDecision_timeline_check" CHECK (
    "approvedAt" <= "createdAt" + INTERVAL '5 minutes'
    AND "validUntil" > "approvedAt"
    AND "validUntil" <= "approvedAt" + INTERVAL '24 hours'
  ),
  CONSTRAINT "TenantAdmissionDecision_state_check" CHECK (
    "stateRevision" IN (1, 2)
    AND (
      (
        "stateRevision" = 1
        AND "revokedAt" IS NULL
        AND "revocationReasonDigest" IS NULL
        AND "consumedAt" IS NULL
      )
      OR (
        "stateRevision" = 2
        AND "revokedAt" IS NOT NULL
        AND "revokedAt" >= "createdAt"
        AND ("revocationReasonDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
        AND "consumedAt" IS NULL
      )
    )
  )
);

CREATE UNIQUE INDEX "tenant_admission_decision_id_tenant_key"
  ON public."TenantAdmissionDecision" ("id", "tenantId");

CREATE UNIQUE INDEX "tenant_admission_decision_request_key"
  ON public."TenantAdmissionDecision" ("tenantId", "requestId");

CREATE UNIQUE INDEX "tenant_admission_decision_payload_digest_key"
  ON public."TenantAdmissionDecision" ("payloadDigest");

-- One explicit revoke is required before a second GO can be created. Expiry
-- alone never silently replaces an authority decision.
CREATE UNIQUE INDEX "tenant_admission_decision_one_unrevoked_uidx"
  ON public."TenantAdmissionDecision" ("tenantId")
  WHERE "revokedAt" IS NULL;

CREATE INDEX "tenant_admission_decision_tenant_valid_idx"
  ON public."TenantAdmissionDecision" ("tenantId", "validUntil");

CREATE INDEX "tenant_admission_decision_approver_idx"
  ON public."TenantAdmissionDecision" ("approvedByUserId", "approvedAt");

CREATE TABLE public."TenantAdmissionDecisionGate" (
  "decisionId" TEXT NOT NULL,
  "gateCode" public."SharedBetaReleaseGateCode" NOT NULL,
  "attestationId" TEXT NOT NULL,
  "boundAttestationRevision" INTEGER NOT NULL,
  "boundPayloadDigest" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantAdmissionDecisionGate_pkey"
    PRIMARY KEY ("decisionId", "gateCode"),
  CONSTRAINT "TenantAdmissionDecisionGate_decision_id_check" CHECK (
    "decisionId" = pg_catalog.lower(
      pg_catalog.btrim("decisionId") COLLATE "C"
    )
    AND ("decisionId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "TenantAdmissionDecisionGate_attestation_id_check" CHECK (
    "attestationId" = pg_catalog.lower(
      pg_catalog.btrim("attestationId") COLLATE "C"
    )
    AND ("attestationId" COLLATE "C") ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT "TenantAdmissionDecisionGate_binding_check" CHECK (
    "boundAttestationRevision" = 1
    AND ("boundPayloadDigest" COLLATE "C") ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX "tenant_admission_decision_gate_attestation_key"
  ON public."TenantAdmissionDecisionGate" ("decisionId", "attestationId");

CREATE INDEX "tenant_admission_decision_gate_attestation_idx"
  ON public."TenantAdmissionDecisionGate" ("attestationId");

ALTER TABLE public."TenantAdmissionDecision"
  ADD CONSTRAINT "TenantAdmissionDecision_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES public."Tenant" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "TenantAdmissionDecision_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId")
  REFERENCES public."User" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

ALTER TABLE public."TenantAdmissionDecisionGate"
  ADD CONSTRAINT "TenantAdmissionDecisionGate_decisionId_fkey"
  FOREIGN KEY ("decisionId")
  REFERENCES public."TenantAdmissionDecision" ("id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT,
  ADD CONSTRAINT "tenant_admission_decision_gate_attestation_fkey"
  FOREIGN KEY ("attestationId", "gateCode")
  REFERENCES public."ReleaseGateAttestation" ("id", "gateCode")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

CREATE FUNCTION public."shared_beta_release_gate_attestation_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Release gate attestation history is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."gateCode" IS DISTINCT FROM NEW."gateCode"
     OR OLD."contractVersion" IS DISTINCT FROM NEW."contractVersion"
     OR OLD."releaseSha" IS DISTINCT FROM NEW."releaseSha"
     OR OLD."environment" IS DISTINCT FROM NEW."environment"
     OR OLD."artifactDigest" IS DISTINCT FROM NEW."artifactDigest"
     OR OLD."schemaHead" IS DISTINCT FROM NEW."schemaHead"
     OR OLD."migrationCount" IS DISTINCT FROM NEW."migrationCount"
     OR OLD."policyManifestDigest" IS DISTINCT FROM
       NEW."policyManifestDigest"
     OR OLD."payload" IS DISTINCT FROM NEW."payload"
     OR OLD."payloadDigest" IS DISTINCT FROM NEW."payloadDigest"
     OR OLD."signatureAlgorithm" IS DISTINCT FROM
       NEW."signatureAlgorithm"
     OR OLD."signingKeyId" IS DISTINCT FROM NEW."signingKeyId"
     OR OLD."provenanceKeyVersion" IS DISTINCT FROM
       NEW."provenanceKeyVersion"
     OR OLD."publicKeyFingerprint" IS DISTINCT FROM
       NEW."publicKeyFingerprint"
     OR OLD."signature" IS DISTINCT FROM NEW."signature"
     OR OLD."passedAt" IS DISTINCT FROM NEW."passedAt"
     OR OLD."validUntil" IS DISTINCT FROM NEW."validUntil"
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
     OR OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."revocationReasonDigest" IS NOT NULL
     OR NEW."stateRevision" <> 2
     OR NEW."revokedAt" IS NULL
     OR NEW."revocationReasonDigest" IS NULL
  THEN
    RAISE EXCEPTION 'Release gate attestation payload is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReleaseGateAttestation_guard_trigger"
BEFORE UPDATE OR DELETE ON public."ReleaseGateAttestation"
FOR EACH ROW
EXECUTE FUNCTION
  public."shared_beta_release_gate_attestation_guard_v1"();

CREATE FUNCTION public."shared_beta_tenant_admission_decision_guard_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Tenant admission decision history is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId"
     OR OLD."decision" IS DISTINCT FROM NEW."decision"
     OR OLD."requestId" IS DISTINCT FROM NEW."requestId"
     OR OLD."requestDigest" IS DISTINCT FROM NEW."requestDigest"
     OR OLD."workflowLocator" IS DISTINCT FROM NEW."workflowLocator"
     OR OLD."reservationSubjectId" IS DISTINCT FROM
       NEW."reservationSubjectId"
     OR OLD."expectedClaimRevision" IS DISTINCT FROM
       NEW."expectedClaimRevision"
     OR OLD."shellEvidenceDigest" IS DISTINCT FROM
       NEW."shellEvidenceDigest"
     OR OLD."releaseSha" IS DISTINCT FROM NEW."releaseSha"
     OR OLD."environment" IS DISTINCT FROM NEW."environment"
     OR OLD."artifactDigest" IS DISTINCT FROM NEW."artifactDigest"
     OR OLD."schemaHead" IS DISTINCT FROM NEW."schemaHead"
     OR OLD."migrationCount" IS DISTINCT FROM NEW."migrationCount"
     OR OLD."policyManifestDigest" IS DISTINCT FROM
       NEW."policyManifestDigest"
     OR OLD."databaseIdentityDigest" IS DISTINCT FROM
       NEW."databaseIdentityDigest"
     OR OLD."expectedEntitlementProfileRevision" IS DISTINCT FROM
       NEW."expectedEntitlementProfileRevision"
     OR OLD."expectedExecutionRevision" IS DISTINCT FROM
       NEW."expectedExecutionRevision"
     OR OLD."profileDigest" IS DISTINCT FROM NEW."profileDigest"
     OR OLD."gateSetVersion" IS DISTINCT FROM NEW."gateSetVersion"
     OR OLD."gateSetDigest" IS DISTINCT FROM NEW."gateSetDigest"
     OR OLD."approvedByUserId" IS DISTINCT FROM NEW."approvedByUserId"
     OR OLD."approvalReferenceDigest" IS DISTINCT FROM
       NEW."approvalReferenceDigest"
     OR OLD."payload" IS DISTINCT FROM NEW."payload"
     OR OLD."payloadDigest" IS DISTINCT FROM NEW."payloadDigest"
     OR OLD."signatureAlgorithm" IS DISTINCT FROM
       NEW."signatureAlgorithm"
     OR OLD."signingKeyId" IS DISTINCT FROM NEW."signingKeyId"
     OR OLD."publicKeyFingerprint" IS DISTINCT FROM
       NEW."publicKeyFingerprint"
     OR OLD."signature" IS DISTINCT FROM NEW."signature"
     OR OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt"
     OR OLD."validUntil" IS DISTINCT FROM NEW."validUntil"
     OR OLD."consumedAt" IS NOT NULL
     OR NEW."consumedAt" IS NOT NULL
     OR OLD."createdAt" IS DISTINCT FROM NEW."createdAt"
     OR OLD."stateRevision" <> 1
     OR OLD."revokedAt" IS NOT NULL
     OR OLD."revocationReasonDigest" IS NOT NULL
     OR NEW."stateRevision" <> 2
     OR NEW."revokedAt" IS NULL
     OR NEW."revocationReasonDigest" IS NULL
  THEN
    RAISE EXCEPTION 'Tenant admission decision payload is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "TenantAdmissionDecision_guard_trigger"
BEFORE UPDATE OR DELETE ON public."TenantAdmissionDecision"
FOR EACH ROW
EXECUTE FUNCTION
  public."shared_beta_tenant_admission_decision_guard_v1"();

CREATE FUNCTION public."shared_beta_tenant_admission_gate_immutable_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Tenant admission decision gate binding is immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "TenantAdmissionDecisionGate_immutable_trigger"
BEFORE UPDATE OR DELETE ON public."TenantAdmissionDecisionGate"
FOR EACH ROW
EXECUTE FUNCTION
  public."shared_beta_tenant_admission_gate_immutable_v1"();

-- This owner-only persistence primitive does not claim to verify Ed25519.
-- Its caller must be the standalone pinned-root verifier/importer. The
-- function rebinds the exact payload, key identity, digest and signature to
-- typed columns, while ordinary runtime roles receive no EXECUTE grant.
CREATE FUNCTION public."shared_beta_release_gate_attestation_persist_v1"(
  candidate_attestation_id TEXT,
  candidate_gate_code public."SharedBetaReleaseGateCode",
  candidate_release_sha TEXT,
  candidate_environment TEXT,
  candidate_artifact_digest TEXT,
  candidate_schema_head TEXT,
  candidate_migration_count INTEGER,
  candidate_policy_manifest_digest TEXT,
  candidate_payload JSONB,
  candidate_payload_digest TEXT,
  candidate_signing_key_id TEXT,
  candidate_provenance_key_version TEXT,
  candidate_public_key_fingerprint TEXT,
  candidate_signature BYTEA,
  candidate_passed_at TIMESTAMP(3) WITH TIME ZONE,
  candidate_valid_until TIMESTAMP(3) WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  attestation_id TEXT;
  release_sha TEXT;
  environment_name TEXT;
  artifact_digest TEXT;
  schema_head TEXT;
  policy_digest TEXT;
  payload_digest TEXT;
  signing_key_id TEXT;
  key_version TEXT;
  key_fingerprint TEXT;
  persisted public."ReleaseGateAttestation"%ROWTYPE;
  written_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  attestation_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_attestation_id) COLLATE "C"
  );
  release_sha := pg_catalog.btrim(candidate_release_sha);
  environment_name := pg_catalog.lower(
    pg_catalog.btrim(candidate_environment) COLLATE "C"
  );
  artifact_digest := pg_catalog.btrim(candidate_artifact_digest);
  schema_head := pg_catalog.btrim(candidate_schema_head);
  policy_digest := pg_catalog.btrim(candidate_policy_manifest_digest);
  payload_digest := pg_catalog.btrim(candidate_payload_digest);
  signing_key_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_signing_key_id) COLLATE "C"
  );
  key_version := pg_catalog.lower(
    pg_catalog.btrim(candidate_provenance_key_version) COLLATE "C"
  );
  key_fingerprint := pg_catalog.btrim(candidate_public_key_fingerprint);
  written_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF attestation_id IS NULL
     OR candidate_attestation_id IS DISTINCT FROM attestation_id
     OR attestation_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR release_sha IS NULL
     OR candidate_release_sha IS DISTINCT FROM release_sha
     OR release_sha !~ '^[0-9a-f]{40}$'
     OR environment_name IS NULL
     OR candidate_environment IS DISTINCT FROM environment_name
     OR environment_name !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR artifact_digest IS NULL
     OR candidate_artifact_digest IS DISTINCT FROM artifact_digest
     OR artifact_digest !~ '^[0-9a-f]{64}$'
     OR schema_head IS NULL
     OR candidate_schema_head IS DISTINCT FROM schema_head
     OR schema_head !~ '^[0-9]{14}_[a-z0-9_]{1,100}$'
     OR candidate_migration_count < 172
     OR policy_digest IS NULL
     OR candidate_policy_manifest_digest IS DISTINCT FROM policy_digest
     OR policy_digest !~ '^[0-9a-f]{64}$'
     OR candidate_payload IS NULL
     OR pg_catalog.jsonb_typeof(candidate_payload) <> 'object'
     OR payload_digest IS NULL
     OR candidate_payload_digest IS DISTINCT FROM payload_digest
     OR payload_digest !~ '^[0-9a-f]{64}$'
     OR signing_key_id IS NULL
     OR candidate_signing_key_id IS DISTINCT FROM signing_key_id
     OR signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR key_version IS NULL
     OR candidate_provenance_key_version IS DISTINCT FROM key_version
     OR key_version !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR key_fingerprint IS NULL
     OR candidate_public_key_fingerprint IS DISTINCT FROM key_fingerprint
     OR key_fingerprint !~ '^[0-9a-f]{64}$'
     OR candidate_signature IS NULL
     OR pg_catalog.octet_length(candidate_signature) <> 64
     OR candidate_passed_at IS NULL
     OR candidate_passed_at IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_passed_at)
     OR candidate_valid_until IS NULL
     OR candidate_valid_until IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_valid_until)
     OR candidate_passed_at > written_at + INTERVAL '5 minutes'
     OR candidate_valid_until <= written_at
     OR candidate_valid_until <= candidate_passed_at
     OR candidate_valid_until > candidate_passed_at + INTERVAL '7 days'
  THEN
    RAISE EXCEPTION 'Release gate attestation input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'shared-beta-gate-attestation:v1:' || attestation_id,
      0
    )
  );

  SELECT attestation.*
  INTO persisted
  FROM public."ReleaseGateAttestation" AS attestation
  WHERE attestation."id" = attestation_id
  FOR UPDATE;

  IF FOUND THEN
    IF persisted."gateCode" IS DISTINCT FROM candidate_gate_code
       OR persisted."contractVersion" <>
         'RELEASE_GATE_ATTESTATION_V1'
       OR persisted."releaseSha" IS DISTINCT FROM release_sha
       OR persisted."environment" IS DISTINCT FROM environment_name
       OR persisted."artifactDigest" IS DISTINCT FROM artifact_digest
       OR persisted."schemaHead" IS DISTINCT FROM schema_head
       OR persisted."migrationCount" IS DISTINCT FROM
         candidate_migration_count
       OR persisted."policyManifestDigest" IS DISTINCT FROM policy_digest
       OR persisted."payload" IS DISTINCT FROM candidate_payload
       OR persisted."payloadDigest" IS DISTINCT FROM payload_digest
       OR persisted."signatureAlgorithm" <> 'Ed25519'
       OR persisted."signingKeyId" IS DISTINCT FROM signing_key_id
       OR persisted."provenanceKeyVersion" IS DISTINCT FROM key_version
       OR persisted."publicKeyFingerprint" IS DISTINCT FROM key_fingerprint
       OR persisted."signature" IS DISTINCT FROM candidate_signature
       OR persisted."passedAt" IS DISTINCT FROM candidate_passed_at
       OR persisted."validUntil" IS DISTINCT FROM candidate_valid_until
    THEN
      RAISE EXCEPTION 'Release gate attestation replay conflicts'
        USING ERRCODE = '23505';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'PERSIST_RELEASE_GATE_ATTESTATION',
      'decision', 'REPLAYED',
      'attestationId', persisted."id",
      'gateCode', persisted."gateCode",
      'stateRevision', persisted."stateRevision",
      'revoked', persisted."revokedAt" IS NOT NULL
    );
  END IF;

  BEGIN
    INSERT INTO public."ReleaseGateAttestation" (
      "id",
      "gateCode",
      "contractVersion",
      "releaseSha",
      "environment",
      "artifactDigest",
      "schemaHead",
      "migrationCount",
      "policyManifestDigest",
      "payload",
      "payloadDigest",
      "signatureAlgorithm",
      "signingKeyId",
      "provenanceKeyVersion",
      "publicKeyFingerprint",
      "signature",
      "passedAt",
      "validUntil",
      "stateRevision",
      "revokedAt",
      "revocationReasonDigest",
      "createdAt"
    )
    VALUES (
      attestation_id,
      candidate_gate_code,
      'RELEASE_GATE_ATTESTATION_V1',
      release_sha,
      environment_name,
      artifact_digest,
      schema_head,
      candidate_migration_count,
      policy_digest,
      candidate_payload,
      payload_digest,
      'Ed25519',
      signing_key_id,
      key_version,
      key_fingerprint,
      candidate_signature,
      candidate_passed_at,
      candidate_valid_until,
      1,
      NULL,
      NULL,
      written_at
    )
    RETURNING *
    INTO persisted;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Release gate attestation conflicts with existing state'
        USING ERRCODE = '23505';
    WHEN check_violation OR not_null_violation THEN
      RAISE EXCEPTION 'Release gate attestation invariant failed'
        USING ERRCODE = '23514';
  END;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'PERSIST_RELEASE_GATE_ATTESTATION',
    'decision', 'CREATED',
    'attestationId', persisted."id",
    'gateCode', persisted."gateCode",
    'stateRevision', persisted."stateRevision",
    'revoked', false
  );
END;
$$;

CREATE FUNCTION public."shared_beta_release_gate_attestation_revoke_v1"(
  expected_attestation_id TEXT,
  expected_state_revision INTEGER,
  revocation_reason_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  attestation_id TEXT;
  reason_digest TEXT;
  persisted public."ReleaseGateAttestation"%ROWTYPE;
  revoked_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  attestation_id := pg_catalog.lower(
    pg_catalog.btrim(expected_attestation_id) COLLATE "C"
  );
  reason_digest := pg_catalog.btrim(revocation_reason_digest);

  IF attestation_id IS NULL
     OR expected_attestation_id IS DISTINCT FROM attestation_id
     OR attestation_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_state_revision NOT IN (1, 2)
     OR reason_digest IS NULL
     OR revocation_reason_digest IS DISTINCT FROM reason_digest
     OR reason_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Release gate attestation revocation input is invalid'
      USING ERRCODE = '22023';
  END IF;

  -- Discover without a lock, then lock every referencing Tenant in stable
  -- order before the gate row. A concurrent decision creator holds Tenant
  -- before gate, so the shared order remains deadlock-safe.
  PERFORM tenant."id"
  FROM public."Tenant" AS tenant
  INNER JOIN public."TenantAdmissionDecision" AS decision
    ON decision."tenantId" = tenant."id"
  INNER JOIN public."TenantAdmissionDecisionGate" AS decision_gate
    ON decision_gate."decisionId" = decision."id"
  WHERE decision_gate."attestationId" = attestation_id
  ORDER BY tenant."id"
  FOR UPDATE OF tenant;

  SELECT attestation.*
  INTO persisted
  FROM public."ReleaseGateAttestation" AS attestation
  WHERE attestation."id" = attestation_id
  FOR UPDATE;

  IF NOT FOUND OR persisted."stateRevision" <> expected_state_revision THEN
    RAISE EXCEPTION 'Release gate attestation state changed'
      USING ERRCODE = '40001';
  END IF;

  IF persisted."revokedAt" IS NOT NULL THEN
    IF persisted."revocationReasonDigest" IS DISTINCT FROM reason_digest THEN
      RAISE EXCEPTION 'Release gate attestation revocation conflicts'
        USING ERRCODE = '23505';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'REVOKE_RELEASE_GATE_ATTESTATION',
      'decision', 'REPLAYED',
      'attestationId', persisted."id",
      'gateCode', persisted."gateCode",
      'stateRevision', persisted."stateRevision"
    );
  END IF;

  revoked_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  UPDATE public."ReleaseGateAttestation"
  SET
    "stateRevision" = 2,
    "revokedAt" = revoked_at,
    "revocationReasonDigest" = reason_digest
  WHERE "id" = attestation_id
    AND "stateRevision" = expected_state_revision
    AND "revokedAt" IS NULL
  RETURNING *
  INTO persisted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release gate attestation state changed'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'REVOKE_RELEASE_GATE_ATTESTATION',
    'decision', 'REVOKED',
    'attestationId', persisted."id",
    'gateCode', persisted."gateCode",
    'stateRevision', persisted."stateRevision"
  );
END;
$$;

CREATE FUNCTION public."shared_beta_tenant_profile_digest_v1"(
  expected_tenant_id TEXT,
  expected_profile_revision INTEGER
)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'leetplus-shared-beta-profile-v1',
        'UTF8'
      )
      || '\x00'::BYTEA
      ||
      pg_catalog.convert_to(
        COALESCE(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'module', entitlement."module"::TEXT,
              'readEnabled', entitlement."readEnabled",
              'writeEnabled', entitlement."writeEnabled",
              'outboundEnabled', entitlement."outboundEnabled",
              'validFromEpochMs',
                CASE
                  WHEN entitlement."validFrom" IS NULL THEN NULL
                  ELSE (
                    EXTRACT(EPOCH FROM entitlement."validFrom") * 1000
                  )::BIGINT
                END,
              'validUntilEpochMs',
                CASE
                  WHEN entitlement."validUntil" IS NULL THEN NULL
                  ELSE (
                    EXTRACT(EPOCH FROM entitlement."validUntil") * 1000
                  )::BIGINT
                END,
              'profileRevision', entitlement."profileRevision"
            )
            ORDER BY entitlement."module"::TEXT
          )::TEXT,
          '[]'
        ),
        'UTF8'
      )
    ),
    'hex'
  )
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = expected_tenant_id
    AND entitlement."profileRevision" = expected_profile_revision;
$$;

CREATE FUNCTION public."shared_beta_tenant_admission_decision_create_v1"(
  candidate_decision_id TEXT,
  expected_tenant_id TEXT,
  admission_request_id TEXT,
  admission_request_digest TEXT,
  expected_workflow_locator TEXT,
  expected_reservation_subject_id TEXT,
  expected_claim_revision INTEGER,
  expected_shell_evidence_digest TEXT,
  expected_release_sha TEXT,
  expected_environment TEXT,
  expected_artifact_digest TEXT,
  expected_schema_head TEXT,
  expected_migration_count INTEGER,
  expected_policy_manifest_digest TEXT,
  expected_database_identity_digest TEXT,
  expected_entitlement_profile_revision INTEGER,
  expected_execution_revision INTEGER,
  expected_profile_digest TEXT,
  expected_gate_set_digest TEXT,
  approved_by_user_id TEXT,
  approval_reference_digest TEXT,
  candidate_payload JSONB,
  candidate_payload_digest TEXT,
  candidate_signing_key_id TEXT,
  candidate_public_key_fingerprint TEXT,
  candidate_signature BYTEA,
  candidate_approved_at TIMESTAMP(3) WITH TIME ZONE,
  candidate_valid_until TIMESTAMP(3) WITH TIME ZONE,
  module_policy_attestation_id TEXT,
  email_workflow_attestation_id TEXT,
  postgres_rehearsal_attestation_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  uuid_pattern CONSTANT TEXT :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  decision_id TEXT;
  tenant_id TEXT;
  request_id TEXT;
  request_digest TEXT;
  workflow_locator TEXT;
  reservation_subject_id TEXT;
  shell_evidence_digest TEXT;
  release_sha TEXT;
  environment_name TEXT;
  artifact_digest TEXT;
  schema_head TEXT;
  policy_digest TEXT;
  database_identity_digest TEXT;
  profile_digest TEXT;
  gate_set_digest TEXT;
  approver_id TEXT;
  approval_digest TEXT;
  payload_digest TEXT;
  signing_key_id TEXT;
  key_fingerprint TEXT;
  gate_ids TEXT[];
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  persisted public."TenantAdmissionDecision"%ROWTYPE;
  actual_profile_digest TEXT;
  actual_gate_set_digest TEXT;
  entitlement_count INTEGER;
  valid_entitlement_count INTEGER;
  locked_gate_count INTEGER;
  gate_count INTEGER;
  valid_gate_count INTEGER;
  gate_codes public."SharedBetaReleaseGateCode"[];
  written_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  decision_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_decision_id) COLLATE "C"
  );
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );
  request_id := pg_catalog.lower(
    pg_catalog.btrim(admission_request_id) COLLATE "C"
  );
  request_digest := pg_catalog.btrim(admission_request_digest);
  workflow_locator := pg_catalog.lower(
    pg_catalog.btrim(expected_workflow_locator) COLLATE "C"
  );
  reservation_subject_id := pg_catalog.lower(
    pg_catalog.btrim(expected_reservation_subject_id) COLLATE "C"
  );
  shell_evidence_digest := pg_catalog.btrim(
    expected_shell_evidence_digest
  );
  release_sha := pg_catalog.btrim(expected_release_sha);
  environment_name := pg_catalog.lower(
    pg_catalog.btrim(expected_environment) COLLATE "C"
  );
  artifact_digest := pg_catalog.btrim(expected_artifact_digest);
  schema_head := pg_catalog.btrim(expected_schema_head);
  policy_digest := pg_catalog.btrim(expected_policy_manifest_digest);
  database_identity_digest := pg_catalog.btrim(
    expected_database_identity_digest
  );
  profile_digest := pg_catalog.btrim(expected_profile_digest);
  gate_set_digest := pg_catalog.btrim(expected_gate_set_digest);
  approver_id := pg_catalog.lower(
    pg_catalog.btrim(approved_by_user_id) COLLATE "C"
  );
  approval_digest := pg_catalog.btrim(approval_reference_digest);
  payload_digest := pg_catalog.btrim(candidate_payload_digest);
  signing_key_id := pg_catalog.lower(
    pg_catalog.btrim(candidate_signing_key_id) COLLATE "C"
  );
  key_fingerprint := pg_catalog.btrim(candidate_public_key_fingerprint);
  gate_ids := ARRAY[
    pg_catalog.lower(
      pg_catalog.btrim(module_policy_attestation_id) COLLATE "C"
    ),
    pg_catalog.lower(
      pg_catalog.btrim(email_workflow_attestation_id) COLLATE "C"
    ),
    pg_catalog.lower(
      pg_catalog.btrim(postgres_rehearsal_attestation_id) COLLATE "C"
    )
  ];
  written_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF decision_id IS NULL
     OR candidate_decision_id IS DISTINCT FROM decision_id
     OR decision_id !~ uuid_pattern
     OR tenant_id IS NULL
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR tenant_id !~ uuid_pattern
     OR request_id IS NULL
     OR admission_request_id IS DISTINCT FROM request_id
     OR request_id !~ uuid_pattern
     OR request_digest IS NULL
     OR admission_request_digest IS DISTINCT FROM request_digest
     OR request_digest !~ '^[0-9a-f]{64}$'
     OR workflow_locator IS NULL
     OR expected_workflow_locator IS DISTINCT FROM workflow_locator
     OR workflow_locator !~ uuid_pattern
     OR reservation_subject_id IS NULL
     OR expected_reservation_subject_id IS DISTINCT FROM
       reservation_subject_id
     OR reservation_subject_id !~ uuid_pattern
     OR expected_claim_revision < 1
     OR shell_evidence_digest IS NULL
     OR expected_shell_evidence_digest IS DISTINCT FROM shell_evidence_digest
     OR shell_evidence_digest !~ '^[0-9a-f]{64}$'
     OR release_sha IS NULL
     OR expected_release_sha IS DISTINCT FROM release_sha
     OR release_sha !~ '^[0-9a-f]{40}$'
     OR environment_name IS NULL
     OR expected_environment IS DISTINCT FROM environment_name
     OR environment_name !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR artifact_digest IS NULL
     OR expected_artifact_digest IS DISTINCT FROM artifact_digest
     OR artifact_digest !~ '^[0-9a-f]{64}$'
     OR schema_head IS NULL
     OR expected_schema_head IS DISTINCT FROM schema_head
     OR schema_head !~ '^[0-9]{14}_[a-z0-9_]{1,100}$'
     OR expected_migration_count < 172
     OR policy_digest IS NULL
     OR expected_policy_manifest_digest IS DISTINCT FROM policy_digest
     OR policy_digest !~ '^[0-9a-f]{64}$'
     OR database_identity_digest IS NULL
     OR expected_database_identity_digest IS DISTINCT FROM
       database_identity_digest
     OR database_identity_digest !~ '^[0-9a-f]{64}$'
     OR expected_entitlement_profile_revision < 1
     OR expected_execution_revision < 0
     OR profile_digest IS NULL
     OR expected_profile_digest IS DISTINCT FROM profile_digest
     OR profile_digest !~ '^[0-9a-f]{64}$'
     OR gate_set_digest IS NULL
     OR expected_gate_set_digest IS DISTINCT FROM gate_set_digest
     OR gate_set_digest !~ '^[0-9a-f]{64}$'
     OR approver_id IS NULL
     OR approved_by_user_id IS DISTINCT FROM approver_id
     OR approver_id !~ uuid_pattern
     OR approval_digest IS NULL
     OR approval_reference_digest IS DISTINCT FROM approval_digest
     OR approval_digest !~ '^[0-9a-f]{64}$'
     OR candidate_payload IS NULL
     OR pg_catalog.jsonb_typeof(candidate_payload) <> 'object'
     OR payload_digest IS NULL
     OR candidate_payload_digest IS DISTINCT FROM payload_digest
     OR payload_digest !~ '^[0-9a-f]{64}$'
     OR signing_key_id IS NULL
     OR candidate_signing_key_id IS DISTINCT FROM signing_key_id
     OR signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR key_fingerprint IS NULL
     OR candidate_public_key_fingerprint IS DISTINCT FROM key_fingerprint
     OR key_fingerprint !~ '^[0-9a-f]{64}$'
     OR candidate_signature IS NULL
     OR pg_catalog.octet_length(candidate_signature) <> 64
     OR candidate_approved_at IS NULL
     OR candidate_approved_at IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_approved_at)
     OR candidate_valid_until IS NULL
     OR candidate_valid_until IS DISTINCT FROM
       pg_catalog.date_trunc('milliseconds', candidate_valid_until)
     OR candidate_approved_at > written_at + INTERVAL '5 minutes'
     OR candidate_valid_until <= written_at
     OR candidate_valid_until <= candidate_approved_at
     OR candidate_valid_until >
       candidate_approved_at + INTERVAL '24 hours'
     OR gate_ids[1] IS NULL
     OR gate_ids[2] IS NULL
     OR gate_ids[3] IS NULL
     OR module_policy_attestation_id IS DISTINCT FROM gate_ids[1]
     OR email_workflow_attestation_id IS DISTINCT FROM gate_ids[2]
     OR postgres_rehearsal_attestation_id IS DISTINCT FROM gate_ids[3]
     OR gate_ids[1] !~ uuid_pattern
     OR gate_ids[2] !~ uuid_pattern
     OR gate_ids[3] !~ uuid_pattern
     OR pg_catalog.cardinality(
       ARRAY(
         SELECT DISTINCT gate_id
         FROM pg_catalog.unnest(gate_ids) AS gate_id
       )
     ) <> 3
  THEN
    RAISE EXCEPTION 'Tenant admission decision input is invalid'
      USING ERRCODE = '22023';
  END IF;

  -- Request lock -> tenant lock. No gate row is locked before Tenant.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'shared-beta-admission-request:v1:' ||
      tenant_id || ':' || request_id,
      0
    )
  );

  -- NO KEY UPDATE freezes every admission-shell field while remaining
  -- compatible with the Tenant FK KEY SHARE acquired by a concurrent owner
  -- invite issue after it has locked the identity claim.
  SELECT tenant.*
  INTO tenant_record
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
  FOR NO KEY UPDATE;

  IF NOT FOUND
     OR tenant_record."status" IS DISTINCT FROM
       'SUSPENDED'::public."TenantLifecycleStatus"
     OR tenant_record."customerStage" IS DISTINCT FROM
       'PILOT'::public."TenantCustomerStage"
     OR tenant_record."onboardingStatus" IS DISTINCT FROM
       'PROVISIONING'::public."TenantOnboardingStatus"
     OR tenant_record."trialStartsAt" IS NOT NULL
     OR tenant_record."trialEndsAt" IS NOT NULL
     OR tenant_record."entitlementProfileRevision" IS DISTINCT FROM
       expected_entitlement_profile_revision
     OR tenant_record."executionRevision" IS DISTINCT FROM
       expected_execution_revision
  THEN
    RAISE EXCEPTION 'Tenant admission shell precondition is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT decision.*
  INTO persisted
  FROM public."TenantAdmissionDecision" AS decision
  WHERE decision."tenantId" = tenant_id
    AND decision."requestId" = request_id
  FOR UPDATE;

  IF FOUND THEN
    IF persisted."requestDigest" IS DISTINCT FROM request_digest
       OR persisted."id" IS DISTINCT FROM decision_id
       OR persisted."workflowLocator" IS DISTINCT FROM workflow_locator
       OR persisted."reservationSubjectId" IS DISTINCT FROM
         reservation_subject_id
       OR persisted."expectedClaimRevision" IS DISTINCT FROM
         expected_claim_revision
       OR persisted."shellEvidenceDigest" IS DISTINCT FROM
         shell_evidence_digest
       OR persisted."releaseSha" IS DISTINCT FROM release_sha
       OR persisted."environment" IS DISTINCT FROM environment_name
       OR persisted."artifactDigest" IS DISTINCT FROM artifact_digest
       OR persisted."schemaHead" IS DISTINCT FROM schema_head
       OR persisted."migrationCount" IS DISTINCT FROM
         expected_migration_count
       OR persisted."policyManifestDigest" IS DISTINCT FROM policy_digest
       OR persisted."databaseIdentityDigest" IS DISTINCT FROM
         database_identity_digest
       OR persisted."expectedEntitlementProfileRevision" IS DISTINCT FROM
         expected_entitlement_profile_revision
       OR persisted."expectedExecutionRevision" IS DISTINCT FROM
         expected_execution_revision
       OR persisted."profileDigest" IS DISTINCT FROM profile_digest
       OR persisted."gateSetDigest" IS DISTINCT FROM gate_set_digest
       OR persisted."approvedByUserId" IS DISTINCT FROM approver_id
       OR persisted."approvalReferenceDigest" IS DISTINCT FROM
         approval_digest
       OR persisted."payload" IS DISTINCT FROM candidate_payload
       OR persisted."payloadDigest" IS DISTINCT FROM payload_digest
       OR persisted."signingKeyId" IS DISTINCT FROM signing_key_id
       OR persisted."publicKeyFingerprint" IS DISTINCT FROM key_fingerprint
       OR persisted."signature" IS DISTINCT FROM candidate_signature
       OR persisted."approvedAt" IS DISTINCT FROM candidate_approved_at
       OR persisted."validUntil" IS DISTINCT FROM candidate_valid_until
    THEN
      RAISE EXCEPTION 'Tenant admission request replay conflicts'
        USING ERRCODE = '23505';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'CREATE_TENANT_ADMISSION_DECISION',
      'decision', 'REPLAYED',
      'tenantId', persisted."tenantId",
      'decisionId', persisted."id",
      'state', CASE
        WHEN persisted."revokedAt" IS NULL THEN 'AVAILABLE'
        ELSE 'REVOKED'
      END,
      'stateRevision', persisted."stateRevision",
      'gateCount', 3
    );
  END IF;

  PERFORM 1
  FROM public."User" AS approver
  WHERE approver."id" = approver_id
    AND approver."isActive" = true
    AND approver."isPlatformAdmin" = true
  FOR NO KEY UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant admission approver is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."workflowLocator" = workflow_locator
  FOR UPDATE;

  IF NOT FOUND
     OR claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType" IS DISTINCT FROM
       'INVITE'::public."IdentityEmailClaimType"
     OR claim_record."subjectId" IS DISTINCT FROM reservation_subject_id
     OR claim_record."revision" IS DISTINCT FROM expected_claim_revision
  THEN
    RAISE EXCEPTION 'Tenant admission identity precondition is unavailable'
      USING ERRCODE = '23514';
  END IF;

  -- Gate rows are shared by every tenant. Create and assert therefore use
  -- the same exact gate-code/id order after their tenant-local locks.
  PERFORM 1
  FROM public."ReleaseGateAttestation" AS attestation
  WHERE attestation."id" = ANY(gate_ids)
  ORDER BY attestation."gateCode"::TEXT, attestation."id"
  FOR UPDATE;

  GET DIAGNOSTICS locked_gate_count = ROW_COUNT;

  IF locked_gate_count <> 3 THEN
    RAISE EXCEPTION 'Tenant admission gate set is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE
        (
          attestation."id" = gate_ids[1]
          AND attestation."gateCode" =
            'MODULE_POLICY_ENFORCED'::public."SharedBetaReleaseGateCode"
        )
        OR (
          attestation."id" = gate_ids[2]
          AND attestation."gateCode" =
            'EMAIL_INVITE_WORKFLOW_VERIFIED'::public."SharedBetaReleaseGateCode"
        )
        OR (
          attestation."id" = gate_ids[3]
          AND attestation."gateCode" =
            'POSTGRESQL_RELEASE_REHEARSAL_VERIFIED'::public."SharedBetaReleaseGateCode"
        )
    ),
    pg_catalog.array_agg(
      attestation."gateCode"
      ORDER BY attestation."gateCode"::TEXT
    ),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'leetplus-shared-beta-gate-set-v1',
          'UTF8'
        )
        || '\x00'::BYTEA
        ||
        pg_catalog.convert_to(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'gateCode', attestation."gateCode"::TEXT,
              'attestationId', attestation."id",
              'payloadDigest', attestation."payloadDigest"
            )
            ORDER BY attestation."gateCode"::TEXT
          )::TEXT,
          'UTF8'
        )
      ),
      'hex'
    )
  INTO
    gate_count,
    valid_gate_count,
    gate_codes,
    actual_gate_set_digest
  FROM public."ReleaseGateAttestation" AS attestation
  WHERE attestation."id" = ANY(gate_ids)
    AND attestation."stateRevision" = 1
    AND attestation."revokedAt" IS NULL
    AND attestation."passedAt" <= candidate_approved_at
    AND attestation."validUntil" >= candidate_valid_until
    AND attestation."releaseSha" = release_sha
    AND attestation."environment" = environment_name
    AND attestation."artifactDigest" = artifact_digest
    AND attestation."schemaHead" = schema_head
    AND attestation."migrationCount" = expected_migration_count
    AND attestation."policyManifestDigest" = policy_digest
    AND attestation."signatureAlgorithm" = 'Ed25519'
    AND attestation."signingKeyId" = signing_key_id
    AND attestation."publicKeyFingerprint" = key_fingerprint;

  IF gate_count <> 3
     OR valid_gate_count <> 3
     OR pg_catalog.cardinality(gate_codes) <> 3
     OR actual_gate_set_digest IS DISTINCT FROM gate_set_digest
  THEN
    RAISE EXCEPTION 'Tenant admission gate set is unavailable'
      USING ERRCODE = '23514';
  END IF;

  PERFORM entitlement."id"
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = tenant_id
  ORDER BY entitlement."module"::TEXT
  FOR UPDATE;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE entitlement."profileRevision" =
          expected_entitlement_profile_revision
        AND entitlement."readEnabled" = true
        AND entitlement."writeEnabled" = true
        AND entitlement."outboundEnabled" = false
        AND (
          entitlement."validFrom" IS NULL
          OR entitlement."validFrom" <= candidate_approved_at
        )
        AND (
          entitlement."validUntil" IS NULL
          OR entitlement."validUntil" >= candidate_valid_until
        )
    )
  INTO entitlement_count, valid_entitlement_count
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = tenant_id;

  actual_profile_digest :=
    public."shared_beta_tenant_profile_digest_v1"(
      tenant_id,
      expected_entitlement_profile_revision
    );

  IF entitlement_count <> 6
     OR valid_entitlement_count <> 6
     OR actual_profile_digest IS DISTINCT FROM profile_digest
  THEN
    RAISE EXCEPTION 'Tenant admission profile is unavailable'
      USING ERRCODE = '23514';
  END IF;

  -- Lock waits must not make an already-expired signed GO appear current.
  -- Rebase the persisted write time only after every mutable admission
  -- dependency has been locked, then repeat the wall-clock predicates.
  written_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF candidate_approved_at > written_at + INTERVAL '5 minutes'
     OR candidate_valid_until <= written_at
  THEN
    RAISE EXCEPTION 'Tenant admission decision validity is unavailable'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    INSERT INTO public."TenantAdmissionDecision" (
      "id",
      "tenantId",
      "decision",
      "requestId",
      "requestDigest",
      "workflowLocator",
      "reservationSubjectId",
      "expectedClaimRevision",
      "shellEvidenceDigest",
      "releaseSha",
      "environment",
      "artifactDigest",
      "schemaHead",
      "migrationCount",
      "policyManifestDigest",
      "databaseIdentityDigest",
      "expectedEntitlementProfileRevision",
      "expectedExecutionRevision",
      "profileDigest",
      "gateSetVersion",
      "gateSetDigest",
      "approvedByUserId",
      "approvalReferenceDigest",
      "payload",
      "payloadDigest",
      "signatureAlgorithm",
      "signingKeyId",
      "publicKeyFingerprint",
      "signature",
      "approvedAt",
      "validUntil",
      "stateRevision",
      "revokedAt",
      "revocationReasonDigest",
      "consumedAt",
      "createdAt"
    )
    VALUES (
      decision_id,
      tenant_id,
      'GO',
      request_id,
      request_digest,
      workflow_locator,
      reservation_subject_id,
      expected_claim_revision,
      shell_evidence_digest,
      release_sha,
      environment_name,
      artifact_digest,
      schema_head,
      expected_migration_count,
      policy_digest,
      database_identity_digest,
      expected_entitlement_profile_revision,
      expected_execution_revision,
      profile_digest,
      'SHARED_BETA_GATE_SET_V1',
      gate_set_digest,
      approver_id,
      approval_digest,
      candidate_payload,
      payload_digest,
      'Ed25519',
      signing_key_id,
      key_fingerprint,
      candidate_signature,
      candidate_approved_at,
      candidate_valid_until,
      1,
      NULL,
      NULL,
      NULL,
      written_at
    )
    RETURNING *
    INTO persisted;

    INSERT INTO public."TenantAdmissionDecisionGate" (
      "decisionId",
      "gateCode",
      "attestationId",
      "boundAttestationRevision",
      "boundPayloadDigest",
      "createdAt"
    )
    SELECT
      decision_id,
      attestation."gateCode",
      attestation."id",
      attestation."stateRevision",
      attestation."payloadDigest",
      written_at
    FROM public."ReleaseGateAttestation" AS attestation
    WHERE attestation."id" = ANY(gate_ids)
    ORDER BY attestation."gateCode"::TEXT;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Tenant admission decision conflicts with existing state'
        USING ERRCODE = '23505';
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Tenant admission database precondition is missing'
        USING ERRCODE = '23503';
    WHEN check_violation OR not_null_violation THEN
      RAISE EXCEPTION 'Tenant admission decision invariant failed'
        USING ERRCODE = '23514';
  END;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'CREATE_TENANT_ADMISSION_DECISION',
    'decision', 'CREATED',
    'tenantId', persisted."tenantId",
    'decisionId', persisted."id",
    'state', 'AVAILABLE',
    'stateRevision', persisted."stateRevision",
    'gateCount', 3
  );
END;
$$;

-- Ordering boundary for the later 004I cutover:
--   create GO against RESERVATION -> assert RESERVATION -> issue HOLD
--   -> assert the same GO as ISSUED_HOLD -> only then consider activation.
-- Create deliberately remains pre-issue; this assertion preserves the
-- original signed reservation binding through the immutable issue aggregate.
CREATE FUNCTION public."shared_beta_tenant_admission_decision_assert_v1"(
  expected_decision_id TEXT,
  expected_tenant_id TEXT,
  expected_workflow_locator TEXT,
  expected_reservation_subject_id TEXT,
  expected_claim_revision INTEGER,
  expected_release_sha TEXT,
  expected_environment TEXT,
  expected_artifact_digest TEXT,
  expected_schema_head TEXT,
  expected_migration_count INTEGER,
  expected_policy_manifest_digest TEXT,
  expected_database_identity_digest TEXT,
  expected_entitlement_profile_revision INTEGER,
  expected_execution_revision INTEGER,
  expected_profile_digest TEXT,
  expected_gate_set_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  decision_id TEXT;
  tenant_id TEXT;
  workflow_locator TEXT;
  reservation_subject_id TEXT;
  release_sha TEXT;
  environment_name TEXT;
  artifact_digest TEXT;
  schema_head TEXT;
  policy_digest TEXT;
  database_identity_digest TEXT;
  profile_digest TEXT;
  gate_set_digest TEXT;
  tenant_record public."Tenant"%ROWTYPE;
  claim_record public."IdentityEmailClaim"%ROWTYPE;
  issue_command_record
    public."IdentityOwnerInviteIssueCommand"%ROWTYPE;
  invite_record public."UserInvite"%ROWTYPE;
  outbox_record public."IdentityMailOutbox"%ROWTYPE;
  decision_record public."TenantAdmissionDecision"%ROWTYPE;
  identity_state TEXT;
  assertion_receipt JSONB;
  link_count INTEGER;
  valid_gate_count INTEGER;
  entitlement_count INTEGER;
  valid_entitlement_count INTEGER;
  actual_profile_digest TEXT;
  actual_gate_set_digest TEXT;
  asserted_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  decision_id := pg_catalog.lower(
    pg_catalog.btrim(expected_decision_id) COLLATE "C"
  );
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );
  workflow_locator := pg_catalog.lower(
    pg_catalog.btrim(expected_workflow_locator) COLLATE "C"
  );
  reservation_subject_id := pg_catalog.lower(
    pg_catalog.btrim(expected_reservation_subject_id) COLLATE "C"
  );
  release_sha := pg_catalog.btrim(expected_release_sha);
  environment_name := pg_catalog.lower(
    pg_catalog.btrim(expected_environment) COLLATE "C"
  );
  artifact_digest := pg_catalog.btrim(expected_artifact_digest);
  schema_head := pg_catalog.btrim(expected_schema_head);
  policy_digest := pg_catalog.btrim(expected_policy_manifest_digest);
  database_identity_digest := pg_catalog.btrim(
    expected_database_identity_digest
  );
  profile_digest := pg_catalog.btrim(expected_profile_digest);
  gate_set_digest := pg_catalog.btrim(expected_gate_set_digest);

  IF decision_id IS NULL
     OR expected_decision_id IS DISTINCT FROM decision_id
     OR decision_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR tenant_id IS NULL
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR tenant_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR workflow_locator IS NULL
     OR expected_workflow_locator IS DISTINCT FROM workflow_locator
     OR workflow_locator !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR reservation_subject_id IS NULL
     OR expected_reservation_subject_id IS DISTINCT FROM
       reservation_subject_id
     OR reservation_subject_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_claim_revision < 1
     OR release_sha IS NULL
     OR expected_release_sha IS DISTINCT FROM release_sha
     OR release_sha !~ '^[0-9a-f]{40}$'
     OR environment_name IS NULL
     OR expected_environment IS DISTINCT FROM environment_name
     OR environment_name !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
     OR artifact_digest IS NULL
     OR expected_artifact_digest IS DISTINCT FROM artifact_digest
     OR artifact_digest !~ '^[0-9a-f]{64}$'
     OR schema_head IS NULL
     OR expected_schema_head IS DISTINCT FROM schema_head
     OR schema_head !~ '^[0-9]{14}_[a-z0-9_]{1,100}$'
     OR expected_migration_count < 172
     OR policy_digest IS NULL
     OR expected_policy_manifest_digest IS DISTINCT FROM policy_digest
     OR policy_digest !~ '^[0-9a-f]{64}$'
     OR database_identity_digest IS NULL
     OR expected_database_identity_digest IS DISTINCT FROM
       database_identity_digest
     OR database_identity_digest !~ '^[0-9a-f]{64}$'
     OR expected_entitlement_profile_revision < 1
     OR expected_execution_revision < 0
     OR profile_digest IS NULL
     OR expected_profile_digest IS DISTINCT FROM profile_digest
     OR profile_digest !~ '^[0-9a-f]{64}$'
     OR gate_set_digest IS NULL
     OR expected_gate_set_digest IS DISTINCT FROM gate_set_digest
     OR gate_set_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Tenant admission assertion input is invalid'
      USING ERRCODE = '22023';
  END IF;

  -- NO KEY UPDATE freezes every shell field while remaining compatible with
  -- the Tenant FK KEY SHARE acquired by the issue RPC after its claim lock.
  -- This removes the claim -> Tenant / Tenant -> claim deadlock cycle.
  SELECT tenant.*
  INTO tenant_record
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
  FOR NO KEY UPDATE;

  IF NOT FOUND
     OR tenant_record."status" IS DISTINCT FROM
       'SUSPENDED'::public."TenantLifecycleStatus"
     OR tenant_record."customerStage" IS DISTINCT FROM
       'PILOT'::public."TenantCustomerStage"
     OR tenant_record."onboardingStatus" IS DISTINCT FROM
       'PROVISIONING'::public."TenantOnboardingStatus"
     OR tenant_record."trialStartsAt" IS NOT NULL
     OR tenant_record."trialEndsAt" IS NOT NULL
     OR tenant_record."entitlementProfileRevision" IS DISTINCT FROM
       expected_entitlement_profile_revision
     OR tenant_record."executionRevision" IS DISTINCT FROM
       expected_execution_revision
  THEN
    RAISE EXCEPTION 'Tenant admission assertion denied'
      USING ERRCODE = '23514';
  END IF;

  SELECT decision.*
  INTO decision_record
  FROM public."TenantAdmissionDecision" AS decision
  WHERE decision."id" = decision_id
    AND decision."tenantId" = tenant_id
  FOR UPDATE;

  IF NOT FOUND
     OR decision_record."decision" <> 'GO'
     OR decision_record."stateRevision" <> 1
     OR decision_record."revokedAt" IS NOT NULL
     OR decision_record."consumedAt" IS NOT NULL
     OR decision_record."workflowLocator" IS DISTINCT FROM workflow_locator
     OR decision_record."reservationSubjectId" IS DISTINCT FROM
       reservation_subject_id
     OR decision_record."expectedClaimRevision" IS DISTINCT FROM
       expected_claim_revision
     OR decision_record."releaseSha" IS DISTINCT FROM release_sha
     OR decision_record."environment" IS DISTINCT FROM environment_name
     OR decision_record."artifactDigest" IS DISTINCT FROM artifact_digest
     OR decision_record."schemaHead" IS DISTINCT FROM schema_head
     OR decision_record."migrationCount" IS DISTINCT FROM
       expected_migration_count
     OR decision_record."policyManifestDigest" IS DISTINCT FROM policy_digest
     OR decision_record."databaseIdentityDigest" IS DISTINCT FROM
       database_identity_digest
     OR decision_record."expectedEntitlementProfileRevision" IS DISTINCT FROM
       expected_entitlement_profile_revision
     OR decision_record."expectedExecutionRevision" IS DISTINCT FROM
       expected_execution_revision
     OR decision_record."profileDigest" IS DISTINCT FROM profile_digest
     OR decision_record."gateSetVersion" <>
       'SHARED_BETA_GATE_SET_V1'
     OR decision_record."gateSetDigest" IS DISTINCT FROM gate_set_digest
     OR decision_record."signatureAlgorithm" <> 'Ed25519'
     OR pg_catalog.octet_length(decision_record."signature") <> 64
  THEN
    RAISE EXCEPTION 'Tenant admission assertion denied'
      USING ERRCODE = '23514';
  END IF;

  SELECT claim.*
  INTO claim_record
  FROM public."IdentityEmailClaim" AS claim
  WHERE claim."workflowLocator" = workflow_locator
  FOR UPDATE;

  IF NOT FOUND
     OR claim_record."tenantId" IS DISTINCT FROM tenant_id
     OR claim_record."claimType" IS DISTINCT FROM
       'INVITE'::public."IdentityEmailClaimType"
  THEN
    RAISE EXCEPTION 'Tenant admission assertion denied'
      USING ERRCODE = '23514';
  END IF;

  IF claim_record."subjectId" IS NOT DISTINCT FROM
       reservation_subject_id
     AND claim_record."revision" IS NOT DISTINCT FROM
       expected_claim_revision
  THEN
    identity_state := 'RESERVATION';
  ELSE
    -- The signed GO remains bound to the original reservation. A progressed
    -- claim is accepted only through the immutable CURRENT_171 issue
    -- command and its exact live OWNER/NETWORK + HOLD aggregate.
    SELECT issue_command.*
    INTO issue_command_record
    FROM public."IdentityOwnerInviteIssueCommand" AS issue_command
    WHERE issue_command."tenantId" = tenant_id
      AND issue_command."action" = 'ISSUE_INITIAL_OWNER_INVITE'
      AND issue_command."workflowLocator" = workflow_locator
      AND issue_command."reservationSubjectId" =
        reservation_subject_id
      AND issue_command."reservationClaimRevision" =
        expected_claim_revision
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant admission issued identity is unavailable'
        USING ERRCODE = '23514';
    END IF;

    SELECT invite.*
    INTO invite_record
    FROM public."UserInvite" AS invite
    WHERE invite."tenantId" = tenant_id
      AND invite."id" = issue_command_record."inviteId"
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant admission issued identity is unavailable'
        USING ERRCODE = '23514';
    END IF;

    SELECT outbox.*
    INTO outbox_record
    FROM public."IdentityMailOutbox" AS outbox
    WHERE outbox."tenantId" = tenant_id
      AND outbox."id" = issue_command_record."outboxId"
      AND outbox."issueCommandId" = issue_command_record."id"
    FOR UPDATE;

    IF NOT FOUND
       OR issue_command_record."aadEnvironment" IS DISTINCT FROM
         environment_name
       OR issue_command_record."claimRevision" IS DISTINCT FROM
         expected_claim_revision + 1
       OR issue_command_record."template" IS DISTINCT FROM
         'INITIAL_OWNER_INVITE'::public."IdentityMailTemplate"
       OR issue_command_record."tokenDigestVersion" <> 'sha256-v1'
       OR issue_command_record."envelopeVersion" <> 1
       OR issue_command_record."keyVersion" <> 'v1'
       OR claim_record."subjectId" IS DISTINCT FROM
         issue_command_record."inviteId"
       OR claim_record."revision" IS DISTINCT FROM
         issue_command_record."claimRevision"
       OR invite_record."email" IS DISTINCT FROM
         claim_record."emailCanonical"
       OR invite_record."fullName" IS NOT NULL
       OR invite_record."role" IS DISTINCT FROM
         'OWNER'::public."UserRole"
       OR invite_record."accessScope" IS DISTINCT FROM
         'NETWORK'::public."UserAccessScope"
       OR invite_record."customRoleId" IS NOT NULL
       OR COALESCE(
         pg_catalog.cardinality(invite_record."storeIds"),
         -1
       ) <> 0
       OR invite_record."tokenHash" IS DISTINCT FROM
         issue_command_record."tokenHash"
       OR invite_record."expiresAt" IS DISTINCT FROM
         (
           issue_command_record."expiresAt" AT TIME ZONE 'UTC'
         )
       OR invite_record."acceptedAt" IS NOT NULL
       OR invite_record."acceptedByUserId" IS NOT NULL
       OR invite_record."createdByUserId" IS NOT NULL
       OR invite_record."revokedAt" IS NOT NULL
       OR invite_record."revokedByUserId" IS NOT NULL
       OR invite_record."identityClaimRevision" IS DISTINCT FROM
         issue_command_record."claimRevision"
       OR invite_record."createdAt" IS DISTINCT FROM
         (
           issue_command_record."createdAt" AT TIME ZONE 'UTC'
         )
       OR invite_record."updatedAt" IS DISTINCT FROM
         (
           issue_command_record."createdAt" AT TIME ZONE 'UTC'
         )
       OR outbox_record."inviteId" IS DISTINCT FROM
         issue_command_record."inviteId"
       OR outbox_record."workflowLocator" IS DISTINCT FROM
         issue_command_record."workflowLocator"
       OR outbox_record."aadEnvironment" IS DISTINCT FROM
         issue_command_record."aadEnvironment"
       OR outbox_record."template" IS DISTINCT FROM
         issue_command_record."template"
       OR outbox_record."status" IS DISTINCT FROM
         'HOLD'::public."IdentityMailOutboxStatus"
       OR outbox_record."messageKey" IS DISTINCT FROM
         issue_command_record."messageKey"
       OR outbox_record."issueRequestDigest" IS DISTINCT FROM
         issue_command_record."issueRequestDigest"
       OR outbox_record."tokenHash" IS DISTINCT FROM
         issue_command_record."tokenHash"
       OR outbox_record."tokenDigestVersion" IS DISTINCT FROM
         issue_command_record."tokenDigestVersion"
       OR outbox_record."secretCiphertext" IS NULL
       OR pg_catalog.octet_length(
         outbox_record."secretCiphertext"
       ) <> 71
       OR outbox_record."envelopeVersion" IS DISTINCT FROM
         issue_command_record."envelopeVersion"
       OR outbox_record."keyVersion" IS DISTINCT FROM
         issue_command_record."keyVersion"
       OR outbox_record."expiresAt" IS DISTINCT FROM
         issue_command_record."expiresAt"
       OR outbox_record."createdAt" IS DISTINCT FROM
         issue_command_record."createdAt"
    THEN
      RAISE EXCEPTION 'Tenant admission issued identity is unavailable'
        USING ERRCODE = '23514';
    END IF;

    identity_state := 'ISSUED_HOLD';
  END IF;

  PERFORM 1
  FROM public."TenantAdmissionDecisionGate" AS decision_gate
  WHERE decision_gate."decisionId" = decision_id
  ORDER BY decision_gate."gateCode"::TEXT
  FOR UPDATE;

  PERFORM 1
  FROM public."ReleaseGateAttestation" AS attestation
  INNER JOIN public."TenantAdmissionDecisionGate" AS decision_gate
    ON decision_gate."attestationId" = attestation."id"
    AND decision_gate."gateCode" = attestation."gateCode"
  WHERE decision_gate."decisionId" = decision_id
  ORDER BY attestation."gateCode"::TEXT, attestation."id"
  FOR UPDATE OF attestation;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE attestation."stateRevision" =
          decision_gate."boundAttestationRevision"
        AND attestation."stateRevision" = 1
        AND attestation."revokedAt" IS NULL
        AND attestation."passedAt" <= decision_record."approvedAt"
        AND attestation."validUntil" >= decision_record."validUntil"
        AND attestation."releaseSha" = release_sha
        AND attestation."environment" = environment_name
        AND attestation."artifactDigest" = artifact_digest
        AND attestation."schemaHead" = schema_head
        AND attestation."migrationCount" = expected_migration_count
        AND attestation."policyManifestDigest" = policy_digest
        AND attestation."payloadDigest" =
          decision_gate."boundPayloadDigest"
        AND attestation."signatureAlgorithm" = 'Ed25519'
        AND attestation."signingKeyId" = decision_record."signingKeyId"
        AND attestation."publicKeyFingerprint" =
          decision_record."publicKeyFingerprint"
    ),
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          'leetplus-shared-beta-gate-set-v1',
          'UTF8'
        )
        || '\x00'::BYTEA
        ||
        pg_catalog.convert_to(
          pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'gateCode', decision_gate."gateCode"::TEXT,
              'attestationId', decision_gate."attestationId",
              'payloadDigest', decision_gate."boundPayloadDigest"
            )
            ORDER BY decision_gate."gateCode"::TEXT
          )::TEXT,
          'UTF8'
        )
      ),
      'hex'
    )
  INTO link_count, valid_gate_count, actual_gate_set_digest
  FROM public."TenantAdmissionDecisionGate" AS decision_gate
  INNER JOIN public."ReleaseGateAttestation" AS attestation
    ON attestation."id" = decision_gate."attestationId"
    AND attestation."gateCode" = decision_gate."gateCode"
  WHERE decision_gate."decisionId" = decision_id;

  IF link_count <> 3
     OR valid_gate_count <> 3
     OR actual_gate_set_digest IS DISTINCT FROM gate_set_digest
     OR NOT EXISTS (
       SELECT 1
       FROM public."TenantAdmissionDecisionGate" AS required_gate
       WHERE required_gate."decisionId" = decision_id
         AND required_gate."gateCode" =
           'MODULE_POLICY_ENFORCED'::public."SharedBetaReleaseGateCode"
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public."TenantAdmissionDecisionGate" AS required_gate
       WHERE required_gate."decisionId" = decision_id
         AND required_gate."gateCode" =
           'EMAIL_INVITE_WORKFLOW_VERIFIED'::public."SharedBetaReleaseGateCode"
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public."TenantAdmissionDecisionGate" AS required_gate
       WHERE required_gate."decisionId" = decision_id
         AND required_gate."gateCode" =
           'POSTGRESQL_RELEASE_REHEARSAL_VERIFIED'::public."SharedBetaReleaseGateCode"
     )
  THEN
    RAISE EXCEPTION 'Tenant admission assertion denied'
      USING ERRCODE = '23514';
  END IF;

  PERFORM entitlement."id"
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = tenant_id
  ORDER BY entitlement."module"::TEXT
  FOR UPDATE;

  -- Every mutable dependency is now locked. Expiry decisions below must use
  -- this fresh wall clock, not the timestamp captured before lock waits.
  asserted_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  IF decision_record."validUntil" <= asserted_at
     OR EXISTS (
       SELECT 1
       FROM public."TenantAdmissionDecisionGate" AS decision_gate
       INNER JOIN public."ReleaseGateAttestation" AS attestation
         ON attestation."id" = decision_gate."attestationId"
         AND attestation."gateCode" = decision_gate."gateCode"
       WHERE decision_gate."decisionId" = decision_id
         AND (
           attestation."stateRevision" IS DISTINCT FROM
             decision_gate."boundAttestationRevision"
           OR attestation."revokedAt" IS NOT NULL
           OR attestation."validUntil" <= asserted_at
         )
     )
  THEN
    RAISE EXCEPTION 'Tenant admission assertion denied'
      USING ERRCODE = '23514';
  END IF;

  IF identity_state = 'ISSUED_HOLD'
     AND (
       issue_command_record."createdAt" > asserted_at
       OR issue_command_record."expiresAt" <= asserted_at
       OR invite_record."expiresAt" <=
         (asserted_at AT TIME ZONE 'UTC')
       OR outbox_record."expiresAt" <= asserted_at
     )
  THEN
    RAISE EXCEPTION 'Tenant admission issued identity is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(*) FILTER (
      WHERE entitlement."profileRevision" =
          expected_entitlement_profile_revision
        AND entitlement."readEnabled" = true
        AND entitlement."writeEnabled" = true
        AND entitlement."outboundEnabled" = false
        AND (
          entitlement."validFrom" IS NULL
          OR entitlement."validFrom" <= asserted_at
        )
        AND (
          entitlement."validUntil" IS NULL
          OR entitlement."validUntil" >= decision_record."validUntil"
        )
    )
  INTO entitlement_count, valid_entitlement_count
  FROM public."TenantModuleEntitlement" AS entitlement
  WHERE entitlement."tenantId" = tenant_id;

  actual_profile_digest :=
    public."shared_beta_tenant_profile_digest_v1"(
      tenant_id,
      expected_entitlement_profile_revision
    );

  IF entitlement_count <> 6
     OR valid_entitlement_count <> 6
     OR actual_profile_digest IS DISTINCT FROM profile_digest
  THEN
    RAISE EXCEPTION 'Tenant admission assertion denied'
      USING ERRCODE = '23514';
  END IF;

  assertion_receipt := pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'ASSERT_TENANT_ADMISSION_DECISION',
    'decision', 'ASSERTED',
    'tenantId', decision_record."tenantId",
    'decisionId', decision_record."id",
    'state', 'AVAILABLE',
    'stateRevision', decision_record."stateRevision",
    'expectedExecutionRevision',
      decision_record."expectedExecutionRevision",
    'expectedEntitlementProfileRevision',
      decision_record."expectedEntitlementProfileRevision",
    'gateCount', 3,
    'identityState', identity_state
  );

  IF identity_state = 'ISSUED_HOLD' THEN
    assertion_receipt := assertion_receipt ||
      pg_catalog.jsonb_build_object(
        'issueCommandId', issue_command_record."id",
        'inviteId', issue_command_record."inviteId",
        'outboxId', issue_command_record."outboxId"
      );
  END IF;

  RETURN assertion_receipt;
END;
$$;

CREATE FUNCTION public."shared_beta_tenant_admission_decision_revoke_v1"(
  expected_decision_id TEXT,
  expected_tenant_id TEXT,
  expected_state_revision INTEGER,
  revocation_reason_digest TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  decision_id TEXT;
  tenant_id TEXT;
  reason_digest TEXT;
  persisted public."TenantAdmissionDecision"%ROWTYPE;
  revoked_at TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  decision_id := pg_catalog.lower(
    pg_catalog.btrim(expected_decision_id) COLLATE "C"
  );
  tenant_id := pg_catalog.lower(
    pg_catalog.btrim(expected_tenant_id) COLLATE "C"
  );
  reason_digest := pg_catalog.btrim(revocation_reason_digest);

  IF decision_id IS NULL
     OR expected_decision_id IS DISTINCT FROM decision_id
     OR decision_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR tenant_id IS NULL
     OR expected_tenant_id IS DISTINCT FROM tenant_id
     OR tenant_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR expected_state_revision NOT IN (1, 2)
     OR reason_digest IS NULL
     OR revocation_reason_digest IS DISTINCT FROM reason_digest
     OR reason_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Tenant admission revocation input is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public."Tenant" AS tenant
  WHERE tenant."id" = tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant admission decision is unavailable'
      USING ERRCODE = '23514';
  END IF;

  SELECT decision.*
  INTO persisted
  FROM public."TenantAdmissionDecision" AS decision
  WHERE decision."id" = decision_id
    AND decision."tenantId" = tenant_id
  FOR UPDATE;

  IF NOT FOUND OR persisted."stateRevision" <> expected_state_revision THEN
    RAISE EXCEPTION 'Tenant admission decision state changed'
      USING ERRCODE = '40001';
  END IF;

  IF persisted."consumedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Tenant admission decision consumption is unsupported'
      USING ERRCODE = '55000';
  END IF;

  IF persisted."revokedAt" IS NOT NULL THEN
    IF persisted."revocationReasonDigest" IS DISTINCT FROM reason_digest THEN
      RAISE EXCEPTION 'Tenant admission decision revocation conflicts'
        USING ERRCODE = '23505';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'operation', 'REVOKE_TENANT_ADMISSION_DECISION',
      'decision', 'REPLAYED',
      'tenantId', persisted."tenantId",
      'decisionId', persisted."id",
      'state', 'REVOKED',
      'stateRevision', persisted."stateRevision"
    );
  END IF;

  revoked_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );

  UPDATE public."TenantAdmissionDecision"
  SET
    "stateRevision" = 2,
    "revokedAt" = revoked_at,
    "revocationReasonDigest" = reason_digest
  WHERE "id" = decision_id
    AND "tenantId" = tenant_id
    AND "stateRevision" = expected_state_revision
    AND "revokedAt" IS NULL
    AND "consumedAt" IS NULL
  RETURNING *
  INTO persisted;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant admission decision state changed'
      USING ERRCODE = '40001';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'operation', 'REVOKE_TENANT_ADMISSION_DECISION',
    'decision', 'REVOKED',
    'tenantId', persisted."tenantId",
    'decisionId', persisted."id",
    'state', 'REVOKED',
    'stateRevision', persisted."stateRevision"
  );
END;
$$;

COMMENT ON TABLE public."ReleaseGateAttestation" IS
  'Sealed externally verified Ed25519 release-gate provenance. Signed payload columns are immutable; only monotonic CAS revocation is supported.';

COMMENT ON TABLE public."TenantAdmissionDecision" IS
  'Sealed signed SHARED BETA GO authority bound to exact tenant identity, database, release, schema, profile, revisions, request and three-gate set. Migration 172 forbids consumption.';

COMMENT ON TABLE public."TenantAdmissionDecisionGate" IS
  'Immutable exact-code binding from one tenant GO decision to one signed gate attestation.';

COMMENT ON FUNCTION
  public."shared_beta_release_gate_attestation_persist_v1"(
    TEXT,
    public."SharedBetaReleaseGateCode",
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    JSONB,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    BYTEA,
    TIMESTAMP(3) WITH TIME ZONE,
    TIMESTAMP(3) WITH TIME ZONE
  ) IS
  'Private persistence half of the standalone pinned-root Ed25519 importer. It rebinds exact verified material but does not itself perform Ed25519 verification.';

COMMENT ON FUNCTION
  public."shared_beta_tenant_admission_decision_create_v1"(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    JSONB,
    TEXT,
    TEXT,
    TEXT,
    BYTEA,
    TIMESTAMP(3) WITH TIME ZONE,
    TIMESTAMP(3) WITH TIME ZONE,
    TEXT,
    TEXT,
    TEXT
  ) IS
  'Private create/replay primitive for signed tenant admission GO. No tenant, trial, invite, outbox, or provider state is mutated.';

COMMENT ON FUNCTION
  public."shared_beta_tenant_admission_decision_assert_v1"(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    INTEGER,
    TEXT,
    TEXT,
    INTEGER,
    INTEGER,
    TEXT,
    TEXT
  ) IS
  'Private PII-free exact assertion of one unconsumed signed tenant admission GO and its current three-gate/profile binding.';

REVOKE ALL
ON FUNCTION public."shared_beta_release_gate_attestation_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_admission_decision_guard_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_admission_gate_immutable_v1"()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_release_gate_attestation_persist_v1"(
  TEXT,
  public."SharedBetaReleaseGateCode",
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE,
  TIMESTAMP(3) WITH TIME ZONE
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_release_gate_attestation_revoke_v1"(
  TEXT,
  INTEGER,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_profile_digest_v1"(
  TEXT,
  INTEGER
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_admission_decision_create_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  BYTEA,
  TIMESTAMP(3) WITH TIME ZONE,
  TIMESTAMP(3) WITH TIME ZONE,
  TEXT,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_admission_decision_assert_v1"(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  INTEGER,
  INTEGER,
  TEXT,
  TEXT
)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public."shared_beta_tenant_admission_decision_revoke_v1"(
  TEXT,
  TEXT,
  INTEGER,
  TEXT
)
FROM PUBLIC;

REVOKE ALL ON TABLE public."ReleaseGateAttestation" FROM PUBLIC;
REVOKE ALL ON TABLE public."TenantAdmissionDecision" FROM PUBLIC;
REVOKE ALL ON TABLE public."TenantAdmissionDecisionGate" FROM PUBLIC;
REVOKE ALL ON TYPE public."SharedBetaReleaseGateCode" FROM PUBLIC;

-- REVOKE FROM PUBLIC is insufficient when an operator has installed hostile
-- ALTER DEFAULT PRIVILEGES for a named role. Abort this transactional
-- migration unless the new enum/table/column/function ACLs are owner-only.
DO $owner_only_acl$
DECLARE
  guarded_type_count INTEGER;
  guarded_table_count INTEGER;
  guarded_column_count INTEGER;
  guarded_function_count INTEGER;
  unsafe_acl_count INTEGER;
BEGIN
  SELECT pg_catalog.count(*)
  INTO guarded_type_count
  FROM pg_catalog.pg_type AS type
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = type.typnamespace
  WHERE namespace.nspname = 'public'
    AND type.typname = 'SharedBetaReleaseGateCode'
    AND type.typtype = 'e';

  SELECT pg_catalog.count(*)
  INTO guarded_table_count
  FROM pg_catalog.pg_class AS relation
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      'ReleaseGateAttestation',
      'TenantAdmissionDecision',
      'TenantAdmissionDecisionGate'
    );

  SELECT pg_catalog.count(*)
  INTO guarded_column_count
  FROM pg_catalog.pg_attribute AS attribute
  INNER JOIN pg_catalog.pg_class AS relation
    ON relation.oid = attribute.attrelid
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind = 'r'
    AND relation.relname IN (
      'ReleaseGateAttestation',
      'TenantAdmissionDecision',
      'TenantAdmissionDecisionGate'
    )
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  SELECT pg_catalog.count(*)
  INTO guarded_function_count
  FROM pg_catalog.pg_proc AS procedure
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'shared_beta_release_gate_attestation_guard_v1',
      'shared_beta_tenant_admission_decision_guard_v1',
      'shared_beta_tenant_admission_gate_immutable_v1',
      'shared_beta_release_gate_attestation_persist_v1',
      'shared_beta_release_gate_attestation_revoke_v1',
      'shared_beta_tenant_profile_digest_v1',
      'shared_beta_tenant_admission_decision_create_v1',
      'shared_beta_tenant_admission_decision_assert_v1',
      'shared_beta_tenant_admission_decision_revoke_v1'
    );

  IF guarded_type_count <> 1
     OR guarded_table_count <> 3
     OR guarded_column_count <> 64
     OR guarded_function_count <> 9
  THEN
    RAISE EXCEPTION 'Shared beta admission ACL inventory is incomplete'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)
  INTO unsafe_acl_count
  FROM (
    SELECT type.oid AS object_oid, acl.grantee
    FROM pg_catalog.pg_type AS type
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type.typnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        type.typacl,
        pg_catalog.acldefault('T', type.typowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND type.typname = 'SharedBetaReleaseGateCode'
      AND type.typtype = 'e'
      AND acl.grantee <> type.typowner

    UNION ALL

    SELECT relation.oid AS object_oid, acl.grantee
    FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname IN (
        'ReleaseGateAttestation',
        'TenantAdmissionDecision',
        'TenantAdmissionDecisionGate'
      )
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT attribute.attrelid AS object_oid, acl.grantee
    FROM pg_catalog.pg_attribute AS attribute
    INNER JOIN pg_catalog.pg_class AS relation
      ON relation.oid = attribute.attrelid
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relname IN (
        'ReleaseGateAttestation',
        'TenantAdmissionDecision',
        'TenantAdmissionDecisionGate'
      )
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.grantee <> relation.relowner

    UNION ALL

    SELECT procedure.oid AS object_oid, acl.grantee
    FROM pg_catalog.pg_proc AS procedure
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) AS acl
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'shared_beta_release_gate_attestation_guard_v1',
        'shared_beta_tenant_admission_decision_guard_v1',
        'shared_beta_tenant_admission_gate_immutable_v1',
        'shared_beta_release_gate_attestation_persist_v1',
        'shared_beta_release_gate_attestation_revoke_v1',
        'shared_beta_tenant_profile_digest_v1',
        'shared_beta_tenant_admission_decision_create_v1',
        'shared_beta_tenant_admission_decision_assert_v1',
        'shared_beta_tenant_admission_decision_revoke_v1'
      )
      AND acl.grantee <> procedure.proowner
  ) AS unsafe_acl;

  IF unsafe_acl_count <> 0 THEN
    RAISE EXCEPTION 'Shared beta admission objects require owner-only ACL'
      USING ERRCODE = '55000';
  END IF;
END;
$owner_only_acl$;

COMMIT;

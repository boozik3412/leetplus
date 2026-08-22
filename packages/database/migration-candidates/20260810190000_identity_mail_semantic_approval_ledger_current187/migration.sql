BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- CURRENT187-I is NONCANONICAL, DENY-ONLY and restricted to an explicitly
-- confirmed loopback disposable CI database. It is not a Prisma migration and
-- conveys no apply, tenant, tester, provider or production authority.

DO $current187_i_prerequisite$
DECLARE
  database_owner_oid OID;
  actor_oid OID;
  consumer_name TEXT;
  consumer_oid OID;
  revoker_name TEXT;
  revoker_oid OID;
  runtime_name TEXT;
  runtime_oid OID;
BEGIN
  IF pg_catalog.current_database() !~ '^lp_c187i_[0-9a-f]{12}_ci$'
     OR pg_catalog.current_setting(
       'leetplus.current187i_confirmation',
       true
     ) IS DISTINCT FROM
       'rehearse-current187i-semantic-approval-ledger-loopback-ci-only'
  THEN
    RAISE EXCEPTION
      'CURRENT187-I is restricted to an explicitly confirmed disposable CI database'
      USING ERRCODE = '55000';
  END IF;

  consumer_name := pg_catalog.current_setting(
    'leetplus.current187i_consumer_role_name',
    true
  );
  revoker_name := pg_catalog.current_setting(
    'leetplus.current187i_revoker_role_name',
    true
  );
  runtime_name := pg_catalog.current_setting(
    'leetplus.current187i_runtime_role_name',
    true
  );

  IF consumer_name IS NULL
     OR revoker_name IS NULL
     OR runtime_name IS NULL
     OR consumer_name !~ '^[a-z_][a-z0-9_]{2,62}$'
     OR revoker_name !~ '^[a-z_][a-z0-9_]{2,62}$'
     OR runtime_name !~ '^[a-z_][a-z0-9_]{2,62}$'
     OR consumer_name = revoker_name
     OR consumer_name = runtime_name
     OR revoker_name = runtime_name
  THEN
    RAISE EXCEPTION 'CURRENT187-I duty-role names are invalid'
      USING ERRCODE = '55000';
  END IF;

  SELECT database_entry.datdba
  INTO database_owner_oid
  FROM pg_catalog.pg_database AS database_entry
  WHERE database_entry.datname = pg_catalog.current_database();

  SELECT role_entry.oid
  INTO actor_oid
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = current_user;

  SELECT role_entry.oid
  INTO consumer_oid
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = consumer_name
    AND role_entry.rolcanlogin = true
    AND role_entry.rolsuper = false
    AND role_entry.rolcreatedb = false
    AND role_entry.rolcreaterole = false
    AND role_entry.rolreplication = false
    AND role_entry.rolbypassrls = false;

  SELECT role_entry.oid
  INTO revoker_oid
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = revoker_name
    AND role_entry.rolcanlogin = true
    AND role_entry.rolsuper = false
    AND role_entry.rolcreatedb = false
    AND role_entry.rolcreaterole = false
    AND role_entry.rolreplication = false
    AND role_entry.rolbypassrls = false;

  SELECT role_entry.oid
  INTO runtime_oid
  FROM pg_catalog.pg_roles AS role_entry
  WHERE role_entry.rolname = runtime_name
    AND role_entry.rolcanlogin = true
    AND role_entry.rolsuper = false
    AND role_entry.rolcreatedb = false
    AND role_entry.rolcreaterole = false
    AND role_entry.rolreplication = false
    AND role_entry.rolbypassrls = false;

  IF actor_oid IS DISTINCT FROM database_owner_oid
     OR consumer_oid IS NULL
     OR revoker_oid IS NULL
     OR runtime_oid IS NULL
     OR consumer_oid::TEXT IS DISTINCT FROM pg_catalog.current_setting(
       'leetplus.current187i_consumer_role_oid',
       true
     )
     OR revoker_oid::TEXT IS DISTINCT FROM pg_catalog.current_setting(
       'leetplus.current187i_revoker_role_oid',
       true
     )
     OR runtime_oid::TEXT IS DISTINCT FROM pg_catalog.current_setting(
       'leetplus.current187i_runtime_role_oid',
       true
     )
  THEN
    RAISE EXCEPTION
      'CURRENT187-I requires the database owner and exact unprivileged duty-role OIDs'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member IN (consumer_oid, revoker_oid, runtime_oid)
       OR membership.roleid IN (consumer_oid, revoker_oid, runtime_oid)
  )
  THEN
    RAISE EXCEPTION 'CURRENT187-I duty roles must have no memberships'
      USING ERRCODE = '55000';
  END IF;
END
$current187_i_prerequisite$;

CREATE TABLE public."Current187SemanticApprovalLedgerPolicy" (
  "singletonId" SMALLINT PRIMARY KEY,
  "contract" VARCHAR(72) NOT NULL,
  "consumerRoleName" VARCHAR(63) NOT NULL,
  "consumerRoleOid" OID NOT NULL,
  "revokerRoleName" VARCHAR(63) NOT NULL,
  "revokerRoleOid" OID NOT NULL,
  "runtimeRoleName" VARCHAR(63) NOT NULL,
  "runtimeRoleOid" OID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "Current187SemanticApprovalLedgerPolicy_singleton_check"
    CHECK ("singletonId" = 1),
  CONSTRAINT "Current187SemanticApprovalLedgerPolicy_contract_check"
    CHECK (
      "contract" = 'CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1'
    ),
  CONSTRAINT "Current187SemanticApprovalLedgerPolicy_role_names_check"
    CHECK (
      "consumerRoleName" <> "revokerRoleName"
      AND "consumerRoleName" <> "runtimeRoleName"
      AND "revokerRoleName" <> "runtimeRoleName"
    ),
  CONSTRAINT "Current187SemanticApprovalLedgerPolicy_role_oids_check"
    CHECK (
      "consumerRoleOid" <> "revokerRoleOid"
      AND "consumerRoleOid" <> "runtimeRoleOid"
      AND "revokerRoleOid" <> "runtimeRoleOid"
    )
);

INSERT INTO public."Current187SemanticApprovalLedgerPolicy" (
  "singletonId",
  "contract",
  "consumerRoleName",
  "consumerRoleOid",
  "revokerRoleName",
  "revokerRoleOid",
  "runtimeRoleName",
  "runtimeRoleOid"
)
SELECT
  1,
  'CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1',
  consumer.rolname,
  consumer.oid,
  revoker.rolname,
  revoker.oid,
  runtime.rolname,
  runtime.oid
FROM pg_catalog.pg_roles AS consumer
CROSS JOIN pg_catalog.pg_roles AS revoker
CROSS JOIN pg_catalog.pg_roles AS runtime
WHERE consumer.rolname = pg_catalog.current_setting(
    'leetplus.current187i_consumer_role_name'
  )
  AND revoker.rolname = pg_catalog.current_setting(
    'leetplus.current187i_revoker_role_name'
  )
  AND runtime.rolname = pg_catalog.current_setting(
    'leetplus.current187i_runtime_role_name'
  );

CREATE TABLE public."Current187SemanticApprovalConsumptionLedger" (
  "operationId" UUID PRIMARY KEY,
  "nonce" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "approvalDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "documentDigest" CHAR(64) COLLATE "C" NOT NULL,
  "evaluationDigest" CHAR(64) COLLATE "C" NOT NULL,
  "publicKeyFingerprint" CHAR(64) COLLATE "C" NOT NULL,
  "signingKeyId" VARCHAR(128) COLLATE "C" NOT NULL,
  "clusterIdentityDigest" CHAR(64) COLLATE "C" NOT NULL,
  "databaseUniverseDigest" CHAR(64) COLLATE "C" NOT NULL,
  "reviewEvidenceDigest" CHAR(64) COLLATE "C" NOT NULL,
  "semanticRiskFactsDigest" CHAR(64) COLLATE "C" NOT NULL,
  "policyRevision" INTEGER NOT NULL,
  "authorityIssuedAt" TIMESTAMPTZ(3) NOT NULL,
  "authorityValidUntil" TIMESTAMPTZ(3) NOT NULL,
  "authorityVerifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "documentApprovedAt" TIMESTAMPTZ(3) NOT NULL,
  "documentValidUntil" TIMESTAMPTZ(3) NOT NULL,
  "commandCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "commandDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "consumedAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedTransactionId" VARCHAR(20) COLLATE "C" NOT NULL,
  "receiptCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "receiptDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  CONSTRAINT "Current187SemanticApprovalConsumptionLedger_digest_check"
    CHECK (
      "nonce" ~ '^[0-9a-f]{64}$' AND "nonce" <> repeat('0', 64)
      AND "approvalDigest" ~ '^[0-9a-f]{64}$'
      AND "approvalDigest" <> repeat('0', 64)
      AND "documentDigest" ~ '^[0-9a-f]{64}$'
      AND "documentDigest" <> repeat('0', 64)
      AND "evaluationDigest" ~ '^[0-9a-f]{64}$'
      AND "evaluationDigest" <> repeat('0', 64)
      AND "publicKeyFingerprint" ~ '^[0-9a-f]{64}$'
      AND "publicKeyFingerprint" <> repeat('0', 64)
      AND "clusterIdentityDigest" ~ '^[0-9a-f]{64}$'
      AND "clusterIdentityDigest" <> repeat('0', 64)
      AND "databaseUniverseDigest" ~ '^[0-9a-f]{64}$'
      AND "databaseUniverseDigest" <> repeat('0', 64)
      AND "reviewEvidenceDigest" ~ '^[0-9a-f]{64}$'
      AND "reviewEvidenceDigest" <> repeat('0', 64)
      AND "semanticRiskFactsDigest" ~ '^[0-9a-f]{64}$'
      AND "semanticRiskFactsDigest" <> repeat('0', 64)
      AND "commandDigest" ~ '^[0-9a-f]{64}$'
      AND "commandDigest" <> repeat('0', 64)
      AND "receiptDigest" ~ '^[0-9a-f]{64}$'
      AND "receiptDigest" <> repeat('0', 64)
    ),
  CONSTRAINT "Current187SemanticApprovalConsumptionLedger_binding_check"
    CHECK (
      "signingKeyId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
      AND "policyRevision" BETWEEN 1 AND 1000000
      AND "authorityValidUntil" > "authorityIssuedAt"
      AND "authorityValidUntil" - "authorityIssuedAt" <= INTERVAL '5 minutes'
      AND "authorityVerifiedAt" >= "authorityIssuedAt"
      AND "authorityVerifiedAt" < "authorityValidUntil"
      AND "documentValidUntil" > "documentApprovedAt"
      AND "documentValidUntil" - "documentApprovedAt" <= INTERVAL '90 days'
    ),
  CONSTRAINT "Current187SemanticApprovalConsumptionLedger_secret_free_check"
    CHECK (
      octet_length("commandCanonicalJson") <= 16384
      AND octet_length("receiptCanonicalJson") <= 16384
      AND "commandCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
      AND "receiptCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
    )
);

CREATE INDEX "Current187SemanticApprovalConsumptionLedger_document_idx"
  ON public."Current187SemanticApprovalConsumptionLedger" (
    "documentDigest"
  );
CREATE INDEX "Current187SemanticApprovalConsumptionLedger_evaluation_idx"
  ON public."Current187SemanticApprovalConsumptionLedger" (
    "evaluationDigest"
  );
CREATE INDEX "Current187SemanticApprovalConsumptionLedger_root_idx"
  ON public."Current187SemanticApprovalConsumptionLedger" (
    "publicKeyFingerprint"
  );

CREATE TABLE public."Current187SemanticApprovalRevocationLedger" (
  "eventId" UUID PRIMARY KEY,
  "scope" VARCHAR(16) COLLATE "C" NOT NULL,
  "scopeDigest" CHAR(64) COLLATE "C" NOT NULL,
  "approvalDigest" CHAR(64) COLLATE "C" NOT NULL,
  "documentDigest" CHAR(64) COLLATE "C" NOT NULL,
  "evaluationDigest" CHAR(64) COLLATE "C" NOT NULL,
  "publicKeyFingerprint" CHAR(64) COLLATE "C" NOT NULL,
  "reasonDigest" CHAR(64) COLLATE "C" NOT NULL,
  "actorDigest" CHAR(64) COLLATE "C" NOT NULL,
  "revokedAt" TIMESTAMPTZ(3) NOT NULL,
  "commandCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "commandDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "revokedTransactionId" VARCHAR(20) COLLATE "C" NOT NULL,
  "receiptCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "receiptDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  CONSTRAINT "Current187SemanticApprovalRevocationLedger_scope_unique"
    UNIQUE ("scope", "scopeDigest"),
  CONSTRAINT "Current187SemanticApprovalRevocationLedger_scope_check"
    CHECK (
      "scope" IN ('APPROVAL', 'DOCUMENT', 'EVALUATION', 'ROOT')
      AND (
        ("scope" = 'APPROVAL' AND "scopeDigest" = "approvalDigest")
        OR ("scope" = 'DOCUMENT' AND "scopeDigest" = "documentDigest")
        OR ("scope" = 'EVALUATION' AND "scopeDigest" = "evaluationDigest")
        OR ("scope" = 'ROOT' AND "scopeDigest" = "publicKeyFingerprint")
      )
    ),
  CONSTRAINT "Current187SemanticApprovalRevocationLedger_digest_check"
    CHECK (
      "scopeDigest" ~ '^[0-9a-f]{64}$'
      AND "scopeDigest" <> repeat('0', 64)
      AND "approvalDigest" ~ '^[0-9a-f]{64}$'
      AND "approvalDigest" <> repeat('0', 64)
      AND "documentDigest" ~ '^[0-9a-f]{64}$'
      AND "documentDigest" <> repeat('0', 64)
      AND "evaluationDigest" ~ '^[0-9a-f]{64}$'
      AND "evaluationDigest" <> repeat('0', 64)
      AND "publicKeyFingerprint" ~ '^[0-9a-f]{64}$'
      AND "publicKeyFingerprint" <> repeat('0', 64)
      AND "reasonDigest" ~ '^[0-9a-f]{64}$'
      AND "reasonDigest" <> repeat('0', 64)
      AND "actorDigest" ~ '^[0-9a-f]{64}$'
      AND "actorDigest" <> repeat('0', 64)
      AND "commandDigest" ~ '^[0-9a-f]{64}$'
      AND "commandDigest" <> repeat('0', 64)
      AND "receiptDigest" ~ '^[0-9a-f]{64}$'
      AND "receiptDigest" <> repeat('0', 64)
    ),
  CONSTRAINT "Current187SemanticApprovalRevocationLedger_secret_free_check"
    CHECK (
      octet_length("commandCanonicalJson") <= 16384
      AND octet_length("receiptCanonicalJson") <= 16384
      AND "commandCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
      AND "receiptCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
    )
);

ALTER TABLE public."Current187SemanticApprovalLedgerPolicy"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Current187SemanticApprovalLedgerPolicy"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Current187SemanticApprovalConsumptionLedger"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Current187SemanticApprovalConsumptionLedger"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Current187SemanticApprovalRevocationLedger"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Current187SemanticApprovalRevocationLedger"
  FORCE ROW LEVEL SECURITY;

DO $current187_i_owner_policies$
DECLARE
  owner_name TEXT := current_user;
BEGIN
  EXECUTE pg_catalog.format(
    'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    'Current187SemanticApprovalLedgerPolicy_owner_only',
    'Current187SemanticApprovalLedgerPolicy',
    owner_name
  );
  EXECUTE pg_catalog.format(
    'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    'Current187SemanticApprovalConsumptionLedger_owner_only',
    'Current187SemanticApprovalConsumptionLedger',
    owner_name
  );
  EXECUTE pg_catalog.format(
    'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    'Current187SemanticApprovalRevocationLedger_owner_only',
    'Current187SemanticApprovalRevocationLedger',
    owner_name
  );
END
$current187_i_owner_policies$;

CREATE OR REPLACE FUNCTION public."current187_semantic_approval_ledger_reject_mutation_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $current187_i_reject_mutation$
BEGIN
  RAISE EXCEPTION 'CURRENT187-I ledger is append-only'
    USING ERRCODE = '55000';
END
$current187_i_reject_mutation$;

CREATE TRIGGER "Current187SemanticApprovalLedgerPolicy_no_update_delete"
BEFORE UPDATE OR DELETE ON public."Current187SemanticApprovalLedgerPolicy"
FOR EACH ROW EXECUTE FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187SemanticApprovalLedgerPolicy_no_truncate"
BEFORE TRUNCATE ON public."Current187SemanticApprovalLedgerPolicy"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187SemanticApprovalConsumptionLedger_no_update_delete"
BEFORE UPDATE OR DELETE ON public."Current187SemanticApprovalConsumptionLedger"
FOR EACH ROW EXECUTE FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187SemanticApprovalConsumptionLedger_no_truncate"
BEFORE TRUNCATE ON public."Current187SemanticApprovalConsumptionLedger"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187SemanticApprovalRevocationLedger_no_update_delete"
BEFORE UPDATE OR DELETE ON public."Current187SemanticApprovalRevocationLedger"
FOR EACH ROW EXECUTE FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187SemanticApprovalRevocationLedger_no_truncate"
BEFORE TRUNCATE ON public."Current187SemanticApprovalRevocationLedger"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"();

CREATE OR REPLACE FUNCTION public."current187_semantic_approval_consume_v1"(
  p_command_canonical_json TEXT,
  p_command_digest TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $current187_i_consume$
DECLARE
  v_policy RECORD;
  v_document JSONB;
  v_keys TEXT[];
  v_operation_id UUID;
  v_nonce TEXT;
  v_approval_digest TEXT;
  v_document_digest TEXT;
  v_evaluation_digest TEXT;
  v_public_key_fingerprint TEXT;
  v_signing_key_id TEXT;
  v_cluster_identity_digest TEXT;
  v_database_universe_digest TEXT;
  v_review_evidence_digest TEXT;
  v_semantic_risk_facts_digest TEXT;
  v_policy_revision INTEGER;
  v_authority_issued_at TIMESTAMPTZ;
  v_authority_valid_until TIMESTAMPTZ;
  v_authority_verified_at TIMESTAMPTZ;
  v_document_approved_at TIMESTAMPTZ;
  v_document_valid_until TIMESTAMPTZ;
  v_expected_command_canonical_json TEXT;
  v_now TIMESTAMPTZ;
  v_existing_count INTEGER;
  v_existing public."Current187SemanticApprovalConsumptionLedger"%ROWTYPE;
  v_consumed_at TIMESTAMPTZ;
  v_consumed_at_text TEXT;
  v_transaction_id TEXT;
  v_receipt_base TEXT;
  v_receipt_digest TEXT;
  v_receipt_text TEXT;
BEGIN
  SELECT * INTO STRICT v_policy
  FROM public."Current187SemanticApprovalLedgerPolicy"
  WHERE "singletonId" = 1;

  IF session_user IS DISTINCT FROM v_policy."consumerRoleName"
     OR (
       SELECT role_entry.oid
       FROM pg_catalog.pg_roles AS role_entry
       WHERE role_entry.rolname = session_user
     ) IS DISTINCT FROM v_policy."consumerRoleOid"
  THEN
    RAISE EXCEPTION 'CURRENT187-I consume caller is not the exact duty role'
      USING ERRCODE = '42501';
  END IF;

  IF p_command_canonical_json IS NULL
     OR p_command_digest IS NULL
     OR octet_length(p_command_canonical_json) > 16384
     OR p_command_canonical_json ~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
     OR p_command_digest !~ '^[0-9a-f]{64}$'
     OR p_command_digest = repeat('0', 64)
     OR pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           'LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_COMMAND_V1'
             || E'\n' || p_command_canonical_json,
           'UTF8'
         )
       ),
       'hex'
     ) IS DISTINCT FROM p_command_digest
  THEN
    RAISE EXCEPTION 'CURRENT187-I consumption command digest is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_document := p_command_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CURRENT187-I consumption command JSON is invalid'
      USING ERRCODE = '22023';
  END;

  SELECT pg_catalog.array_agg(key_name ORDER BY key_name COLLATE "C")
  INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_document) AS key_name;

  IF pg_catalog.jsonb_typeof(v_document) IS DISTINCT FROM 'object'
     OR v_keys IS DISTINCT FROM ARRAY[
       'approvalDigest',
       'authorityIssuedAt',
       'authorityValidUntil',
       'authorityVerificationMode',
       'authorityVerifiedAt',
       'clusterIdentityDigest',
       'contract',
       'databaseUniverseDigest',
       'documentApprovedAt',
       'documentDigest',
       'documentValidUntil',
       'environment',
       'evaluationDigest',
       'kind',
       'nonce',
       'operationId',
       'policyRevision',
       'profile',
       'publicKeyFingerprint',
       'reviewEvidenceDigest',
       'schemaVersion',
       'semanticRiskFactsDigest',
       'signingKeyId',
       'slice',
       'syntheticVerification'
     ]::TEXT[]
     OR v_document ->> 'contract' IS DISTINCT FROM
       'CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1'
     OR v_document ->> 'kind' IS DISTINCT FROM
       'CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_COMMAND'
     OR v_document ->> 'profile' IS DISTINCT FROM
       'CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1'
     OR v_document ->> 'slice' IS DISTINCT FROM
       'CURRENT187_I_PERSISTED_SEMANTIC_APPROVAL_CONSUMPTION_REVOCATION_LEDGER'
     OR v_document ->> 'environment' IS DISTINCT FROM 'ci'
     OR v_document ->> 'authorityVerificationMode' IS DISTINCT FROM
       'SYNTHETIC_LOOPBACK_CI'
     OR v_document -> 'schemaVersion' IS DISTINCT FROM '1'::JSONB
     OR v_document -> 'syntheticVerification' IS DISTINCT FROM 'true'::JSONB
     OR pg_catalog.jsonb_typeof(v_document -> 'policyRevision') IS DISTINCT FROM
       'number'
  THEN
    RAISE EXCEPTION 'CURRENT187-I consumption command contract is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (v_document ->> 'operationId') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR (v_document ->> 'policyRevision') !~ '^[1-9][0-9]{0,6}$'
  THEN
    RAISE EXCEPTION 'CURRENT187-I operation or revision is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_operation_id := (v_document ->> 'operationId')::UUID;
  v_nonce := v_document ->> 'nonce';
  v_approval_digest := v_document ->> 'approvalDigest';
  v_document_digest := v_document ->> 'documentDigest';
  v_evaluation_digest := v_document ->> 'evaluationDigest';
  v_public_key_fingerprint := v_document ->> 'publicKeyFingerprint';
  v_signing_key_id := v_document ->> 'signingKeyId';
  v_cluster_identity_digest := v_document ->> 'clusterIdentityDigest';
  v_database_universe_digest := v_document ->> 'databaseUniverseDigest';
  v_review_evidence_digest := v_document ->> 'reviewEvidenceDigest';
  v_semantic_risk_facts_digest := v_document ->> 'semanticRiskFactsDigest';
  v_policy_revision := (v_document ->> 'policyRevision')::INTEGER;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      v_nonce,
      v_approval_digest,
      v_document_digest,
      v_evaluation_digest,
      v_public_key_fingerprint,
      v_cluster_identity_digest,
      v_database_universe_digest,
      v_review_evidence_digest,
      v_semantic_risk_facts_digest
    ]) AS digest_value
    WHERE digest_value !~ '^[0-9a-f]{64}$'
       OR digest_value = repeat('0', 64)
  )
     OR v_signing_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
     OR (v_document ->> 'authorityIssuedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR (v_document ->> 'authorityValidUntil') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR (v_document ->> 'authorityVerifiedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR (v_document ->> 'documentApprovedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR (v_document ->> 'documentValidUntil') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  THEN
    RAISE EXCEPTION 'CURRENT187-I consumption binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_authority_issued_at :=
    (v_document ->> 'authorityIssuedAt')::TIMESTAMPTZ;
  v_authority_valid_until :=
    (v_document ->> 'authorityValidUntil')::TIMESTAMPTZ;
  v_authority_verified_at :=
    (v_document ->> 'authorityVerifiedAt')::TIMESTAMPTZ;
  v_document_approved_at :=
    (v_document ->> 'documentApprovedAt')::TIMESTAMPTZ;
  v_document_valid_until :=
    (v_document ->> 'documentValidUntil')::TIMESTAMPTZ;

  -- JSONB parsing alone would accept reordered or duplicate-key JSON. Rebuild
  -- the exact application canonical form from validated scalar values so the
  -- duty role cannot substitute a merely semantically equivalent document.
  v_expected_command_canonical_json :=
    '{"approvalDigest":'
    || pg_catalog.to_jsonb(v_approval_digest)::TEXT
    || ',"authorityIssuedAt":'
    || pg_catalog.to_jsonb(v_document ->> 'authorityIssuedAt')::TEXT
    || ',"authorityValidUntil":'
    || pg_catalog.to_jsonb(v_document ->> 'authorityValidUntil')::TEXT
    || ',"authorityVerificationMode":"SYNTHETIC_LOOPBACK_CI"'
    || ',"authorityVerifiedAt":'
    || pg_catalog.to_jsonb(v_document ->> 'authorityVerifiedAt')::TEXT
    || ',"clusterIdentityDigest":'
    || pg_catalog.to_jsonb(v_cluster_identity_digest)::TEXT
    || ',"contract":"CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1"'
    || ',"databaseUniverseDigest":'
    || pg_catalog.to_jsonb(v_database_universe_digest)::TEXT
    || ',"documentApprovedAt":'
    || pg_catalog.to_jsonb(v_document ->> 'documentApprovedAt')::TEXT
    || ',"documentDigest":'
    || pg_catalog.to_jsonb(v_document_digest)::TEXT
    || ',"documentValidUntil":'
    || pg_catalog.to_jsonb(v_document ->> 'documentValidUntil')::TEXT
    || ',"environment":"ci"'
    || ',"evaluationDigest":'
    || pg_catalog.to_jsonb(v_evaluation_digest)::TEXT
    || ',"kind":"CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_COMMAND"'
    || ',"nonce":' || pg_catalog.to_jsonb(v_nonce)::TEXT
    || ',"operationId":'
    || pg_catalog.to_jsonb(v_document ->> 'operationId')::TEXT
    || ',"policyRevision":' || v_policy_revision::TEXT
    || ',"profile":"CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1"'
    || ',"publicKeyFingerprint":'
    || pg_catalog.to_jsonb(v_public_key_fingerprint)::TEXT
    || ',"reviewEvidenceDigest":'
    || pg_catalog.to_jsonb(v_review_evidence_digest)::TEXT
    || ',"schemaVersion":1'
    || ',"semanticRiskFactsDigest":'
    || pg_catalog.to_jsonb(v_semantic_risk_facts_digest)::TEXT
    || ',"signingKeyId":' || pg_catalog.to_jsonb(v_signing_key_id)::TEXT
    || ',"slice":"CURRENT187_I_PERSISTED_SEMANTIC_APPROVAL_CONSUMPTION_REVOCATION_LEDGER"'
    || ',"syntheticVerification":true}';

  IF p_command_canonical_json IS DISTINCT FROM
     v_expected_command_canonical_json
  THEN
    RAISE EXCEPTION 'CURRENT187-I consumption command is not canonical'
      USING ERRCODE = '22023';
  END IF;

  -- Consume and revoke use the same total order. Existing rows are inspected
  -- only after every identity lock is held.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:root:' || v_public_key_fingerprint,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:approval:' || v_approval_digest,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:document:' || v_document_digest,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:evaluation:' || v_evaluation_digest,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:operation:' || v_operation_id::TEXT,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('current187i:nonce:' || v_nonce, 0)
  );

  -- An exact persisted row wins only as reconciliation of an already applied
  -- effect. A changed operation/nonce/approval identity remains a conflict.
  -- This check precedes new-authorization freshness so a lost response can be
  -- replayed byte-for-byte after later expiry or revocation.
  SELECT pg_catalog.count(*)::INTEGER
  INTO v_existing_count
  FROM public."Current187SemanticApprovalConsumptionLedger" AS consumption
  WHERE consumption."operationId" = v_operation_id
     OR consumption."nonce" = v_nonce
     OR consumption."approvalDigest" = v_approval_digest;

  IF v_existing_count > 0 THEN
    IF v_existing_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CURRENT187-I consumption identity conflict'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public."Current187SemanticApprovalConsumptionLedger" AS consumption
    WHERE consumption."operationId" = v_operation_id
       OR consumption."nonce" = v_nonce
       OR consumption."approvalDigest" = v_approval_digest
    FOR UPDATE;
    IF v_existing."operationId" IS DISTINCT FROM v_operation_id
       OR v_existing."nonce" IS DISTINCT FROM v_nonce
       OR v_existing."approvalDigest" IS DISTINCT FROM v_approval_digest
       OR v_existing."commandDigest" IS DISTINCT FROM p_command_digest
       OR v_existing."commandCanonicalJson" IS DISTINCT FROM
         p_command_canonical_json
    THEN
      RAISE EXCEPTION 'CURRENT187-I consumption identity conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing."receiptCanonicalJson";
  END IF;

  -- A command can expire while waiting. Fresh wall-clock state is read only
  -- after the complete lock chain has been acquired.
  v_now := pg_catalog.clock_timestamp();
  IF v_authority_issued_at > v_authority_verified_at
     OR v_authority_verified_at > v_now
     OR v_authority_valid_until <= v_now
     OR v_authority_valid_until <= v_authority_issued_at
     OR v_authority_valid_until - v_authority_issued_at > INTERVAL '5 minutes'
     OR v_document_approved_at > v_now
     OR v_document_valid_until <= v_now
     OR v_document_valid_until <= v_document_approved_at
     OR v_document_valid_until - v_document_approved_at > INTERVAL '90 days'
  THEN
    RAISE EXCEPTION 'CURRENT187-I semantic approval is expired'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Current187SemanticApprovalRevocationLedger" AS revocation
    WHERE (revocation."scope" = 'APPROVAL'
        AND revocation."scopeDigest" = v_approval_digest)
       OR (revocation."scope" = 'DOCUMENT'
        AND revocation."scopeDigest" = v_document_digest)
       OR (revocation."scope" = 'EVALUATION'
        AND revocation."scopeDigest" = v_evaluation_digest)
       OR (revocation."scope" = 'ROOT'
        AND revocation."scopeDigest" = v_public_key_fingerprint)
  )
  THEN
    RAISE EXCEPTION 'CURRENT187-I semantic approval is revoked'
      USING ERRCODE = '55000';
  END IF;

  v_consumed_at := pg_catalog.date_trunc(
    'milliseconds',
    pg_catalog.clock_timestamp()
  );
  v_consumed_at_text := pg_catalog.to_char(
    v_consumed_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  v_transaction_id := pg_catalog.txid_current()::TEXT;
  v_receipt_base :=
    '{"approvalDigest":' || pg_catalog.to_jsonb(v_approval_digest)::TEXT
    || ',"authorization":false'
    || ',"canApply":false'
    || ',"canMutate":false'
    || ',"canSend":false'
    || ',"commandDigest":' || pg_catalog.to_jsonb(p_command_digest)::TEXT
    || ',"consumedAt":' || pg_catalog.to_jsonb(v_consumed_at_text)::TEXT
    || ',"documentDigest":' || pg_catalog.to_jsonb(v_document_digest)::TEXT
    || ',"evaluationDigest":' || pg_catalog.to_jsonb(v_evaluation_digest)::TEXT
    || ',"kind":"CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_RECEIPT"'
    || ',"noncanonical":true'
    || ',"nonce":' || pg_catalog.to_jsonb(v_nonce)::TEXT
    || ',"operationId":' || pg_catalog.to_jsonb(v_operation_id::TEXT)::TEXT
    || ',"persistedConsumptionVerified":true'
    || ',"productionRootEnrolled":false'
    || ',"publicKeyFingerprint":'
    || pg_catalog.to_jsonb(v_public_key_fingerprint)::TEXT
    || ',"sharedBetaAccess":false'
    || ',"status":"CONSUMED"'
    || ',"syntheticLoopbackCiOnly":true'
    || ',"testAccessAuthorized":false'
    || ',"transactionId":' || pg_catalog.to_jsonb(v_transaction_id)::TEXT
    || '}';
  v_receipt_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_LEDGER_RECEIPT_V1'
          || E'\n' || v_receipt_base,
        'UTF8'
      )
    ),
    'hex'
  );
  v_receipt_text :=
    '{"approvalDigest":' || pg_catalog.to_jsonb(v_approval_digest)::TEXT
    || ',"authorization":false'
    || ',"canApply":false'
    || ',"canMutate":false'
    || ',"canSend":false'
    || ',"commandDigest":' || pg_catalog.to_jsonb(p_command_digest)::TEXT
    || ',"consumedAt":' || pg_catalog.to_jsonb(v_consumed_at_text)::TEXT
    || ',"documentDigest":' || pg_catalog.to_jsonb(v_document_digest)::TEXT
    || ',"evaluationDigest":' || pg_catalog.to_jsonb(v_evaluation_digest)::TEXT
    || ',"kind":"CURRENT187_SEMANTIC_APPROVAL_CONSUMPTION_RECEIPT"'
    || ',"noncanonical":true'
    || ',"nonce":' || pg_catalog.to_jsonb(v_nonce)::TEXT
    || ',"operationId":' || pg_catalog.to_jsonb(v_operation_id::TEXT)::TEXT
    || ',"persistedConsumptionVerified":true'
    || ',"productionRootEnrolled":false'
    || ',"publicKeyFingerprint":'
    || pg_catalog.to_jsonb(v_public_key_fingerprint)::TEXT
    || ',"receiptDigest":' || pg_catalog.to_jsonb(v_receipt_digest)::TEXT
    || ',"sharedBetaAccess":false'
    || ',"status":"CONSUMED"'
    || ',"syntheticLoopbackCiOnly":true'
    || ',"testAccessAuthorized":false'
    || ',"transactionId":' || pg_catalog.to_jsonb(v_transaction_id)::TEXT
    || '}';

  INSERT INTO public."Current187SemanticApprovalConsumptionLedger" (
    "operationId", "nonce", "approvalDigest", "documentDigest",
    "evaluationDigest", "publicKeyFingerprint", "signingKeyId",
    "clusterIdentityDigest", "databaseUniverseDigest",
    "reviewEvidenceDigest", "semanticRiskFactsDigest", "policyRevision",
    "authorityIssuedAt", "authorityValidUntil", "authorityVerifiedAt",
    "documentApprovedAt", "documentValidUntil", "commandCanonicalJson",
    "commandDigest", "consumedAt", "consumedTransactionId",
    "receiptCanonicalJson", "receiptDigest"
  ) VALUES (
    v_operation_id, v_nonce, v_approval_digest, v_document_digest,
    v_evaluation_digest, v_public_key_fingerprint, v_signing_key_id,
    v_cluster_identity_digest, v_database_universe_digest,
    v_review_evidence_digest, v_semantic_risk_facts_digest, v_policy_revision,
    v_authority_issued_at, v_authority_valid_until, v_authority_verified_at,
    v_document_approved_at, v_document_valid_until, p_command_canonical_json,
    p_command_digest, v_consumed_at, v_transaction_id, v_receipt_text,
    v_receipt_digest
  );

  RETURN v_receipt_text;
END
$current187_i_consume$;

CREATE OR REPLACE FUNCTION public."current187_semantic_approval_revoke_v1"(
  p_command_canonical_json TEXT,
  p_command_digest TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $current187_i_revoke$
DECLARE
  v_policy RECORD;
  v_document JSONB;
  v_keys TEXT[];
  v_event_id UUID;
  v_scope TEXT;
  v_scope_digest TEXT;
  v_approval_digest TEXT;
  v_document_digest TEXT;
  v_evaluation_digest TEXT;
  v_public_key_fingerprint TEXT;
  v_reason_digest TEXT;
  v_actor_digest TEXT;
  v_revoked_at TIMESTAMPTZ;
  v_revoked_at_text TEXT;
  v_expected_command_canonical_json TEXT;
  v_now TIMESTAMPTZ;
  v_existing_count INTEGER;
  v_existing public."Current187SemanticApprovalRevocationLedger"%ROWTYPE;
  v_transaction_id TEXT;
  v_receipt_base TEXT;
  v_receipt_digest TEXT;
  v_receipt_text TEXT;
BEGIN
  SELECT * INTO STRICT v_policy
  FROM public."Current187SemanticApprovalLedgerPolicy"
  WHERE "singletonId" = 1;

  IF session_user IS DISTINCT FROM v_policy."revokerRoleName"
     OR (
       SELECT role_entry.oid
       FROM pg_catalog.pg_roles AS role_entry
       WHERE role_entry.rolname = session_user
     ) IS DISTINCT FROM v_policy."revokerRoleOid"
  THEN
    RAISE EXCEPTION 'CURRENT187-I revoke caller is not the exact duty role'
      USING ERRCODE = '42501';
  END IF;

  IF p_command_canonical_json IS NULL
     OR p_command_digest IS NULL
     OR octet_length(p_command_canonical_json) > 16384
     OR p_command_canonical_json ~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
     OR p_command_digest !~ '^[0-9a-f]{64}$'
     OR p_command_digest = repeat('0', 64)
     OR pg_catalog.encode(
       pg_catalog.sha256(
         pg_catalog.convert_to(
           'LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_COMMAND_V1'
             || E'\n' || p_command_canonical_json,
           'UTF8'
         )
       ),
       'hex'
     ) IS DISTINCT FROM p_command_digest
  THEN
    RAISE EXCEPTION 'CURRENT187-I revocation command digest is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_document := p_command_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CURRENT187-I revocation command JSON is invalid'
      USING ERRCODE = '22023';
  END;

  SELECT pg_catalog.array_agg(key_name ORDER BY key_name COLLATE "C")
  INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_document) AS key_name;

  IF pg_catalog.jsonb_typeof(v_document) IS DISTINCT FROM 'object'
     OR v_keys IS DISTINCT FROM ARRAY[
       'actorDigest',
       'approvalDigest',
       'contract',
       'documentDigest',
       'environment',
       'evaluationDigest',
       'eventId',
       'kind',
       'profile',
       'publicKeyFingerprint',
       'purpose',
       'reasonDigest',
       'revokedAt',
       'schemaVersion',
       'scope',
       'scopeDigest',
       'slice',
       'trustDomain'
     ]::TEXT[]
     OR v_document ->> 'contract' IS DISTINCT FROM
       'CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1'
     OR v_document ->> 'kind' IS DISTINCT FROM
       'CURRENT187_SEMANTIC_APPROVAL_REVOCATION_COMMAND'
     OR v_document ->> 'profile' IS DISTINCT FROM
       'CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1'
     OR v_document ->> 'slice' IS DISTINCT FROM
       'CURRENT187_I_PERSISTED_SEMANTIC_APPROVAL_CONSUMPTION_REVOCATION_LEDGER'
     OR v_document ->> 'purpose' IS DISTINCT FROM
       'CURRENT187_SEMANTIC_APPROVAL_REVOCATION_V1'
     OR v_document ->> 'trustDomain' IS DISTINCT FROM
       'LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_AUTHORITY_V1'
     OR v_document ->> 'environment' IS DISTINCT FROM 'ci'
     OR v_document -> 'schemaVersion' IS DISTINCT FROM '1'::JSONB
     OR (v_document ->> 'eventId') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'CURRENT187-I revocation command contract is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_event_id := (v_document ->> 'eventId')::UUID;
  v_scope := v_document ->> 'scope';
  v_scope_digest := v_document ->> 'scopeDigest';
  v_approval_digest := v_document ->> 'approvalDigest';
  v_document_digest := v_document ->> 'documentDigest';
  v_evaluation_digest := v_document ->> 'evaluationDigest';
  v_public_key_fingerprint := v_document ->> 'publicKeyFingerprint';
  v_reason_digest := v_document ->> 'reasonDigest';
  v_actor_digest := v_document ->> 'actorDigest';

  IF v_scope NOT IN ('APPROVAL', 'DOCUMENT', 'EVALUATION', 'ROOT')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(ARRAY[
         v_scope_digest,
         v_approval_digest,
         v_document_digest,
         v_evaluation_digest,
         v_public_key_fingerprint,
         v_reason_digest,
         v_actor_digest
       ]) AS digest_value
       WHERE digest_value !~ '^[0-9a-f]{64}$'
          OR digest_value = repeat('0', 64)
     )
     OR (v_scope = 'APPROVAL'
       AND v_scope_digest IS DISTINCT FROM v_approval_digest)
     OR (v_scope = 'DOCUMENT'
       AND v_scope_digest IS DISTINCT FROM v_document_digest)
     OR (v_scope = 'EVALUATION'
       AND v_scope_digest IS DISTINCT FROM v_evaluation_digest)
     OR (v_scope = 'ROOT'
       AND v_scope_digest IS DISTINCT FROM v_public_key_fingerprint)
     OR (v_document ->> 'revokedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  THEN
    RAISE EXCEPTION 'CURRENT187-I revocation binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_revoked_at := (v_document ->> 'revokedAt')::TIMESTAMPTZ;

  -- Reject valid JSON that is not byte-for-byte the application canonical
  -- form, including reordered fields and duplicate-key substitution.
  v_expected_command_canonical_json :=
    '{"actorDigest":' || pg_catalog.to_jsonb(v_actor_digest)::TEXT
    || ',"approvalDigest":'
    || pg_catalog.to_jsonb(v_approval_digest)::TEXT
    || ',"contract":"CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1"'
    || ',"documentDigest":'
    || pg_catalog.to_jsonb(v_document_digest)::TEXT
    || ',"environment":"ci"'
    || ',"evaluationDigest":'
    || pg_catalog.to_jsonb(v_evaluation_digest)::TEXT
    || ',"eventId":'
    || pg_catalog.to_jsonb(v_document ->> 'eventId')::TEXT
    || ',"kind":"CURRENT187_SEMANTIC_APPROVAL_REVOCATION_COMMAND"'
    || ',"profile":"CURRENT187_SEMANTIC_APPROVAL_LEDGER_SYNTHETIC_CI_V1"'
    || ',"publicKeyFingerprint":'
    || pg_catalog.to_jsonb(v_public_key_fingerprint)::TEXT
    || ',"purpose":"CURRENT187_SEMANTIC_APPROVAL_REVOCATION_V1"'
    || ',"reasonDigest":' || pg_catalog.to_jsonb(v_reason_digest)::TEXT
    || ',"revokedAt":'
    || pg_catalog.to_jsonb(v_document ->> 'revokedAt')::TEXT
    || ',"schemaVersion":1'
    || ',"scope":' || pg_catalog.to_jsonb(v_scope)::TEXT
    || ',"scopeDigest":' || pg_catalog.to_jsonb(v_scope_digest)::TEXT
    || ',"slice":"CURRENT187_I_PERSISTED_SEMANTIC_APPROVAL_CONSUMPTION_REVOCATION_LEDGER"'
    || ',"trustDomain":"LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_AUTHORITY_V1"}';

  IF p_command_canonical_json IS DISTINCT FROM
     v_expected_command_canonical_json
  THEN
    RAISE EXCEPTION 'CURRENT187-I revocation command is not canonical'
      USING ERRCODE = '22023';
  END IF;

  -- Every scope takes the same four identity locks in the same order. This
  -- serializes scoped revocation with consumption without a deadlock cycle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:root:' || v_public_key_fingerprint,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:approval:' || v_approval_digest,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:document:' || v_document_digest,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187i:evaluation:' || v_evaluation_digest,
      0
    )
  );

  -- Exact persisted revocation replay is durable even after its command-time
  -- window closes. Changed event/scope identities remain conflicts.
  SELECT pg_catalog.count(*)::INTEGER
  INTO v_existing_count
  FROM public."Current187SemanticApprovalRevocationLedger" AS revocation
  WHERE revocation."eventId" = v_event_id
     OR (
       revocation."scope" = v_scope
       AND revocation."scopeDigest" = v_scope_digest
     );

  IF v_existing_count > 0 THEN
    IF v_existing_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CURRENT187-I revocation identity conflict'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public."Current187SemanticApprovalRevocationLedger" AS revocation
    WHERE revocation."eventId" = v_event_id
       OR (
         revocation."scope" = v_scope
         AND revocation."scopeDigest" = v_scope_digest
       )
    FOR UPDATE;
    IF v_existing."eventId" IS DISTINCT FROM v_event_id
       OR v_existing."scope" IS DISTINCT FROM v_scope
       OR v_existing."scopeDigest" IS DISTINCT FROM v_scope_digest
       OR v_existing."commandDigest" IS DISTINCT FROM p_command_digest
       OR v_existing."commandCanonicalJson" IS DISTINCT FROM
         p_command_canonical_json
    THEN
      RAISE EXCEPTION 'CURRENT187-I revocation identity conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing."receiptCanonicalJson";
  END IF;

  -- A new revocation is authorized only from fresh post-wait wall-clock state.
  v_now := pg_catalog.clock_timestamp();
  IF v_revoked_at > v_now + INTERVAL '15 seconds'
     OR v_revoked_at < v_now - INTERVAL '30 minutes'
  THEN
    RAISE EXCEPTION 'CURRENT187-I revocation time expired while waiting'
      USING ERRCODE = '55000';
  END IF;

  v_revoked_at_text := pg_catalog.to_char(
    v_revoked_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );
  v_transaction_id := pg_catalog.txid_current()::TEXT;
  v_receipt_base :=
    '{"approvalDigest":' || pg_catalog.to_jsonb(v_approval_digest)::TEXT
    || ',"authorization":false'
    || ',"canApply":false'
    || ',"canMutate":false'
    || ',"canSend":false'
    || ',"commandDigest":' || pg_catalog.to_jsonb(p_command_digest)::TEXT
    || ',"documentDigest":' || pg_catalog.to_jsonb(v_document_digest)::TEXT
    || ',"evaluationDigest":' || pg_catalog.to_jsonb(v_evaluation_digest)::TEXT
    || ',"eventId":' || pg_catalog.to_jsonb(v_event_id::TEXT)::TEXT
    || ',"kind":"CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT"'
    || ',"noncanonical":true'
    || ',"persistedRevocationVerified":true'
    || ',"productionRootEnrolled":false'
    || ',"publicKeyFingerprint":'
    || pg_catalog.to_jsonb(v_public_key_fingerprint)::TEXT
    || ',"revokedAt":' || pg_catalog.to_jsonb(v_revoked_at_text)::TEXT
    || ',"scope":' || pg_catalog.to_jsonb(v_scope)::TEXT
    || ',"scopeDigest":' || pg_catalog.to_jsonb(v_scope_digest)::TEXT
    || ',"sharedBetaAccess":false'
    || ',"status":"REVOKED"'
    || ',"syntheticLoopbackCiOnly":true'
    || ',"testAccessAuthorized":false'
    || ',"transactionId":' || pg_catalog.to_jsonb(v_transaction_id)::TEXT
    || '}';
  v_receipt_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT_V1'
          || E'\n' || v_receipt_base,
        'UTF8'
      )
    ),
    'hex'
  );
  v_receipt_text :=
    '{"approvalDigest":' || pg_catalog.to_jsonb(v_approval_digest)::TEXT
    || ',"authorization":false'
    || ',"canApply":false'
    || ',"canMutate":false'
    || ',"canSend":false'
    || ',"commandDigest":' || pg_catalog.to_jsonb(p_command_digest)::TEXT
    || ',"documentDigest":' || pg_catalog.to_jsonb(v_document_digest)::TEXT
    || ',"evaluationDigest":' || pg_catalog.to_jsonb(v_evaluation_digest)::TEXT
    || ',"eventId":' || pg_catalog.to_jsonb(v_event_id::TEXT)::TEXT
    || ',"kind":"CURRENT187_SEMANTIC_APPROVAL_REVOCATION_RECEIPT"'
    || ',"noncanonical":true'
    || ',"persistedRevocationVerified":true'
    || ',"productionRootEnrolled":false'
    || ',"publicKeyFingerprint":'
    || pg_catalog.to_jsonb(v_public_key_fingerprint)::TEXT
    || ',"receiptDigest":' || pg_catalog.to_jsonb(v_receipt_digest)::TEXT
    || ',"revokedAt":' || pg_catalog.to_jsonb(v_revoked_at_text)::TEXT
    || ',"scope":' || pg_catalog.to_jsonb(v_scope)::TEXT
    || ',"scopeDigest":' || pg_catalog.to_jsonb(v_scope_digest)::TEXT
    || ',"sharedBetaAccess":false'
    || ',"status":"REVOKED"'
    || ',"syntheticLoopbackCiOnly":true'
    || ',"testAccessAuthorized":false'
    || ',"transactionId":' || pg_catalog.to_jsonb(v_transaction_id)::TEXT
    || '}';

  INSERT INTO public."Current187SemanticApprovalRevocationLedger" (
    "eventId", "scope", "scopeDigest", "approvalDigest",
    "documentDigest", "evaluationDigest", "publicKeyFingerprint",
    "reasonDigest", "actorDigest", "revokedAt", "commandCanonicalJson",
    "commandDigest", "revokedTransactionId", "receiptCanonicalJson",
    "receiptDigest"
  ) VALUES (
    v_event_id, v_scope, v_scope_digest, v_approval_digest,
    v_document_digest, v_evaluation_digest, v_public_key_fingerprint,
    v_reason_digest, v_actor_digest, v_revoked_at, p_command_canonical_json,
    p_command_digest, v_transaction_id, v_receipt_text, v_receipt_digest
  );

  RETURN v_receipt_text;
END
$current187_i_revoke$;

REVOKE ALL ON TABLE
  public."Current187SemanticApprovalLedgerPolicy" FROM PUBLIC;
REVOKE ALL ON TABLE
  public."Current187SemanticApprovalConsumptionLedger" FROM PUBLIC;
REVOKE ALL ON TABLE
  public."Current187SemanticApprovalRevocationLedger" FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."current187_semantic_approval_ledger_reject_mutation_v1"()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."current187_semantic_approval_consume_v1"(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."current187_semantic_approval_revoke_v1"(TEXT, TEXT) FROM PUBLIC;

DO $current187_i_grants$
DECLARE
  consumer_name TEXT := pg_catalog.current_setting(
    'leetplus.current187i_consumer_role_name'
  );
  revoker_name TEXT := pg_catalog.current_setting(
    'leetplus.current187i_revoker_role_name'
  );
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT USAGE ON SCHEMA public TO %I',
    consumer_name
  );
  EXECUTE pg_catalog.format(
    'GRANT USAGE ON SCHEMA public TO %I',
    revoker_name
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION public.%I(text,text) TO %I',
    'current187_semantic_approval_consume_v1',
    consumer_name
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION public.%I(text,text) TO %I',
    'current187_semantic_approval_revoke_v1',
    revoker_name
  );
END
$current187_i_grants$;

COMMIT;

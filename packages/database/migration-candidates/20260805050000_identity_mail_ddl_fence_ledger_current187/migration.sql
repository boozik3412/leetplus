BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- CURRENT187-E is NONCANONICAL, DENY-ONLY and restricted to an explicitly
-- confirmed loopback disposable CI database. It is not a Prisma migration and
-- conveys no apply, send, tenant, tester, or production authority.

DO $current187_e_prerequisite$
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
  IF pg_catalog.current_database() !~ '^lp_c187e_[0-9a-f]{12}_ci$'
     OR pg_catalog.current_setting(
       'leetplus.current187e_confirmation',
       true
     ) IS DISTINCT FROM
       'rehearse-current187e-ddl-fence-ledger-loopback-ci-only'
  THEN
    RAISE EXCEPTION
      'CURRENT187-E is restricted to an explicitly confirmed disposable CI database'
      USING ERRCODE = '55000';
  END IF;

  consumer_name := pg_catalog.current_setting(
    'leetplus.current187e_consumer_role_name',
    true
  );
  revoker_name := pg_catalog.current_setting(
    'leetplus.current187e_revoker_role_name',
    true
  );
  runtime_name := pg_catalog.current_setting(
    'leetplus.current187e_runtime_role_name',
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
    RAISE EXCEPTION 'CURRENT187-E duty-role names are invalid'
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
       'leetplus.current187e_consumer_role_oid',
       true
     )
     OR revoker_oid::TEXT IS DISTINCT FROM pg_catalog.current_setting(
       'leetplus.current187e_revoker_role_oid',
       true
     )
     OR runtime_oid::TEXT IS DISTINCT FROM pg_catalog.current_setting(
       'leetplus.current187e_runtime_role_oid',
       true
     )
  THEN
    RAISE EXCEPTION
      'CURRENT187-E requires the database owner and exact unprivileged duty-role OIDs'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member IN (consumer_oid, revoker_oid, runtime_oid)
       OR membership.roleid IN (consumer_oid, revoker_oid, runtime_oid)
  )
  THEN
    RAISE EXCEPTION 'CURRENT187-E duty roles must have no memberships'
      USING ERRCODE = '55000';
  END IF;
END
$current187_e_prerequisite$;

CREATE TABLE public."Current187DdlFenceLedgerPolicy" (
  "singletonId" SMALLINT PRIMARY KEY,
  "contract" VARCHAR(64) NOT NULL,
  "consumerRoleName" VARCHAR(63) NOT NULL,
  "consumerRoleOid" OID NOT NULL,
  "revokerRoleName" VARCHAR(63) NOT NULL,
  "revokerRoleOid" OID NOT NULL,
  "runtimeRoleName" VARCHAR(63) NOT NULL,
  "runtimeRoleOid" OID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT "Current187DdlFenceLedgerPolicy_singleton_check"
    CHECK ("singletonId" = 1),
  CONSTRAINT "Current187DdlFenceLedgerPolicy_contract_check"
    CHECK ("contract" = 'CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1'),
  CONSTRAINT "Current187DdlFenceLedgerPolicy_role_names_check"
    CHECK (
      "consumerRoleName" <> "revokerRoleName"
      AND "consumerRoleName" <> "runtimeRoleName"
      AND "revokerRoleName" <> "runtimeRoleName"
    ),
  CONSTRAINT "Current187DdlFenceLedgerPolicy_role_oids_check"
    CHECK (
      "consumerRoleOid" <> "revokerRoleOid"
      AND "consumerRoleOid" <> "runtimeRoleOid"
      AND "revokerRoleOid" <> "runtimeRoleOid"
    )
);

INSERT INTO public."Current187DdlFenceLedgerPolicy" (
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
  'CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1',
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
    'leetplus.current187e_consumer_role_name'
  )
  AND revoker.rolname = pg_catalog.current_setting(
    'leetplus.current187e_revoker_role_name'
  )
  AND runtime.rolname = pg_catalog.current_setting(
    'leetplus.current187e_runtime_role_name'
  );

CREATE TABLE public."Current187DdlFenceConsumptionLedger" (
  "operationId" UUID PRIMARY KEY,
  "nonce" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "envelopeDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "attestationDigest" CHAR(64) COLLATE "C" NOT NULL,
  "payloadDigest" CHAR(64) COLLATE "C" NOT NULL,
  "publicKeyFingerprint" CHAR(64) COLLATE "C" NOT NULL,
  "signingKeyId" VARCHAR(128) COLLATE "C" NOT NULL,
  "purpose" VARCHAR(128) COLLATE "C" NOT NULL,
  "trustDomain" VARCHAR(128) COLLATE "C" NOT NULL,
  "releaseSha" CHAR(40) COLLATE "C" NOT NULL,
  "releasePolicyId" VARCHAR(128) COLLATE "C" NOT NULL,
  "releasePolicyDigest" CHAR(64) COLLATE "C" NOT NULL,
  "clusterIdentityDigest" CHAR(64) COLLATE "C" NOT NULL,
  "finalSnapshotDigest" CHAR(64) COLLATE "C" NOT NULL,
  "ddlFenceStateDigest" CHAR(64) COLLATE "C" NOT NULL,
  "issuedAt" TIMESTAMPTZ(3) NOT NULL,
  "validUntil" TIMESTAMPTZ(3) NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
  "commandCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "commandDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "consumedAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedTransactionId" VARCHAR(20) COLLATE "C" NOT NULL,
  "receiptCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "receiptDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  CONSTRAINT "Current187DdlFenceConsumptionLedger_digest_check"
    CHECK (
      "nonce" ~ '^[0-9a-f]{64}$' AND "nonce" <> repeat('0', 64)
      AND "envelopeDigest" ~ '^[0-9a-f]{64}$'
      AND "envelopeDigest" <> repeat('0', 64)
      AND "attestationDigest" ~ '^[0-9a-f]{64}$'
      AND "attestationDigest" <> repeat('0', 64)
      AND "payloadDigest" ~ '^[0-9a-f]{64}$'
      AND "payloadDigest" <> repeat('0', 64)
      AND "publicKeyFingerprint" ~ '^[0-9a-f]{64}$'
      AND "publicKeyFingerprint" <> repeat('0', 64)
      AND "releasePolicyDigest" ~ '^[0-9a-f]{64}$'
      AND "releasePolicyDigest" <> repeat('0', 64)
      AND "clusterIdentityDigest" ~ '^[0-9a-f]{64}$'
      AND "clusterIdentityDigest" <> repeat('0', 64)
      AND "finalSnapshotDigest" ~ '^[0-9a-f]{64}$'
      AND "finalSnapshotDigest" <> repeat('0', 64)
      AND "ddlFenceStateDigest" ~ '^[0-9a-f]{64}$'
      AND "ddlFenceStateDigest" <> repeat('0', 64)
      AND "commandDigest" ~ '^[0-9a-f]{64}$'
      AND "commandDigest" <> repeat('0', 64)
      AND "receiptDigest" ~ '^[0-9a-f]{64}$'
      AND "receiptDigest" <> repeat('0', 64)
    ),
  CONSTRAINT "Current187DdlFenceConsumptionLedger_binding_check"
    CHECK (
      "purpose" = 'CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1'
      AND "trustDomain" =
        'LEETPLUS_CURRENT187_INDEPENDENT_DDL_FENCE_AUTHORITY_V1'
      AND "releaseSha" ~ '^[0-9a-f]{40}$'
      AND "signingKeyId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
      AND "releasePolicyId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
      AND "validUntil" > "issuedAt"
      AND "validUntil" - "issuedAt" <= INTERVAL '2 minutes'
      AND "verifiedAt" >= "issuedAt"
      AND "verifiedAt" < "validUntil"
    ),
  CONSTRAINT "Current187DdlFenceConsumptionLedger_secret_free_check"
    CHECK (
      octet_length("commandCanonicalJson") <= 16384
      AND octet_length("receiptCanonicalJson") <= 16384
      AND "commandCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
      AND "receiptCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
    )
);

CREATE INDEX "Current187DdlFenceConsumptionLedger_attestation_idx"
  ON public."Current187DdlFenceConsumptionLedger" (
    "attestationDigest"
  );
CREATE INDEX "Current187DdlFenceConsumptionLedger_root_idx"
  ON public."Current187DdlFenceConsumptionLedger" (
    "publicKeyFingerprint"
  );

CREATE TABLE public."Current187DdlFenceRevocationLedger" (
  "eventId" UUID PRIMARY KEY,
  "scope" VARCHAR(16) COLLATE "C" NOT NULL,
  "scopeDigest" CHAR(64) COLLATE "C" NOT NULL,
  "sourceEnvelopeDigest" CHAR(64) COLLATE "C" NOT NULL,
  "attestationDigest" CHAR(64) COLLATE "C" NOT NULL,
  "publicKeyFingerprint" CHAR(64) COLLATE "C" NOT NULL,
  "reasonDigest" CHAR(64) COLLATE "C" NOT NULL,
  "actorDigest" CHAR(64) COLLATE "C" NOT NULL,
  "purpose" VARCHAR(128) COLLATE "C" NOT NULL,
  "trustDomain" VARCHAR(128) COLLATE "C" NOT NULL,
  "revokedAt" TIMESTAMPTZ(3) NOT NULL,
  "commandCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "commandDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  "revokedTransactionId" VARCHAR(20) COLLATE "C" NOT NULL,
  "receiptCanonicalJson" TEXT COLLATE "C" NOT NULL,
  "receiptDigest" CHAR(64) COLLATE "C" NOT NULL UNIQUE,
  CONSTRAINT "Current187DdlFenceRevocationLedger_scope_unique"
    UNIQUE ("scope", "scopeDigest"),
  CONSTRAINT "Current187DdlFenceRevocationLedger_scope_check"
    CHECK (
      "scope" IN ('ATTESTATION', 'ENVELOPE', 'ROOT')
      AND (
        ("scope" = 'ATTESTATION' AND "scopeDigest" = "attestationDigest")
        OR ("scope" = 'ENVELOPE' AND "scopeDigest" = "sourceEnvelopeDigest")
        OR ("scope" = 'ROOT' AND "scopeDigest" = "publicKeyFingerprint")
      )
    ),
  CONSTRAINT "Current187DdlFenceRevocationLedger_digest_check"
    CHECK (
      "scopeDigest" ~ '^[0-9a-f]{64}$'
      AND "scopeDigest" <> repeat('0', 64)
      AND "sourceEnvelopeDigest" ~ '^[0-9a-f]{64}$'
      AND "sourceEnvelopeDigest" <> repeat('0', 64)
      AND "attestationDigest" ~ '^[0-9a-f]{64}$'
      AND "attestationDigest" <> repeat('0', 64)
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
  CONSTRAINT "Current187DdlFenceRevocationLedger_binding_check"
    CHECK (
      "purpose" = 'CURRENT187_TECHNICAL_DDL_FENCE_REVOCATION_V1'
      AND "trustDomain" =
        'LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_AUTHORITY_V1'
    ),
  CONSTRAINT "Current187DdlFenceRevocationLedger_secret_free_check"
    CHECK (
      octet_length("commandCanonicalJson") <= 16384
      AND octet_length("receiptCanonicalJson") <= 16384
      AND "commandCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
      AND "receiptCanonicalJson" !~* '(@|BEGIN [A-Z ]+KEY|https?://|password|privateKey|secret|accessToken|refreshToken|providerMessageId)'
  )
);

ALTER TABLE public."Current187DdlFenceLedgerPolicy"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Current187DdlFenceLedgerPolicy"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Current187DdlFenceConsumptionLedger"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Current187DdlFenceConsumptionLedger"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public."Current187DdlFenceRevocationLedger"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Current187DdlFenceRevocationLedger"
  FORCE ROW LEVEL SECURITY;

DO $current187_e_owner_policies$
DECLARE
  owner_name TEXT := current_user;
BEGIN
  EXECUTE pg_catalog.format(
    'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    'Current187DdlFenceLedgerPolicy_owner_only',
    'Current187DdlFenceLedgerPolicy',
    owner_name
  );
  EXECUTE pg_catalog.format(
    'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    'Current187DdlFenceConsumptionLedger_owner_only',
    'Current187DdlFenceConsumptionLedger',
    owner_name
  );
  EXECUTE pg_catalog.format(
    'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO %I USING (true) WITH CHECK (true)',
    'Current187DdlFenceRevocationLedger_owner_only',
    'Current187DdlFenceRevocationLedger',
    owner_name
  );
END
$current187_e_owner_policies$;

CREATE OR REPLACE FUNCTION public."current187_ddl_fence_ledger_reject_mutation_v1"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $current187_e_reject_mutation$
BEGIN
  RAISE EXCEPTION 'CURRENT187-E ledger is append-only'
    USING ERRCODE = '55000';
END
$current187_e_reject_mutation$;

CREATE TRIGGER "Current187DdlFenceLedgerPolicy_no_update_delete"
BEFORE UPDATE OR DELETE ON public."Current187DdlFenceLedgerPolicy"
FOR EACH ROW EXECUTE FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187DdlFenceLedgerPolicy_no_truncate"
BEFORE TRUNCATE ON public."Current187DdlFenceLedgerPolicy"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187DdlFenceConsumptionLedger_no_update_delete"
BEFORE UPDATE OR DELETE ON public."Current187DdlFenceConsumptionLedger"
FOR EACH ROW EXECUTE FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187DdlFenceConsumptionLedger_no_truncate"
BEFORE TRUNCATE ON public."Current187DdlFenceConsumptionLedger"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187DdlFenceRevocationLedger_no_update_delete"
BEFORE UPDATE OR DELETE ON public."Current187DdlFenceRevocationLedger"
FOR EACH ROW EXECUTE FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"();
CREATE TRIGGER "Current187DdlFenceRevocationLedger_no_truncate"
BEFORE TRUNCATE ON public."Current187DdlFenceRevocationLedger"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"();

CREATE OR REPLACE FUNCTION public."current187_ddl_fence_consume_v1"(
  p_command_canonical_json TEXT,
  p_command_digest TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $current187_e_consume$
DECLARE
  v_policy RECORD;
  v_document JSONB;
  v_keys TEXT[];
  v_operation_id UUID;
  v_nonce TEXT;
  v_envelope_digest TEXT;
  v_attestation_digest TEXT;
  v_payload_digest TEXT;
  v_public_key_fingerprint TEXT;
  v_signing_key_id TEXT;
  v_release_sha TEXT;
  v_release_policy_id TEXT;
  v_release_policy_digest TEXT;
  v_cluster_identity_digest TEXT;
  v_final_snapshot_digest TEXT;
  v_ddl_fence_state_digest TEXT;
  v_issued_at TIMESTAMPTZ;
  v_valid_until TIMESTAMPTZ;
  v_verified_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_existing_count INTEGER;
  v_existing public."Current187DdlFenceConsumptionLedger"%ROWTYPE;
  v_consumed_at TIMESTAMPTZ;
  v_consumed_at_text TEXT;
  v_transaction_id TEXT;
  v_receipt_base JSONB;
  v_receipt_digest TEXT;
  v_receipt_text TEXT;
BEGIN
  SELECT * INTO STRICT v_policy
  FROM public."Current187DdlFenceLedgerPolicy"
  WHERE "singletonId" = 1;

  IF session_user IS DISTINCT FROM v_policy."consumerRoleName"
     OR (
       SELECT role_entry.oid
       FROM pg_catalog.pg_roles AS role_entry
       WHERE role_entry.rolname = session_user
     ) IS DISTINCT FROM v_policy."consumerRoleOid"
  THEN
    RAISE EXCEPTION 'CURRENT187-E consume caller is not the exact duty role'
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
           'LEETPLUS_CURRENT187_DDL_FENCE_CONSUMPTION_COMMAND_V1' || E'\n'
             || p_command_canonical_json,
           'UTF8'
         )
       ),
       'hex'
     ) IS DISTINCT FROM p_command_digest
  THEN
    RAISE EXCEPTION 'CURRENT187-E consumption command digest is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_document := p_command_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CURRENT187-E consumption command JSON is invalid'
      USING ERRCODE = '22023';
  END;

  SELECT pg_catalog.array_agg(key_name ORDER BY key_name COLLATE "C")
  INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_document) AS key_name;

  IF pg_catalog.jsonb_typeof(v_document) IS DISTINCT FROM 'object'
     OR v_keys IS DISTINCT FROM ARRAY[
       'attestationDigest',
       'attestationPurpose',
       'attestationTrustDomain',
       'clusterIdentityDigest',
       'contract',
       'ddlFenceStateDigest',
       'envelopeDigest',
       'environment',
       'finalSnapshotDigest',
       'issuedAt',
       'kind',
       'nonce',
       'operationId',
       'payloadDigest',
       'profile',
       'publicKeyFingerprint',
       'purpose',
       'releasePolicyDigest',
       'releasePolicyId',
       'releaseSha',
       'schemaVersion',
       'signingKeyId',
       'slice',
       'syntheticVerification',
       'validUntil',
       'verifiedAt'
     ]::TEXT[]
     OR v_document ->> 'contract' IS DISTINCT FROM
       'CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1'
     OR v_document ->> 'kind' IS DISTINCT FROM
       'CURRENT187_DDL_FENCE_CONSUMPTION_COMMAND'
     OR v_document ->> 'profile' IS DISTINCT FROM
       'CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1'
     OR v_document ->> 'slice' IS DISTINCT FROM
       'CURRENT187_E_PERSISTED_DDL_FENCE_CONSUMPTION_REVOCATION_LEDGER'
     OR v_document ->> 'purpose' IS DISTINCT FROM
       'CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1'
     OR v_document ->> 'attestationPurpose' IS DISTINCT FROM
       'CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1'
     OR v_document ->> 'attestationTrustDomain' IS DISTINCT FROM
       'LEETPLUS_CURRENT187_INDEPENDENT_DDL_FENCE_AUTHORITY_V1'
     OR v_document ->> 'environment' IS DISTINCT FROM 'ci'
     OR v_document -> 'schemaVersion' IS DISTINCT FROM '1'::JSONB
     OR v_document -> 'syntheticVerification' IS DISTINCT FROM 'true'::JSONB
  THEN
    RAISE EXCEPTION 'CURRENT187-E consumption command contract is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF (v_document ->> 'operationId') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'CURRENT187-E operation id is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_operation_id := (v_document ->> 'operationId')::UUID;
  v_nonce := v_document ->> 'nonce';
  v_envelope_digest := v_document ->> 'envelopeDigest';
  v_attestation_digest := v_document ->> 'attestationDigest';
  v_payload_digest := v_document ->> 'payloadDigest';
  v_public_key_fingerprint := v_document ->> 'publicKeyFingerprint';
  v_signing_key_id := v_document ->> 'signingKeyId';
  v_release_sha := v_document ->> 'releaseSha';
  v_release_policy_id := v_document ->> 'releasePolicyId';
  v_release_policy_digest := v_document ->> 'releasePolicyDigest';
  v_cluster_identity_digest := v_document ->> 'clusterIdentityDigest';
  v_final_snapshot_digest := v_document ->> 'finalSnapshotDigest';
  v_ddl_fence_state_digest := v_document ->> 'ddlFenceStateDigest';

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      v_nonce,
      v_envelope_digest,
      v_attestation_digest,
      v_payload_digest,
      v_public_key_fingerprint,
      v_release_policy_digest,
      v_cluster_identity_digest,
      v_final_snapshot_digest,
      v_ddl_fence_state_digest
    ]) AS digest_value
    WHERE digest_value !~ '^[0-9a-f]{64}$'
       OR digest_value = repeat('0', 64)
  )
     OR v_signing_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
     OR v_release_policy_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'
     OR v_release_sha !~ '^[0-9a-f]{40}$'
     OR (v_document ->> 'issuedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR (v_document ->> 'validUntil') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
     OR (v_document ->> 'verifiedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  THEN
    RAISE EXCEPTION 'CURRENT187-E consumption binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_issued_at := (v_document ->> 'issuedAt')::TIMESTAMPTZ;
  v_valid_until := (v_document ->> 'validUntil')::TIMESTAMPTZ;
  v_verified_at := (v_document ->> 'verifiedAt')::TIMESTAMPTZ;

  -- Shared transaction-lock order is root -> envelope -> attestation ->
  -- operation -> nonce. Any existing ledger row is locked only afterwards.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187e:root:' || v_public_key_fingerprint,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('current187e:envelope:' || v_envelope_digest, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187e:attestation:' || v_attestation_digest,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'current187e:operation:' || v_operation_id::TEXT,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('current187e:nonce:' || v_nonce, 0)
  );

  -- The command can expire while this transaction is waiting for any of the
  -- shared revocation locks. Read wall-clock time only after the full lock
  -- chain has been acquired so a stale pre-wait snapshot cannot authorize a
  -- consumption that is already expired.
  v_now := pg_catalog.clock_timestamp();
  IF v_valid_until <= v_now
     OR v_issued_at > v_now + INTERVAL '15 seconds'
     OR v_valid_until <= v_issued_at
     OR v_valid_until - v_issued_at > INTERVAL '2 minutes'
     OR v_verified_at < v_issued_at
     OR v_verified_at >= v_valid_until
  THEN
    RAISE EXCEPTION 'CURRENT187-E consumption command is expired'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."Current187DdlFenceRevocationLedger" AS revocation
    WHERE (revocation."scope" = 'ENVELOPE'
        AND revocation."scopeDigest" = v_envelope_digest)
       OR (revocation."scope" = 'ATTESTATION'
        AND revocation."scopeDigest" = v_attestation_digest)
       OR (revocation."scope" = 'ROOT'
        AND revocation."scopeDigest" = v_public_key_fingerprint)
  )
  THEN
    RAISE EXCEPTION 'CURRENT187-E attestation is revoked'
      USING ERRCODE = '55000';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_existing_count
  FROM public."Current187DdlFenceConsumptionLedger" AS consumption
  WHERE consumption."operationId" = v_operation_id
     OR consumption."nonce" = v_nonce
     OR consumption."envelopeDigest" = v_envelope_digest;

  IF v_existing_count > 0 THEN
    IF v_existing_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CURRENT187-E consumption identity conflict'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public."Current187DdlFenceConsumptionLedger" AS consumption
    WHERE consumption."operationId" = v_operation_id
       OR consumption."nonce" = v_nonce
       OR consumption."envelopeDigest" = v_envelope_digest
    FOR UPDATE;
    IF v_existing."operationId" IS DISTINCT FROM v_operation_id
       OR v_existing."nonce" IS DISTINCT FROM v_nonce
       OR v_existing."envelopeDigest" IS DISTINCT FROM v_envelope_digest
       OR v_existing."commandDigest" IS DISTINCT FROM p_command_digest
       OR v_existing."commandCanonicalJson" IS DISTINCT FROM
         p_command_canonical_json
    THEN
      RAISE EXCEPTION 'CURRENT187-E consumption identity conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing."receiptCanonicalJson";
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
  v_receipt_base := pg_catalog.jsonb_build_object(
    'attestationDigest', v_attestation_digest,
    'authorization', false,
    'canApply', false,
    'canMutate', false,
    'canSend', false,
    'commandDigest', p_command_digest,
    'consumedAt', v_consumed_at_text,
    'envelopeDigest', v_envelope_digest,
    'kind', 'CURRENT187_DDL_FENCE_CONSUMPTION_RECEIPT',
    'nonce', v_nonce,
    'noncanonical', true,
    'operationId', v_operation_id::TEXT,
    'persistedConsumptionVerified', true,
    'productionRootEnrolled', false,
    'sharedBetaAccess', false,
    'status', 'CONSUMED',
    'syntheticLoopbackCiOnly', true,
    'testAccessAuthorized', false,
    'transactionId', v_transaction_id
  );
  v_receipt_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_CURRENT187_DDL_FENCE_LEDGER_RECEIPT_V1' || E'\n'
          || pg_catalog.concat_ws(
            E'\n',
            'CURRENT187_DDL_FENCE_CONSUMPTION_RECEIPT',
            'CONSUMED',
            v_operation_id::TEXT,
            v_nonce,
            v_envelope_digest,
            v_attestation_digest,
            p_command_digest,
            v_consumed_at_text,
            v_transaction_id,
            'false', 'false', 'false', 'false', 'false', 'false', 'false',
            'true', 'true', 'true'
          ),
        'UTF8'
      )
    ),
    'hex'
  );
  v_receipt_text := (
    v_receipt_base || pg_catalog.jsonb_build_object(
      'receiptDigest',
      v_receipt_digest
    )
  )::TEXT;

  INSERT INTO public."Current187DdlFenceConsumptionLedger" (
    "operationId", "nonce", "envelopeDigest", "attestationDigest",
    "payloadDigest", "publicKeyFingerprint", "signingKeyId", "purpose",
    "trustDomain", "releaseSha", "releasePolicyId", "releasePolicyDigest",
    "clusterIdentityDigest", "finalSnapshotDigest", "ddlFenceStateDigest",
    "issuedAt", "validUntil", "verifiedAt", "commandCanonicalJson",
    "commandDigest", "consumedAt", "consumedTransactionId",
    "receiptCanonicalJson", "receiptDigest"
  ) VALUES (
    v_operation_id, v_nonce, v_envelope_digest, v_attestation_digest,
    v_payload_digest, v_public_key_fingerprint, v_signing_key_id,
    'CURRENT187_TECHNICAL_DDL_FENCE_ATTESTATION_V1',
    'LEETPLUS_CURRENT187_INDEPENDENT_DDL_FENCE_AUTHORITY_V1',
    v_release_sha, v_release_policy_id, v_release_policy_digest,
    v_cluster_identity_digest, v_final_snapshot_digest,
    v_ddl_fence_state_digest, v_issued_at, v_valid_until, v_verified_at,
    p_command_canonical_json, p_command_digest, v_consumed_at,
    v_transaction_id, v_receipt_text, v_receipt_digest
  );

  RETURN v_receipt_text;
END
$current187_e_consume$;

CREATE OR REPLACE FUNCTION public."current187_ddl_fence_revoke_v1"(
  p_command_canonical_json TEXT,
  p_command_digest TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $current187_e_revoke$
DECLARE
  v_policy RECORD;
  v_document JSONB;
  v_keys TEXT[];
  v_event_id UUID;
  v_scope TEXT;
  v_scope_digest TEXT;
  v_source_envelope_digest TEXT;
  v_attestation_digest TEXT;
  v_public_key_fingerprint TEXT;
  v_reason_digest TEXT;
  v_actor_digest TEXT;
  v_revoked_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ;
  v_existing_count INTEGER;
  v_existing public."Current187DdlFenceRevocationLedger"%ROWTYPE;
  v_transaction_id TEXT;
  v_receipt_base JSONB;
  v_receipt_digest TEXT;
  v_receipt_text TEXT;
BEGIN
  SELECT * INTO STRICT v_policy
  FROM public."Current187DdlFenceLedgerPolicy"
  WHERE "singletonId" = 1;

  IF session_user IS DISTINCT FROM v_policy."revokerRoleName"
     OR (
       SELECT role_entry.oid
       FROM pg_catalog.pg_roles AS role_entry
       WHERE role_entry.rolname = session_user
     ) IS DISTINCT FROM v_policy."revokerRoleOid"
  THEN
    RAISE EXCEPTION 'CURRENT187-E revoke caller is not the exact duty role'
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
           'LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_COMMAND_V1' || E'\n'
             || p_command_canonical_json,
           'UTF8'
         )
       ),
       'hex'
     ) IS DISTINCT FROM p_command_digest
  THEN
    RAISE EXCEPTION 'CURRENT187-E revocation command digest is invalid'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_document := p_command_canonical_json::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CURRENT187-E revocation command JSON is invalid'
      USING ERRCODE = '22023';
  END;

  SELECT pg_catalog.array_agg(key_name ORDER BY key_name COLLATE "C")
  INTO v_keys
  FROM pg_catalog.jsonb_object_keys(v_document) AS key_name;

  IF pg_catalog.jsonb_typeof(v_document) IS DISTINCT FROM 'object'
     OR v_keys IS DISTINCT FROM ARRAY[
       'actorDigest',
       'attestationDigest',
       'contract',
       'environment',
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
       'sourceEnvelopeDigest',
       'trustDomain'
     ]::TEXT[]
     OR v_document ->> 'contract' IS DISTINCT FROM
       'CURRENT187_CLUSTER_APPLICATION_ADMISSION_V1'
     OR v_document ->> 'kind' IS DISTINCT FROM
       'CURRENT187_DDL_FENCE_REVOCATION_COMMAND'
     OR v_document ->> 'profile' IS DISTINCT FROM
       'CURRENT187_DDL_FENCE_LEDGER_SYNTHETIC_CI_V1'
     OR v_document ->> 'slice' IS DISTINCT FROM
       'CURRENT187_E_PERSISTED_DDL_FENCE_CONSUMPTION_REVOCATION_LEDGER'
     OR v_document ->> 'purpose' IS DISTINCT FROM
       'CURRENT187_TECHNICAL_DDL_FENCE_REVOCATION_V1'
     OR v_document ->> 'trustDomain' IS DISTINCT FROM
       'LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_AUTHORITY_V1'
     OR v_document ->> 'environment' IS DISTINCT FROM 'ci'
     OR v_document -> 'schemaVersion' IS DISTINCT FROM '1'::JSONB
     OR (v_document ->> 'eventId') !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION 'CURRENT187-E revocation command contract is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_event_id := (v_document ->> 'eventId')::UUID;
  v_scope := v_document ->> 'scope';
  v_scope_digest := v_document ->> 'scopeDigest';
  v_source_envelope_digest := v_document ->> 'sourceEnvelopeDigest';
  v_attestation_digest := v_document ->> 'attestationDigest';
  v_public_key_fingerprint := v_document ->> 'publicKeyFingerprint';
  v_reason_digest := v_document ->> 'reasonDigest';
  v_actor_digest := v_document ->> 'actorDigest';

  IF v_scope NOT IN ('ATTESTATION', 'ENVELOPE', 'ROOT')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.unnest(ARRAY[
         v_scope_digest,
         v_source_envelope_digest,
         v_attestation_digest,
         v_public_key_fingerprint,
         v_reason_digest,
         v_actor_digest
       ]) AS digest_value
       WHERE digest_value !~ '^[0-9a-f]{64}$'
          OR digest_value = repeat('0', 64)
     )
     OR (v_scope = 'ENVELOPE'
       AND v_scope_digest IS DISTINCT FROM v_source_envelope_digest)
     OR (v_scope = 'ATTESTATION'
       AND v_scope_digest IS DISTINCT FROM v_attestation_digest)
     OR (v_scope = 'ROOT'
       AND v_scope_digest IS DISTINCT FROM v_public_key_fingerprint)
     OR (v_document ->> 'revokedAt') !~
       '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  THEN
    RAISE EXCEPTION 'CURRENT187-E revocation binding is invalid'
      USING ERRCODE = '22023';
  END IF;

  v_revoked_at := (v_document ->> 'revokedAt')::TIMESTAMPTZ;
  v_now := pg_catalog.clock_timestamp();
  IF v_revoked_at > v_now + INTERVAL '15 seconds'
     OR v_revoked_at < v_now - INTERVAL '30 minutes'
  THEN
    RAISE EXCEPTION 'CURRENT187-E revocation time is invalid'
      USING ERRCODE = '55000';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      CASE v_scope
        WHEN 'ENVELOPE' THEN 'current187e:envelope:'
        WHEN 'ATTESTATION' THEN 'current187e:attestation:'
        WHEN 'ROOT' THEN 'current187e:root:'
      END || v_scope_digest,
      0
    )
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_existing_count
  FROM public."Current187DdlFenceRevocationLedger" AS revocation
  WHERE revocation."eventId" = v_event_id
     OR (
       revocation."scope" = v_scope
       AND revocation."scopeDigest" = v_scope_digest
     );

  IF v_existing_count > 0 THEN
    IF v_existing_count IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'CURRENT187-E revocation identity conflict'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO STRICT v_existing
    FROM public."Current187DdlFenceRevocationLedger" AS revocation
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
      RAISE EXCEPTION 'CURRENT187-E revocation identity conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_existing."receiptCanonicalJson";
  END IF;

  v_transaction_id := pg_catalog.txid_current()::TEXT;
  v_receipt_base := pg_catalog.jsonb_build_object(
    'attestationDigest', v_attestation_digest,
    'authorization', false,
    'canApply', false,
    'canMutate', false,
    'canSend', false,
    'commandDigest', p_command_digest,
    'eventId', v_event_id::TEXT,
    'kind', 'CURRENT187_DDL_FENCE_REVOCATION_RECEIPT',
    'noncanonical', true,
    'persistedRevocationVerified', true,
    'productionRootEnrolled', false,
    'publicKeyFingerprint', v_public_key_fingerprint,
    'receiptDigest', '',
    'revokedAt', pg_catalog.to_char(
      v_revoked_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'scope', v_scope,
    'scopeDigest', v_scope_digest,
    'sharedBetaAccess', false,
    'sourceEnvelopeDigest', v_source_envelope_digest,
    'status', 'REVOKED',
    'syntheticLoopbackCiOnly', true,
    'testAccessAuthorized', false,
    'transactionId', v_transaction_id
  );
  v_receipt_digest := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        'LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_RECEIPT_V1' || E'\n'
          || pg_catalog.concat_ws(
            E'\n',
            v_event_id::TEXT,
            v_scope,
            v_scope_digest,
            v_source_envelope_digest,
            v_attestation_digest,
            v_public_key_fingerprint,
            p_command_digest,
            pg_catalog.to_char(
              v_revoked_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            v_transaction_id,
            'false', 'false', 'false', 'false', 'false', 'false', 'false',
            'true', 'true', 'true'
          ),
        'UTF8'
      )
    ),
    'hex'
  );
  v_receipt_text := (
    (v_receipt_base - 'receiptDigest') || pg_catalog.jsonb_build_object(
      'receiptDigest',
      v_receipt_digest
    )
  )::TEXT;

  INSERT INTO public."Current187DdlFenceRevocationLedger" (
    "eventId", "scope", "scopeDigest", "sourceEnvelopeDigest",
    "attestationDigest", "publicKeyFingerprint", "reasonDigest",
    "actorDigest", "purpose", "trustDomain", "revokedAt",
    "commandCanonicalJson", "commandDigest", "revokedTransactionId",
    "receiptCanonicalJson", "receiptDigest"
  ) VALUES (
    v_event_id, v_scope, v_scope_digest, v_source_envelope_digest,
    v_attestation_digest, v_public_key_fingerprint, v_reason_digest,
    v_actor_digest, 'CURRENT187_TECHNICAL_DDL_FENCE_REVOCATION_V1',
    'LEETPLUS_CURRENT187_DDL_FENCE_REVOCATION_AUTHORITY_V1', v_revoked_at,
    p_command_canonical_json, p_command_digest, v_transaction_id,
    v_receipt_text, v_receipt_digest
  );

  RETURN v_receipt_text;
END
$current187_e_revoke$;

REVOKE ALL ON TABLE public."Current187DdlFenceLedgerPolicy" FROM PUBLIC;
REVOKE ALL ON TABLE public."Current187DdlFenceConsumptionLedger" FROM PUBLIC;
REVOKE ALL ON TABLE public."Current187DdlFenceRevocationLedger" FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."current187_ddl_fence_ledger_reject_mutation_v1"() FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."current187_ddl_fence_consume_v1"(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public."current187_ddl_fence_revoke_v1"(TEXT, TEXT) FROM PUBLIC;

DO $current187_e_grants$
DECLARE
  consumer_name TEXT := pg_catalog.current_setting(
    'leetplus.current187e_consumer_role_name'
  );
  revoker_name TEXT := pg_catalog.current_setting(
    'leetplus.current187e_revoker_role_name'
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
    'current187_ddl_fence_consume_v1',
    consumer_name
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION public.%I(text,text) TO %I',
    'current187_ddl_fence_revoke_v1',
    revoker_name
  );
END
$current187_e_grants$;

COMMIT;

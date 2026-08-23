BEGIN;

CREATE TABLE public."LangameRuntimeTrustRegistrationV1" (
  "id" TEXT PRIMARY KEY,
  "registrationContract" TEXT NOT NULL,
  "registrationDigest" TEXT NOT NULL UNIQUE,
  "enrollmentPayloadDigest" TEXT NOT NULL UNIQUE,
  "protectedAcquisitionReceiptDigest" TEXT NOT NULL UNIQUE,
  "bootstrapRegistryContract" TEXT NOT NULL,
  "bootstrapRegistryDigest" TEXT NOT NULL,
  "candidateBundleDigest" TEXT NOT NULL,
  "clusterIdentityDigest" TEXT NOT NULL,
  "releaseSha" TEXT NOT NULL,
  "releaseArtifactDigest" TEXT NOT NULL,
  "runtimeConfigDigest" TEXT NOT NULL,
  "verifierArtifactDigest" TEXT NOT NULL,
  "databaseName" TEXT NOT NULL,
  "databaseOid" BIGINT NOT NULL,
  "ownerRoleName" TEXT NOT NULL,
  "ownerRoleOid" BIGINT NOT NULL,
  "runtimeRoleName" TEXT NOT NULL,
  "runtimeRoleOid" BIGINT NOT NULL,
  "enrollmentGeneration" INTEGER NOT NULL,
  "bootstrapSigningKeyId" TEXT NOT NULL,
  "bootstrapPublicKeyFingerprint" TEXT NOT NULL,
  "runtimeAttestationKeyId" TEXT NOT NULL,
  "runtimeAttestationPublicKeyFingerprint" TEXT NOT NULL,
  "runtimeAttestationPublicKeyBytesSha256" TEXT NOT NULL,
  "runtimeRevokeIntentKeyId" TEXT NOT NULL,
  "runtimeRevokeIntentPublicKeyFingerprint" TEXT NOT NULL,
  "runtimeRevokeIntentPublicKeyBytesSha256" TEXT NOT NULL,
  "tlsCaCertificateSha256" TEXT NOT NULL,
  "tlsEndpointHost" TEXT NOT NULL,
  "tlsEndpointPort" INTEGER NOT NULL,
  "tlsServerName" TEXT NOT NULL,
  "tlsLeafCertificateSha256" TEXT NOT NULL,
  "tlsLeafSpkiSha256" TEXT NOT NULL,
  "tlsLeafNotBefore" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "tlsLeafNotAfter" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "tlsMinimumProtocol" TEXT NOT NULL,
  "resolvedAddressSetDigest" TEXT NOT NULL,
  "tlsObservationDigest" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "collectedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "preparedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "registeredByRole" TEXT NOT NULL,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "langame_runtime_trust_registration_contract_check" CHECK (
    "registrationContract" = 'LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_V1'
    AND "bootstrapRegistryContract" =
      'LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_V1'
  ),
  CONSTRAINT "langame_runtime_trust_registration_status_check"
    CHECK ("status" IN ('PENDING', 'EXPIRED')),
  CONSTRAINT "langame_runtime_trust_registration_digest_check" CHECK (
    "registrationDigest" ~ '^[a-f0-9]{64}$'
    AND "enrollmentPayloadDigest" ~ '^[a-f0-9]{64}$'
    AND "protectedAcquisitionReceiptDigest" ~ '^[a-f0-9]{64}$'
    AND "bootstrapRegistryDigest" ~ '^[a-f0-9]{64}$'
    AND "candidateBundleDigest" ~ '^[a-f0-9]{64}$'
    AND "clusterIdentityDigest" ~ '^[a-f0-9]{64}$'
    AND "releaseArtifactDigest" ~ '^[a-f0-9]{64}$'
    AND "runtimeConfigDigest" ~ '^[a-f0-9]{64}$'
    AND "verifierArtifactDigest" ~ '^[a-f0-9]{64}$'
    AND "bootstrapPublicKeyFingerprint" ~ '^[a-f0-9]{64}$'
    AND "runtimeAttestationPublicKeyFingerprint" ~ '^[a-f0-9]{64}$'
    AND "runtimeAttestationPublicKeyBytesSha256" ~ '^[a-f0-9]{64}$'
    AND "runtimeRevokeIntentPublicKeyFingerprint" ~ '^[a-f0-9]{64}$'
    AND "runtimeRevokeIntentPublicKeyBytesSha256" ~ '^[a-f0-9]{64}$'
    AND "tlsCaCertificateSha256" ~ '^[a-f0-9]{64}$'
    AND "tlsLeafCertificateSha256" ~ '^[a-f0-9]{64}$'
    AND "tlsLeafSpkiSha256" ~ '^[a-f0-9]{64}$'
    AND "resolvedAddressSetDigest" ~ '^[a-f0-9]{64}$'
    AND "tlsObservationDigest" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "langame_runtime_trust_registration_digest_separation" CHECK (
    "registrationDigest" <> "enrollmentPayloadDigest"
    AND "registrationDigest" <> "protectedAcquisitionReceiptDigest"
    AND "enrollmentPayloadDigest" <> "protectedAcquisitionReceiptDigest"
    AND "runtimeAttestationPublicKeyFingerprint" <>
      "runtimeRevokeIntentPublicKeyFingerprint"
    AND "runtimeAttestationPublicKeyBytesSha256" <>
      "runtimeRevokeIntentPublicKeyBytesSha256"
  ),
  CONSTRAINT "langame_runtime_trust_registration_identity_check" CHECK (
    "id" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "releaseSha" ~ '^[a-f0-9]{40}$'
    AND "databaseName" ~ '^[a-z][a-z0-9_]{0,62}$'
    AND "databaseOid" BETWEEN 1 AND 4294967295
    AND "ownerRoleName" ~ '^[a-z_][a-z0-9_]{2,62}$'
    AND "ownerRoleOid" BETWEEN 1 AND 4294967295
    AND "runtimeRoleName" ~ '^[a-z_][a-z0-9_]{2,62}$'
    AND "runtimeRoleOid" BETWEEN 1 AND 4294967295
    AND "ownerRoleName" <> "runtimeRoleName"
    AND "ownerRoleOid" <> "runtimeRoleOid"
    AND "enrollmentGeneration" = 1
    AND "bootstrapSigningKeyId" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND "runtimeAttestationKeyId" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND "runtimeRevokeIntentKeyId" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND "bootstrapSigningKeyId" <> "runtimeAttestationKeyId"
    AND "bootstrapSigningKeyId" <> "runtimeRevokeIntentKeyId"
    AND "runtimeAttestationKeyId" <> "runtimeRevokeIntentKeyId"
  ),
  CONSTRAINT "langame_runtime_trust_registration_tls_check" CHECK (
    "tlsEndpointHost" ~
      '^(?=.{1,253}$)(?!-)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    AND "tlsServerName" ~
      '^(?=.{1,253}$)(?!-)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    AND "tlsEndpointPort" BETWEEN 1 AND 65535
    AND "tlsMinimumProtocol" IN ('TLSv1.2', 'TLSv1.3')
    AND "tlsLeafNotAfter" > "tlsLeafNotBefore"
  ),
  CONSTRAINT "langame_runtime_trust_registration_timeline_check" CHECK (
    "collectedAt" >= "issuedAt"
    AND "preparedAt" >= "collectedAt"
    AND "validUntil" > "preparedAt"
    AND "validUntil" <= "issuedAt" + INTERVAL '5 minutes'
  ),
  CONSTRAINT "langame_runtime_trust_registration_terminal_check" CHECK (
    ("status" = 'PENDING' AND "expiredAt" IS NULL)
    OR ("status" = 'EXPIRED' AND "expiredAt" IS NOT NULL)
  ),
  CONSTRAINT "langame_runtime_trust_registration_generation_unique"
    UNIQUE ("databaseOid", "enrollmentGeneration")
);

CREATE TABLE public."LangameRuntimeTrustRegistrationEventV1" (
  "id" TEXT PRIMARY KEY,
  "registrationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventDigest" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transactionId" TEXT NOT NULL,
  CONSTRAINT "langame_runtime_trust_registration_event_type_check"
    CHECK ("eventType" IN ('REGISTERED', 'EXPIRED')),
  CONSTRAINT "langame_runtime_trust_registration_event_digest_check"
    CHECK ("eventDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "langame_runtime_trust_registration_event_unique"
    UNIQUE ("registrationId", "eventType"),
  CONSTRAINT "langame_runtime_trust_registration_event_registration_fkey"
    FOREIGN KEY ("registrationId")
    REFERENCES public."LangameRuntimeTrustRegistrationV1"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "langame_runtime_trust_registration_status_valid_idx"
ON public."LangameRuntimeTrustRegistrationV1"("status", "validUntil");

CREATE FUNCTION public.langame_runtime_trust_registration_guard_current199_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
  writer TEXT := pg_catalog.current_setting(
    'leetplus.langame_runtime_current199_writer', TRUE
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CURRENT199 trust registrations are append-preserving'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(writer, '') <> 'expire' THEN
    RAISE EXCEPTION 'CURRENT199 trust registration writer is required'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."registrationContract" <> OLD."registrationContract"
     OR NEW."registrationDigest" <> OLD."registrationDigest"
     OR NEW."enrollmentPayloadDigest" <> OLD."enrollmentPayloadDigest"
     OR NEW."protectedAcquisitionReceiptDigest" <>
       OLD."protectedAcquisitionReceiptDigest"
     OR NEW."bootstrapRegistryContract" <> OLD."bootstrapRegistryContract"
     OR NEW."bootstrapRegistryDigest" <> OLD."bootstrapRegistryDigest"
     OR NEW."candidateBundleDigest" <> OLD."candidateBundleDigest"
     OR NEW."clusterIdentityDigest" <> OLD."clusterIdentityDigest"
     OR NEW."releaseSha" <> OLD."releaseSha"
     OR NEW."releaseArtifactDigest" <> OLD."releaseArtifactDigest"
     OR NEW."runtimeConfigDigest" <> OLD."runtimeConfigDigest"
     OR NEW."verifierArtifactDigest" <> OLD."verifierArtifactDigest"
     OR NEW."databaseName" <> OLD."databaseName"
     OR NEW."databaseOid" <> OLD."databaseOid"
     OR NEW."ownerRoleName" <> OLD."ownerRoleName"
     OR NEW."ownerRoleOid" <> OLD."ownerRoleOid"
     OR NEW."runtimeRoleName" <> OLD."runtimeRoleName"
     OR NEW."runtimeRoleOid" <> OLD."runtimeRoleOid"
     OR NEW."enrollmentGeneration" <> OLD."enrollmentGeneration"
     OR NEW."bootstrapSigningKeyId" <> OLD."bootstrapSigningKeyId"
     OR NEW."bootstrapPublicKeyFingerprint" <>
       OLD."bootstrapPublicKeyFingerprint"
     OR NEW."runtimeAttestationKeyId" <> OLD."runtimeAttestationKeyId"
     OR NEW."runtimeAttestationPublicKeyFingerprint" <>
       OLD."runtimeAttestationPublicKeyFingerprint"
     OR NEW."runtimeAttestationPublicKeyBytesSha256" <>
       OLD."runtimeAttestationPublicKeyBytesSha256"
     OR NEW."runtimeRevokeIntentKeyId" <> OLD."runtimeRevokeIntentKeyId"
     OR NEW."runtimeRevokeIntentPublicKeyFingerprint" <>
       OLD."runtimeRevokeIntentPublicKeyFingerprint"
     OR NEW."runtimeRevokeIntentPublicKeyBytesSha256" <>
       OLD."runtimeRevokeIntentPublicKeyBytesSha256"
     OR NEW."tlsCaCertificateSha256" <> OLD."tlsCaCertificateSha256"
     OR NEW."tlsEndpointHost" <> OLD."tlsEndpointHost"
     OR NEW."tlsEndpointPort" <> OLD."tlsEndpointPort"
     OR NEW."tlsServerName" <> OLD."tlsServerName"
     OR NEW."tlsLeafCertificateSha256" <>
       OLD."tlsLeafCertificateSha256"
     OR NEW."tlsLeafSpkiSha256" <> OLD."tlsLeafSpkiSha256"
     OR NEW."tlsLeafNotBefore" <> OLD."tlsLeafNotBefore"
     OR NEW."tlsLeafNotAfter" <> OLD."tlsLeafNotAfter"
     OR NEW."tlsMinimumProtocol" <> OLD."tlsMinimumProtocol"
     OR NEW."resolvedAddressSetDigest" <> OLD."resolvedAddressSetDigest"
     OR NEW."tlsObservationDigest" <> OLD."tlsObservationDigest"
     OR NEW."issuedAt" <> OLD."issuedAt"
     OR NEW."collectedAt" <> OLD."collectedAt"
     OR NEW."preparedAt" <> OLD."preparedAt"
     OR NEW."validUntil" <> OLD."validUntil"
     OR NEW."registeredByRole" <> OLD."registeredByRole"
     OR NEW."createdAt" <> OLD."createdAt"
     OR OLD."status" <> 'PENDING'
     OR NEW."status" <> 'EXPIRED'
     OR NEW."expiredAt" IS NULL
  THEN
    RAISE EXCEPTION 'Invalid CURRENT199 trust registration transition'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.langame_runtime_trust_registration_event_guard_current199_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $event_guard$
BEGIN
  RAISE EXCEPTION 'CURRENT199 trust registration events are append-only'
    USING ERRCODE = '42501';
END;
$event_guard$;

CREATE TRIGGER langame_runtime_trust_registration_guard_current199_v1
BEFORE UPDATE OR DELETE ON public."LangameRuntimeTrustRegistrationV1"
FOR EACH ROW EXECUTE FUNCTION
public.langame_runtime_trust_registration_guard_current199_v1();

CREATE TRIGGER langame_runtime_trust_registration_event_guard_current199_v1
BEFORE UPDATE OR DELETE ON public."LangameRuntimeTrustRegistrationEventV1"
FOR EACH ROW EXECUTE FUNCTION
public.langame_runtime_trust_registration_event_guard_current199_v1();

CREATE FUNCTION public.langame_runtime_trust_registration_register_current199_v1(
  registration_id TEXT,
  registration_contract TEXT,
  registration_digest TEXT,
  enrollment_payload_digest TEXT,
  protected_acquisition_receipt_digest TEXT,
  bootstrap_registry_contract TEXT,
  bootstrap_registry_digest TEXT,
  candidate_bundle_digest TEXT,
  cluster_identity_digest TEXT,
  release_sha TEXT,
  release_artifact_digest TEXT,
  runtime_config_digest TEXT,
  verifier_artifact_digest TEXT,
  target_database_name TEXT,
  target_database_oid BIGINT,
  owner_role_name TEXT,
  owner_role_oid BIGINT,
  runtime_role_name TEXT,
  runtime_role_oid BIGINT,
  enrollment_generation INTEGER,
  bootstrap_signing_key_id TEXT,
  bootstrap_public_key_fingerprint TEXT,
  runtime_attestation_key_id TEXT,
  runtime_attestation_public_key_fingerprint TEXT,
  runtime_attestation_public_key_bytes_sha256 TEXT,
  runtime_revoke_intent_key_id TEXT,
  runtime_revoke_intent_public_key_fingerprint TEXT,
  runtime_revoke_intent_public_key_bytes_sha256 TEXT,
  tls_ca_certificate_sha256 TEXT,
  tls_endpoint_host TEXT,
  tls_endpoint_port INTEGER,
  tls_server_name TEXT,
  tls_leaf_certificate_sha256 TEXT,
  tls_leaf_spki_sha256 TEXT,
  tls_leaf_not_before TIMESTAMP(3) WITH TIME ZONE,
  tls_leaf_not_after TIMESTAMP(3) WITH TIME ZONE,
  tls_minimum_protocol TEXT,
  resolved_address_set_digest TEXT,
  tls_observation_digest TEXT,
  issued_at TIMESTAMP(3) WITH TIME ZONE,
  collected_at TIMESTAMP(3) WITH TIME ZONE,
  prepared_at TIMESTAMP(3) WITH TIME ZONE,
  valid_until TIMESTAMP(3) WITH TIME ZONE,
  synthetic_only BOOLEAN
)
RETURNS TABLE (
  "registrationId" TEXT,
  "status" TEXT,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $register$
DECLARE
  existing public."LangameRuntimeTrustRegistrationV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE;
  live_database_oid BIGINT;
  live_database_owner_oid BIGINT;
  live_owner_oid BIGINT;
  live_runtime_oid BIGINT;
  live_runtime_can_login BOOLEAN;
  live_runtime_inherit BOOLEAN;
  live_runtime_superuser BOOLEAN;
  live_runtime_create_database BOOLEAN;
  live_runtime_create_role BOOLEAN;
  live_runtime_replication BOOLEAN;
  live_runtime_bypass_rls BOOLEAN;
  live_runtime_membership_count BIGINT;
  existing_found BOOLEAN;
BEGIN
  IF synthetic_only IS DISTINCT FROM FALSE
     OR registration_contract <>
       'LANGAME_RUNTIME_TRUST_REGISTRATION_CURRENT199_V1'
     OR bootstrap_registry_contract <>
       'LANGAME_RUNTIME_TRUST_BOOTSTRAP_REGISTRY_CURRENT198_V1'
     OR enrollment_generation <> 1
     OR registration_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR registration_digest !~ '^[a-f0-9]{64}$'
     OR enrollment_payload_digest !~ '^[a-f0-9]{64}$'
     OR protected_acquisition_receipt_digest !~ '^[a-f0-9]{64}$'
     OR registration_digest IN (
       enrollment_payload_digest, protected_acquisition_receipt_digest
     )
     OR enrollment_payload_digest = protected_acquisition_receipt_digest
     OR release_sha !~ '^[a-f0-9]{40}$'
     OR valid_until <= prepared_at
     OR prepared_at < collected_at
     OR collected_at < issued_at
     OR valid_until > issued_at + INTERVAL '5 minutes'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT199 trust registration'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_database_oid::TEXT || ':' || enrollment_generation::TEXT,
      199
    )
  );
  SELECT candidate.* INTO existing
  FROM public."LangameRuntimeTrustRegistrationV1" AS candidate
  WHERE candidate."id" = registration_id
     OR candidate."registrationDigest" = registration_digest
     OR candidate."enrollmentPayloadDigest" = enrollment_payload_digest
     OR candidate."protectedAcquisitionReceiptDigest" =
       protected_acquisition_receipt_digest
     OR (candidate."databaseOid" = target_database_oid
       AND candidate."enrollmentGeneration" = enrollment_generation)
  FOR UPDATE;
  existing_found := FOUND;

  SELECT database_object.oid::BIGINT, database_object.datdba::BIGINT
  INTO live_database_oid, live_database_owner_oid
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database();
  SELECT role_object.oid::BIGINT INTO live_owner_oid
  FROM pg_catalog.pg_roles AS role_object
  WHERE role_object.rolname = CURRENT_USER;
  SELECT role_object.oid::BIGINT, role_object.rolcanlogin,
    role_object.rolinherit, role_object.rolsuper,
    role_object.rolcreatedb, role_object.rolcreaterole,
    role_object.rolreplication, role_object.rolbypassrls
  INTO live_runtime_oid, live_runtime_can_login, live_runtime_inherit,
    live_runtime_superuser, live_runtime_create_database,
    live_runtime_create_role, live_runtime_replication,
    live_runtime_bypass_rls
  FROM pg_catalog.pg_roles AS role_object
  WHERE role_object.rolname = runtime_role_name;
  SELECT pg_catalog.count(*)::BIGINT INTO live_runtime_membership_count
  FROM pg_catalog.pg_auth_members AS membership
  WHERE membership.member = live_runtime_oid
     OR membership.roleid = live_runtime_oid;
  IF target_database_name <> pg_catalog.current_database()
     OR target_database_oid <> live_database_oid
     OR live_database_owner_oid <> live_owner_oid
     OR owner_role_name <> CURRENT_USER
     OR owner_role_name <> SESSION_USER
     OR owner_role_oid <> live_owner_oid
     OR live_runtime_oid IS NULL
     OR runtime_role_oid <> live_runtime_oid
     OR live_runtime_can_login IS DISTINCT FROM TRUE
     OR live_runtime_inherit IS DISTINCT FROM FALSE
     OR live_runtime_superuser IS DISTINCT FROM FALSE
     OR live_runtime_create_database IS DISTINCT FROM FALSE
     OR live_runtime_create_role IS DISTINCT FROM FALSE
     OR live_runtime_replication IS DISTINCT FROM FALSE
     OR live_runtime_bypass_rls IS DISTINCT FROM FALSE
     OR live_runtime_membership_count <> 0
  THEN
    RAISE EXCEPTION 'CURRENT199 live database or role identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF existing_found THEN
    IF existing."id" = registration_id
       AND existing."registrationContract" = registration_contract
       AND existing."registrationDigest" = registration_digest
       AND existing."enrollmentPayloadDigest" = enrollment_payload_digest
       AND existing."protectedAcquisitionReceiptDigest" =
         protected_acquisition_receipt_digest
       AND existing."bootstrapRegistryContract" = bootstrap_registry_contract
       AND existing."bootstrapRegistryDigest" = bootstrap_registry_digest
       AND existing."candidateBundleDigest" = candidate_bundle_digest
       AND existing."clusterIdentityDigest" = cluster_identity_digest
       AND existing."releaseSha" = release_sha
       AND existing."releaseArtifactDigest" = release_artifact_digest
       AND existing."runtimeConfigDigest" = runtime_config_digest
       AND existing."verifierArtifactDigest" = verifier_artifact_digest
       AND existing."databaseName" = target_database_name
       AND existing."databaseOid" = target_database_oid
       AND existing."ownerRoleName" = owner_role_name
       AND existing."ownerRoleOid" = owner_role_oid
       AND existing."runtimeRoleName" = runtime_role_name
       AND existing."runtimeRoleOid" = runtime_role_oid
       AND existing."enrollmentGeneration" = enrollment_generation
       AND existing."bootstrapSigningKeyId" = bootstrap_signing_key_id
       AND existing."bootstrapPublicKeyFingerprint" =
         bootstrap_public_key_fingerprint
       AND existing."runtimeAttestationKeyId" = runtime_attestation_key_id
       AND existing."runtimeAttestationPublicKeyFingerprint" =
         runtime_attestation_public_key_fingerprint
       AND existing."runtimeAttestationPublicKeyBytesSha256" =
         runtime_attestation_public_key_bytes_sha256
       AND existing."runtimeRevokeIntentKeyId" = runtime_revoke_intent_key_id
       AND existing."runtimeRevokeIntentPublicKeyFingerprint" =
         runtime_revoke_intent_public_key_fingerprint
       AND existing."runtimeRevokeIntentPublicKeyBytesSha256" =
         runtime_revoke_intent_public_key_bytes_sha256
       AND existing."tlsCaCertificateSha256" = tls_ca_certificate_sha256
       AND existing."tlsEndpointHost" = tls_endpoint_host
       AND existing."tlsEndpointPort" = tls_endpoint_port
       AND existing."tlsServerName" = tls_server_name
       AND existing."tlsLeafCertificateSha256" = tls_leaf_certificate_sha256
       AND existing."tlsLeafSpkiSha256" = tls_leaf_spki_sha256
       AND existing."tlsLeafNotBefore" = tls_leaf_not_before
       AND existing."tlsLeafNotAfter" = tls_leaf_not_after
       AND existing."tlsMinimumProtocol" = tls_minimum_protocol
       AND existing."resolvedAddressSetDigest" = resolved_address_set_digest
       AND existing."tlsObservationDigest" = tls_observation_digest
       AND existing."issuedAt" = issued_at
       AND existing."collectedAt" = collected_at
       AND existing."preparedAt" = prepared_at
       AND existing."validUntil" = valid_until
    THEN
      RETURN QUERY SELECT existing."id", existing."status",
        existing."validUntil", TRUE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'CURRENT199 trust registration replay mismatch'
      USING ERRCODE = '55000';
  END IF;

  server_now := pg_catalog.clock_timestamp();
  IF prepared_at > server_now + INTERVAL '30 seconds'
     OR valid_until <= server_now
  THEN
    RAISE EXCEPTION 'CURRENT199 trust registration is not fresh'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public."LangameRuntimeTrustRegistrationV1" (
    "id", "registrationContract", "registrationDigest",
    "enrollmentPayloadDigest", "protectedAcquisitionReceiptDigest",
    "bootstrapRegistryContract", "bootstrapRegistryDigest",
    "candidateBundleDigest", "clusterIdentityDigest", "releaseSha",
    "releaseArtifactDigest", "runtimeConfigDigest", "verifierArtifactDigest",
    "databaseName", "databaseOid", "ownerRoleName", "ownerRoleOid",
    "runtimeRoleName", "runtimeRoleOid", "enrollmentGeneration",
    "bootstrapSigningKeyId", "bootstrapPublicKeyFingerprint",
    "runtimeAttestationKeyId", "runtimeAttestationPublicKeyFingerprint",
    "runtimeAttestationPublicKeyBytesSha256", "runtimeRevokeIntentKeyId",
    "runtimeRevokeIntentPublicKeyFingerprint",
    "runtimeRevokeIntentPublicKeyBytesSha256", "tlsCaCertificateSha256",
    "tlsEndpointHost", "tlsEndpointPort", "tlsServerName",
    "tlsLeafCertificateSha256", "tlsLeafSpkiSha256", "tlsLeafNotBefore",
    "tlsLeafNotAfter", "tlsMinimumProtocol", "resolvedAddressSetDigest",
    "tlsObservationDigest", "issuedAt", "collectedAt", "preparedAt",
    "validUntil", "registeredByRole", "createdAt", "updatedAt"
  ) VALUES (
    registration_id, registration_contract, registration_digest,
    enrollment_payload_digest, protected_acquisition_receipt_digest,
    bootstrap_registry_contract, bootstrap_registry_digest,
    candidate_bundle_digest, cluster_identity_digest, release_sha,
    release_artifact_digest, runtime_config_digest, verifier_artifact_digest,
    target_database_name, target_database_oid, owner_role_name, owner_role_oid,
    runtime_role_name, runtime_role_oid, enrollment_generation,
    bootstrap_signing_key_id, bootstrap_public_key_fingerprint,
    runtime_attestation_key_id, runtime_attestation_public_key_fingerprint,
    runtime_attestation_public_key_bytes_sha256, runtime_revoke_intent_key_id,
    runtime_revoke_intent_public_key_fingerprint,
    runtime_revoke_intent_public_key_bytes_sha256, tls_ca_certificate_sha256,
    tls_endpoint_host, tls_endpoint_port, tls_server_name,
    tls_leaf_certificate_sha256, tls_leaf_spki_sha256, tls_leaf_not_before,
    tls_leaf_not_after, tls_minimum_protocol, resolved_address_set_digest,
    tls_observation_digest, issued_at, collected_at, prepared_at, valid_until,
    CURRENT_USER, server_now, server_now
  ) RETURNING * INTO existing;

  INSERT INTO public."LangameRuntimeTrustRegistrationEventV1" (
    "id", "registrationId", "eventType", "eventDigest", "eventAt",
    "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, existing."id", 'REGISTERED',
    existing."registrationDigest", server_now,
    pg_catalog.txid_current()::TEXT
  );

  RETURN QUERY SELECT existing."id", existing."status",
    existing."validUntil", FALSE;
END;
$register$;

CREATE FUNCTION public.langame_runtime_trust_registration_expire_current199_v1(
  registration_id TEXT,
  expected_registration_digest TEXT
)
RETURNS TABLE (
  "registrationId" TEXT,
  "status" TEXT,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $expire$
DECLARE
  registration public."LangameRuntimeTrustRegistrationV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE;
  live_database_oid BIGINT;
  live_owner_oid BIGINT;
BEGIN
  IF registration_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR expected_registration_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT199 expiry request'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(registration_id, 199)
  );
  SELECT candidate.* INTO registration
  FROM public."LangameRuntimeTrustRegistrationV1" AS candidate
  WHERE candidate."id" = registration_id
  FOR UPDATE;
  IF NOT FOUND
     OR registration."registrationDigest" <> expected_registration_digest
  THEN
    RAISE EXCEPTION 'CURRENT199 trust registration is unavailable'
      USING ERRCODE = '42501';
  END IF;
  IF registration."status" = 'EXPIRED' THEN
    RETURN QUERY SELECT registration."id", registration."status",
      registration."expiredAt", TRUE;
    RETURN;
  END IF;

  SELECT database_object.oid::BIGINT INTO live_database_oid
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database();
  SELECT role_object.oid::BIGINT INTO live_owner_oid
  FROM pg_catalog.pg_roles AS role_object
  WHERE role_object.rolname = CURRENT_USER;
  IF registration."databaseName" <> pg_catalog.current_database()
     OR registration."databaseOid" <> live_database_oid
     OR registration."ownerRoleName" <> CURRENT_USER
     OR registration."ownerRoleName" <> SESSION_USER
     OR registration."ownerRoleOid" <> live_owner_oid
  THEN
    RAISE EXCEPTION 'CURRENT199 live owner identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  server_now := pg_catalog.clock_timestamp();
  IF registration."validUntil" > server_now THEN
    RAISE EXCEPTION 'CURRENT199 live registration cannot expire early'
      USING ERRCODE = '55000';
  END IF;
  PERFORM pg_catalog.set_config(
    'leetplus.langame_runtime_current199_writer', 'expire', TRUE
  );
  UPDATE public."LangameRuntimeTrustRegistrationV1"
  SET "status" = 'EXPIRED', "expiredAt" = server_now,
      "updatedAt" = server_now
  WHERE "id" = registration."id"
  RETURNING * INTO registration;
  INSERT INTO public."LangameRuntimeTrustRegistrationEventV1" (
    "id", "registrationId", "eventType", "eventDigest", "eventAt",
    "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, registration."id", 'EXPIRED',
    registration."registrationDigest", server_now,
    pg_catalog.txid_current()::TEXT
  );
  RETURN QUERY SELECT registration."id", registration."status",
    registration."expiredAt", FALSE;
END;
$expire$;

REVOKE ALL ON TABLE public."LangameRuntimeTrustRegistrationV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameRuntimeTrustRegistrationEventV1" FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.langame_runtime_trust_registration_guard_current199_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.langame_runtime_trust_registration_event_guard_current199_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.langame_runtime_trust_registration_register_current199_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, BIGINT, TEXT, BIGINT, TEXT, BIGINT, INTEGER, TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT,
  TIMESTAMP(3) WITH TIME ZONE, TIMESTAMP(3) WITH TIME ZONE, TEXT, TEXT, TEXT,
  TIMESTAMP(3) WITH TIME ZONE, TIMESTAMP(3) WITH TIME ZONE,
  TIMESTAMP(3) WITH TIME ZONE, TIMESTAMP(3) WITH TIME ZONE, BOOLEAN
) FROM PUBLIC;
REVOKE ALL ON FUNCTION
public.langame_runtime_trust_registration_expire_current199_v1(TEXT, TEXT)
FROM PUBLIC;

DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'LangameRuntimeTrustRegistrationV1',
        'LangameRuntimeTrustRegistrationEventV1'
      )
      AND grantee <> CURRENT_USER
  ) OR EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name LIKE
        'langame_runtime_trust_registration%current199_v1'
      AND grantee <> CURRENT_USER
  ) THEN
    RAISE EXCEPTION 'CURRENT199 owner-only ACL verification failed';
  END IF;
END;
$acl$;

COMMIT;

BEGIN;

CREATE TABLE public."LangameRuntimeRevokeIntentV1" (
  "id" TEXT PRIMARY KEY,
  "intentPayloadDigest" TEXT NOT NULL UNIQUE,
  "attestationId" TEXT NOT NULL UNIQUE,
  "attestationPayloadDigest" TEXT NOT NULL,
  "attestationSigningKeyId" TEXT NOT NULL,
  "attestationPublicKeyFingerprint" TEXT NOT NULL,
  "current194Contract" TEXT NOT NULL,
  "releaseSha" TEXT NOT NULL,
  "databaseName" TEXT NOT NULL,
  "databaseOid" BIGINT NOT NULL,
  "ownerRoleName" TEXT NOT NULL,
  "ownerRoleOid" BIGINT NOT NULL,
  "revokeRequestId" TEXT NOT NULL UNIQUE,
  "revokeRequestDigest" TEXT NOT NULL,
  "revocationReasonDigest" TEXT NOT NULL,
  "signingKeyId" TEXT NOT NULL,
  "publicKeyFingerprint" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "registeredByRole" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "langame_runtime_revoke_intent_attestation_fkey"
    FOREIGN KEY ("attestationId")
    REFERENCES public."LangameRuntimeAttestationV1"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "langame_runtime_revoke_intent_status_check"
    CHECK ("status" IN ('PENDING', 'APPLIED', 'EXPIRED')),
  CONSTRAINT "langame_runtime_revoke_intent_contract_check"
    CHECK ("current194Contract" =
      'LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1'),
  CONSTRAINT "langame_runtime_revoke_intent_digest_check" CHECK (
    "intentPayloadDigest" ~ '^[a-f0-9]{64}$'
    AND "attestationPayloadDigest" ~ '^[a-f0-9]{64}$'
    AND "attestationPublicKeyFingerprint" ~ '^[a-f0-9]{64}$'
    AND "revokeRequestDigest" ~ '^[a-f0-9]{64}$'
    AND "revocationReasonDigest" ~ '^[a-f0-9]{64}$'
    AND "publicKeyFingerprint" ~ '^[a-f0-9]{64}$'
    AND "intentPayloadDigest" <> "attestationPayloadDigest"
    AND "intentPayloadDigest" <> "revokeRequestDigest"
    AND "intentPayloadDigest" <> "revocationReasonDigest"
    AND "revokeRequestDigest" <> "revocationReasonDigest"
    AND "publicKeyFingerprint" <> "attestationPublicKeyFingerprint"
  ),
  CONSTRAINT "langame_runtime_revoke_intent_identity_check" CHECK (
    "id" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "attestationId" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "revokeRequestId" ~ '^[A-Za-z0-9_-]{16,128}$'
    AND "id" <> "attestationId"
    AND "id" <> "revokeRequestId"
    AND "attestationId" <> "revokeRequestId"
  ),
  CONSTRAINT "langame_runtime_revoke_intent_binding_check" CHECK (
    "releaseSha" ~ '^[a-f0-9]{40}$'
    AND "databaseName" ~ '^[a-z][a-z0-9_]{0,62}$'
    AND "databaseOid" BETWEEN 1 AND 4294967295
    AND "ownerRoleName" ~ '^[a-z_][a-z0-9_]{2,62}$'
    AND "ownerRoleOid" BETWEEN 1 AND 4294967295
    AND "attestationSigningKeyId" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND "signingKeyId" ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    AND "signingKeyId" <> "attestationSigningKeyId"
    AND "signature" ~ '^[A-Za-z0-9_-]{86}$'
  ),
  CONSTRAINT "langame_runtime_revoke_intent_timeline_check" CHECK (
    "validUntil" > "issuedAt"
    AND "validUntil" <= "issuedAt" + INTERVAL '5 minutes'
  ),
  CONSTRAINT "langame_runtime_revoke_intent_terminal_check" CHECK (
    ("status" = 'PENDING' AND "appliedAt" IS NULL AND "expiredAt" IS NULL)
    OR ("status" = 'APPLIED' AND "appliedAt" IS NOT NULL
      AND "expiredAt" IS NULL)
    OR ("status" = 'EXPIRED' AND "appliedAt" IS NULL
      AND "expiredAt" IS NOT NULL)
  )
);

CREATE TABLE public."LangameRuntimeRevokeIntentEventV1" (
  "id" TEXT PRIMARY KEY,
  "intentId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventDigest" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transactionId" TEXT NOT NULL,
  CONSTRAINT "langame_runtime_revoke_intent_event_type_check"
    CHECK ("eventType" IN ('REGISTERED', 'APPLIED', 'EXPIRED')),
  CONSTRAINT "langame_runtime_revoke_intent_event_digest_check"
    CHECK ("eventDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "langame_runtime_revoke_intent_event_unique"
    UNIQUE ("intentId", "eventType"),
  CONSTRAINT "langame_runtime_revoke_intent_event_intent_fkey"
    FOREIGN KEY ("intentId")
    REFERENCES public."LangameRuntimeRevokeIntentV1"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "langame_runtime_revoke_intent_status_valid_idx"
ON public."LangameRuntimeRevokeIntentV1"("status", "validUntil");

CREATE FUNCTION public.langame_runtime_revoke_intent_guard_current195_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
  writer TEXT := pg_catalog.current_setting(
    'leetplus.langame_runtime_current195_writer', TRUE
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CURRENT195 revoke intents are append-preserving'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(writer, '') NOT IN ('apply', 'expire') THEN
    RAISE EXCEPTION 'CURRENT195 revoke intent writer is required'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."intentPayloadDigest" <> OLD."intentPayloadDigest"
     OR NEW."attestationId" <> OLD."attestationId"
     OR NEW."attestationPayloadDigest" <> OLD."attestationPayloadDigest"
     OR NEW."attestationSigningKeyId" <> OLD."attestationSigningKeyId"
     OR NEW."attestationPublicKeyFingerprint" <>
       OLD."attestationPublicKeyFingerprint"
     OR NEW."current194Contract" <> OLD."current194Contract"
     OR NEW."releaseSha" <> OLD."releaseSha"
     OR NEW."databaseName" <> OLD."databaseName"
     OR NEW."databaseOid" <> OLD."databaseOid"
     OR NEW."ownerRoleName" <> OLD."ownerRoleName"
     OR NEW."ownerRoleOid" <> OLD."ownerRoleOid"
     OR NEW."revokeRequestId" <> OLD."revokeRequestId"
     OR NEW."revokeRequestDigest" <> OLD."revokeRequestDigest"
     OR NEW."revocationReasonDigest" <> OLD."revocationReasonDigest"
     OR NEW."signingKeyId" <> OLD."signingKeyId"
     OR NEW."publicKeyFingerprint" <> OLD."publicKeyFingerprint"
     OR NEW."signature" <> OLD."signature"
     OR NEW."issuedAt" <> OLD."issuedAt"
     OR NEW."validUntil" <> OLD."validUntil"
     OR NEW."registeredByRole" <> OLD."registeredByRole"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'CURRENT195 revoke intent binding is immutable'
      USING ERRCODE = '42501';
  END IF;
  IF writer = 'apply' THEN
    IF OLD."status" <> 'PENDING' OR NEW."status" <> 'APPLIED'
       OR NEW."appliedAt" IS NULL
       OR NEW."expiredAt" IS DISTINCT FROM OLD."expiredAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT195 apply transition'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD."status" <> 'PENDING' OR NEW."status" <> 'EXPIRED'
       OR NEW."expiredAt" IS NULL
       OR NEW."appliedAt" IS DISTINCT FROM OLD."appliedAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT195 expiry transition'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.langame_runtime_revoke_intent_event_guard_current195_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $event_guard$
BEGIN
  RAISE EXCEPTION 'CURRENT195 revoke intent events are append-only'
    USING ERRCODE = '42501';
END;
$event_guard$;

CREATE TRIGGER langame_runtime_revoke_intent_guard_current195_v1
BEFORE UPDATE OR DELETE ON public."LangameRuntimeRevokeIntentV1"
FOR EACH ROW EXECUTE FUNCTION
public.langame_runtime_revoke_intent_guard_current195_v1();

CREATE TRIGGER langame_runtime_revoke_intent_event_guard_current195_v1
BEFORE UPDATE OR DELETE ON public."LangameRuntimeRevokeIntentEventV1"
FOR EACH ROW EXECUTE FUNCTION
public.langame_runtime_revoke_intent_event_guard_current195_v1();

CREATE FUNCTION public.langame_runtime_revoke_intent_register_current195_v1(
  target_intent_id TEXT,
  intent_payload_digest TEXT,
  target_attestation_id TEXT,
  attestation_payload_digest TEXT,
  attestation_signing_key_id TEXT,
  attestation_public_key_fingerprint TEXT,
  current194_contract TEXT,
  release_sha TEXT,
  target_database_name TEXT,
  target_database_oid BIGINT,
  owner_role_name TEXT,
  owner_role_oid BIGINT,
  revoke_request_id TEXT,
  revoke_request_digest TEXT,
  revocation_reason_digest TEXT,
  signing_key_id TEXT,
  public_key_fingerprint TEXT,
  intent_signature TEXT,
  issued_at TIMESTAMP(3) WITH TIME ZONE,
  valid_until TIMESTAMP(3) WITH TIME ZONE
)
RETURNS TABLE (
  "intentId" TEXT,
  "status" TEXT,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $register$
DECLARE
  attestation public."LangameRuntimeAttestationV1"%ROWTYPE;
  existing public."LangameRuntimeRevokeIntentV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE;
  live_database_oid BIGINT;
  live_owner_oid BIGINT;
  attestation_found BOOLEAN;
BEGIN
  IF target_intent_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR target_attestation_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR revoke_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR target_intent_id IN (target_attestation_id, revoke_request_id)
     OR target_attestation_id = revoke_request_id
     OR intent_payload_digest !~ '^[a-f0-9]{64}$'
     OR attestation_payload_digest !~ '^[a-f0-9]{64}$'
     OR attestation_public_key_fingerprint !~ '^[a-f0-9]{64}$'
     OR revoke_request_digest !~ '^[a-f0-9]{64}$'
     OR revocation_reason_digest !~ '^[a-f0-9]{64}$'
     OR public_key_fingerprint !~ '^[a-f0-9]{64}$'
     OR release_sha !~ '^[a-f0-9]{40}$'
     OR attestation_signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR signing_key_id = attestation_signing_key_id
     OR public_key_fingerprint = attestation_public_key_fingerprint
     OR intent_signature !~ '^[A-Za-z0-9_-]{86}$'
     OR current194_contract <>
       'LANGAME_RUNTIME_ATTESTATION_LEDGER_CURRENT194_V1'
     OR valid_until <= issued_at
     OR valid_until > issued_at + INTERVAL '5 minutes'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT195 revoke intent registration'
      USING ERRCODE = '22023';
  END IF;
  IF intent_payload_digest IN (
       attestation_payload_digest, revoke_request_digest,
       revocation_reason_digest
     ) OR revoke_request_digest = revocation_reason_digest
  THEN
    RAISE EXCEPTION 'Invalid CURRENT195 revoke intent digest separation'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_intent_id, 195)
  );
  SELECT candidate.* INTO existing
  FROM public."LangameRuntimeRevokeIntentV1" AS candidate
  WHERE candidate."id" = target_intent_id
     OR candidate."intentPayloadDigest" = intent_payload_digest
     OR candidate."attestationId" = target_attestation_id
     OR candidate."revokeRequestId" = revoke_request_id
  FOR UPDATE;

  SELECT candidate.* INTO attestation
  FROM public."LangameRuntimeAttestationV1" AS candidate
  WHERE candidate."id" = target_attestation_id
  FOR UPDATE;
  attestation_found := FOUND;

  SELECT database_object.oid::BIGINT INTO live_database_oid
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database();
  SELECT role_object.oid::BIGINT INTO live_owner_oid
  FROM pg_catalog.pg_roles AS role_object
  WHERE role_object.rolname = CURRENT_USER;
  IF target_database_name <> pg_catalog.current_database()
     OR target_database_oid <> live_database_oid
     OR owner_role_name <> CURRENT_USER
     OR owner_role_name <> SESSION_USER
     OR owner_role_oid <> live_owner_oid
  THEN
    RAISE EXCEPTION 'CURRENT195 live owner identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF FOUND THEN
    IF existing."id" = target_intent_id
       AND existing."intentPayloadDigest" = intent_payload_digest
       AND existing."attestationId" = target_attestation_id
       AND existing."attestationPayloadDigest" = attestation_payload_digest
       AND existing."attestationSigningKeyId" = attestation_signing_key_id
       AND existing."attestationPublicKeyFingerprint" =
         attestation_public_key_fingerprint
       AND existing."current194Contract" = current194_contract
       AND existing."releaseSha" = release_sha
       AND existing."databaseName" = target_database_name
       AND existing."databaseOid" = target_database_oid
       AND existing."ownerRoleName" = owner_role_name
       AND existing."ownerRoleOid" = owner_role_oid
       AND existing."revokeRequestId" = revoke_request_id
       AND existing."revokeRequestDigest" = revoke_request_digest
       AND existing."revocationReasonDigest" = revocation_reason_digest
       AND existing."signingKeyId" = signing_key_id
       AND existing."publicKeyFingerprint" = public_key_fingerprint
       AND existing."signature" = intent_signature
       AND existing."issuedAt" = issued_at
       AND existing."validUntil" = valid_until
    THEN
      RETURN QUERY SELECT existing."id", existing."status",
        existing."validUntil", TRUE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'CURRENT195 revoke intent replay mismatch'
      USING ERRCODE = '55000';
  END IF;

  IF NOT attestation_found
     OR attestation."payloadDigest" <> attestation_payload_digest
     OR attestation."signingKeyId" <> attestation_signing_key_id
     OR attestation."publicKeyFingerprint" <>
       attestation_public_key_fingerprint
     OR attestation."releaseSha" <> release_sha
     OR attestation."databaseName" <> target_database_name
     OR attestation."databaseOid" <> target_database_oid
     OR attestation."schemaOwnerRoleName" <> owner_role_name
     OR attestation."schemaOwnerRoleOid" <> owner_role_oid
     OR attestation."status" <> 'CONSUMED'
  THEN
    RAISE EXCEPTION 'CURRENT195 attestation binding is unavailable'
      USING ERRCODE = '42501';
  END IF;

  server_now := pg_catalog.clock_timestamp();
  IF issued_at > server_now + INTERVAL '30 seconds'
     OR valid_until <= server_now
  THEN
    RAISE EXCEPTION 'CURRENT195 revoke intent is not fresh'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public."LangameRuntimeRevokeIntentV1" (
    "id", "intentPayloadDigest", "attestationId",
    "attestationPayloadDigest", "attestationSigningKeyId",
    "attestationPublicKeyFingerprint", "current194Contract", "releaseSha",
    "databaseName", "databaseOid", "ownerRoleName", "ownerRoleOid",
    "revokeRequestId", "revokeRequestDigest", "revocationReasonDigest",
    "signingKeyId", "publicKeyFingerprint", "signature", "issuedAt",
    "validUntil", "registeredByRole", "createdAt", "updatedAt"
  ) VALUES (
    target_intent_id, intent_payload_digest, target_attestation_id,
    attestation_payload_digest, attestation_signing_key_id,
    attestation_public_key_fingerprint, current194_contract, release_sha,
    target_database_name, target_database_oid, owner_role_name, owner_role_oid,
    revoke_request_id, revoke_request_digest, revocation_reason_digest,
    signing_key_id, public_key_fingerprint, intent_signature, issued_at,
    valid_until, CURRENT_USER, server_now, server_now
  ) RETURNING * INTO existing;
  INSERT INTO public."LangameRuntimeRevokeIntentEventV1" (
    "id", "intentId", "eventType", "eventDigest", "eventAt",
    "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, existing."id", 'REGISTERED',
    intent_payload_digest, server_now, pg_catalog.txid_current()::TEXT
  );
  RETURN QUERY SELECT existing."id", existing."status",
    existing."validUntil", FALSE;
END;
$register$;

CREATE FUNCTION public.langame_runtime_revoke_intent_apply_current195_v1(
  target_intent_id TEXT,
  expected_intent_payload_digest TEXT
)
RETURNS TABLE (
  "intentId" TEXT,
  "attestationId" TEXT,
  "status" TEXT,
  "appliedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $apply$
DECLARE
  intent public."LangameRuntimeRevokeIntentV1"%ROWTYPE;
  revoked RECORD;
  server_now TIMESTAMP(3) WITH TIME ZONE;
  live_database_oid BIGINT;
  live_owner_oid BIGINT;
BEGIN
  IF target_intent_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR expected_intent_payload_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT195 revoke intent apply request'
      USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_intent_id, 195)
  );
  SELECT candidate.* INTO intent
  FROM public."LangameRuntimeRevokeIntentV1" AS candidate
  WHERE candidate."id" = target_intent_id
  FOR UPDATE;
  IF NOT FOUND OR intent."intentPayloadDigest" <>
    expected_intent_payload_digest
  THEN
    RAISE EXCEPTION 'CURRENT195 revoke intent is unavailable'
      USING ERRCODE = '42501';
  END IF;
  IF intent."status" = 'APPLIED' THEN
    RETURN QUERY SELECT intent."id", intent."attestationId", intent."status",
      intent."appliedAt", intent."expiredAt", TRUE;
    RETURN;
  END IF;
  IF intent."status" = 'EXPIRED' THEN
    RETURN QUERY SELECT intent."id", intent."attestationId", intent."status",
      intent."appliedAt", intent."expiredAt", TRUE;
    RETURN;
  END IF;

  SELECT database_object.oid::BIGINT INTO live_database_oid
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database();
  SELECT role_object.oid::BIGINT INTO live_owner_oid
  FROM pg_catalog.pg_roles AS role_object
  WHERE role_object.rolname = CURRENT_USER;
  IF intent."databaseName" <> pg_catalog.current_database()
     OR intent."databaseOid" <> live_database_oid
     OR intent."ownerRoleName" <> CURRENT_USER
     OR intent."ownerRoleName" <> SESSION_USER
     OR intent."ownerRoleOid" <> live_owner_oid
  THEN
    RAISE EXCEPTION 'CURRENT195 live owner identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  server_now := pg_catalog.clock_timestamp();
  IF intent."validUntil" <= server_now THEN
    PERFORM pg_catalog.set_config(
      'leetplus.langame_runtime_current195_writer', 'expire', TRUE
    );
    UPDATE public."LangameRuntimeRevokeIntentV1"
    SET "status" = 'EXPIRED', "expiredAt" = server_now,
        "updatedAt" = server_now
    WHERE "id" = intent."id"
    RETURNING * INTO intent;
    INSERT INTO public."LangameRuntimeRevokeIntentEventV1" (
      "id", "intentId", "eventType", "eventDigest", "eventAt",
      "transactionId"
    ) VALUES (
      pg_catalog.gen_random_uuid()::TEXT, intent."id", 'EXPIRED',
      intent."intentPayloadDigest", server_now,
      pg_catalog.txid_current()::TEXT
    );
    RETURN QUERY SELECT intent."id", intent."attestationId", intent."status",
      intent."appliedAt", intent."expiredAt", FALSE;
    RETURN;
  END IF;

  SELECT * INTO STRICT revoked
  FROM public.langame_runtime_attestation_revoke_current194_v1(
    intent."attestationId", intent."attestationPayloadDigest",
    intent."revokeRequestId", intent."revokeRequestDigest",
    intent."revocationReasonDigest"
  );
  IF revoked."status" <> 'REVOKED' OR revoked."revokedAt" IS NULL THEN
    RAISE EXCEPTION 'CURRENT195 underlying revoke was not terminal'
      USING ERRCODE = '55000';
  END IF;
  PERFORM pg_catalog.set_config(
    'leetplus.langame_runtime_current195_writer', 'apply', TRUE
  );
  UPDATE public."LangameRuntimeRevokeIntentV1"
  SET "status" = 'APPLIED', "appliedAt" = revoked."revokedAt",
      "updatedAt" = server_now
  WHERE "id" = intent."id"
  RETURNING * INTO intent;
  INSERT INTO public."LangameRuntimeRevokeIntentEventV1" (
    "id", "intentId", "eventType", "eventDigest", "eventAt",
    "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, intent."id", 'APPLIED',
    intent."intentPayloadDigest", server_now,
    pg_catalog.txid_current()::TEXT
  );
  RETURN QUERY SELECT intent."id", intent."attestationId", intent."status",
    intent."appliedAt", intent."expiredAt", FALSE;
END;
$apply$;

REVOKE ALL ON TABLE public."LangameRuntimeRevokeIntentV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameRuntimeRevokeIntentEventV1" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_revoke_intent_guard_current195_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_revoke_intent_event_guard_current195_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_revoke_intent_register_current195_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, BIGINT,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMP(3) WITH TIME ZONE,
  TIMESTAMP(3) WITH TIME ZONE
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_revoke_intent_apply_current195_v1(
  TEXT, TEXT
) FROM PUBLIC;

DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'LangameRuntimeRevokeIntentV1',
        'LangameRuntimeRevokeIntentEventV1'
      )
      AND grantee <> CURRENT_USER
  ) OR EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name LIKE 'langame_runtime_revoke_intent%current195_v1'
      AND grantee <> CURRENT_USER
  ) THEN
    RAISE EXCEPTION 'CURRENT195 owner-only ACL verification failed';
  END IF;
END;
$acl$;

COMMIT;

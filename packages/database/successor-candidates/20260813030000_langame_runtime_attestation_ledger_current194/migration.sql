BEGIN;

CREATE TABLE public."LangameRuntimeAttestationV1" (
  "id" TEXT PRIMARY KEY,
  "payloadDigest" TEXT NOT NULL UNIQUE,
  "catalogReceiptDigest" TEXT NOT NULL,
  "planDigest" TEXT NOT NULL,
  "releaseSha" TEXT NOT NULL,
  "current192MigrationSha256" TEXT NOT NULL,
  "databaseName" TEXT NOT NULL,
  "databaseOid" BIGINT NOT NULL,
  "executorRoleName" TEXT NOT NULL,
  "executorRoleOid" BIGINT NOT NULL,
  "schemaOwnerRoleName" TEXT NOT NULL,
  "schemaOwnerRoleOid" BIGINT NOT NULL,
  "signingKeyId" TEXT NOT NULL,
  "publicKeyFingerprint" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "registerRequestId" TEXT NOT NULL UNIQUE,
  "registerRequestDigest" TEXT NOT NULL,
  "registeredByRole" TEXT NOT NULL,
  "consumeRequestId" TEXT UNIQUE,
  "consumeRequestDigest" TEXT,
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "revokeRequestId" TEXT UNIQUE,
  "revokeRequestDigest" TEXT,
  "revocationReasonDigest" TEXT,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "expiredAt" TIMESTAMP(3) WITH TIME ZONE,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "langame_runtime_attestation_status_check"
    CHECK ("status" IN ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED')),
  CONSTRAINT "langame_runtime_attestation_digest_check" CHECK (
    "payloadDigest" ~ '^[a-f0-9]{64}$'
    AND "catalogReceiptDigest" ~ '^[a-f0-9]{64}$'
    AND "planDigest" ~ '^[a-f0-9]{64}$'
    AND "current192MigrationSha256" ~ '^[a-f0-9]{64}$'
    AND "publicKeyFingerprint" ~ '^[a-f0-9]{64}$'
    AND "registerRequestDigest" ~ '^[a-f0-9]{64}$'
    AND ("consumeRequestDigest" IS NULL
      OR "consumeRequestDigest" ~ '^[a-f0-9]{64}$')
    AND ("revokeRequestDigest" IS NULL
      OR "revokeRequestDigest" ~ '^[a-f0-9]{64}$')
    AND ("revocationReasonDigest" IS NULL
      OR "revocationReasonDigest" ~ '^[a-f0-9]{64}$')
  ),
  CONSTRAINT "langame_runtime_attestation_release_check"
    CHECK ("releaseSha" ~ '^[a-f0-9]{40}$'),
  CONSTRAINT "langame_runtime_attestation_timeline_check"
    CHECK ("validUntil" > "issuedAt"
      AND "validUntil" <= "issuedAt" + INTERVAL '5 minutes'),
  CONSTRAINT "langame_runtime_attestation_role_separation_check"
    CHECK ("executorRoleName" <> "schemaOwnerRoleName"
      AND "executorRoleOid" <> "schemaOwnerRoleOid"),
  CONSTRAINT "langame_runtime_attestation_consume_fields_check" CHECK (
    ("consumeRequestId" IS NULL AND "consumeRequestDigest" IS NULL
      AND "consumedAt" IS NULL)
    OR ("consumeRequestId" IS NOT NULL
      AND "consumeRequestDigest" IS NOT NULL
      AND ("consumedAt" IS NOT NULL OR "expiredAt" IS NOT NULL))
  ),
  CONSTRAINT "langame_runtime_attestation_revoke_fields_check" CHECK (
    ("revokeRequestId" IS NULL AND "revokeRequestDigest" IS NULL
      AND "revocationReasonDigest" IS NULL AND "revokedAt" IS NULL)
    OR ("revokeRequestId" IS NOT NULL AND "revokeRequestDigest" IS NOT NULL
      AND "revocationReasonDigest" IS NOT NULL AND "revokedAt" IS NOT NULL)
  ),
  CONSTRAINT "langame_runtime_attestation_terminal_check" CHECK (
    ("status" = 'ACTIVE' AND "consumedAt" IS NULL AND "revokedAt" IS NULL
      AND "expiredAt" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL
      AND "revokedAt" IS NULL AND "expiredAt" IS NULL)
    OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL
      AND "expiredAt" IS NULL)
    OR ("status" = 'EXPIRED' AND "expiredAt" IS NOT NULL
      AND "consumedAt" IS NULL AND "revokedAt" IS NULL)
  )
);

CREATE TABLE public."LangameRuntimeAttestationEventV1" (
  "id" TEXT PRIMARY KEY,
  "attestationId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "requestDigest" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "transactionId" TEXT NOT NULL,
  CONSTRAINT "langame_runtime_attestation_event_type_check"
    CHECK ("eventType" IN ('REGISTERED', 'CONSUMED', 'REVOKED', 'EXPIRED')),
  CONSTRAINT "langame_runtime_attestation_event_digest_check"
    CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "langame_runtime_attestation_event_unique"
    UNIQUE ("attestationId", "eventType"),
  CONSTRAINT "langame_runtime_attestation_event_attestation_fkey"
    FOREIGN KEY ("attestationId")
    REFERENCES public."LangameRuntimeAttestationV1"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "langame_runtime_attestation_status_valid_idx"
ON public."LangameRuntimeAttestationV1"("status", "validUntil");
CREATE INDEX "langame_runtime_attestation_role_idx"
ON public."LangameRuntimeAttestationV1"("executorRoleOid", "status");

CREATE FUNCTION public.langame_runtime_attestation_guard_current194_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
  writer TEXT := pg_catalog.current_setting(
    'leetplus.langame_runtime_current194_writer', TRUE
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CURRENT194 runtime attestations are append-preserving'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(writer, '') NOT IN ('consume', 'revoke') THEN
    RAISE EXCEPTION 'CURRENT194 runtime attestation writer is required'
      USING ERRCODE = '42501';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."payloadDigest" <> OLD."payloadDigest"
     OR NEW."catalogReceiptDigest" <> OLD."catalogReceiptDigest"
     OR NEW."planDigest" <> OLD."planDigest"
     OR NEW."releaseSha" <> OLD."releaseSha"
     OR NEW."current192MigrationSha256" <> OLD."current192MigrationSha256"
     OR NEW."databaseName" <> OLD."databaseName"
     OR NEW."databaseOid" <> OLD."databaseOid"
     OR NEW."executorRoleName" <> OLD."executorRoleName"
     OR NEW."executorRoleOid" <> OLD."executorRoleOid"
     OR NEW."schemaOwnerRoleName" <> OLD."schemaOwnerRoleName"
     OR NEW."schemaOwnerRoleOid" <> OLD."schemaOwnerRoleOid"
     OR NEW."signingKeyId" <> OLD."signingKeyId"
     OR NEW."publicKeyFingerprint" <> OLD."publicKeyFingerprint"
     OR NEW."issuedAt" <> OLD."issuedAt"
     OR NEW."validUntil" <> OLD."validUntil"
     OR NEW."registerRequestId" <> OLD."registerRequestId"
     OR NEW."registerRequestDigest" <> OLD."registerRequestDigest"
     OR NEW."registeredByRole" <> OLD."registeredByRole"
     OR NEW."createdAt" <> OLD."createdAt"
  THEN
    RAISE EXCEPTION 'CURRENT194 runtime attestation binding is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF writer = 'consume' THEN
    IF OLD."status" <> 'ACTIVE' OR NEW."status" NOT IN ('CONSUMED', 'EXPIRED')
       OR NEW."revokeRequestId" IS DISTINCT FROM OLD."revokeRequestId"
       OR NEW."revokeRequestDigest" IS DISTINCT FROM OLD."revokeRequestDigest"
       OR NEW."revocationReasonDigest" IS DISTINCT FROM OLD."revocationReasonDigest"
       OR NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT194 consume/expiry transition'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD."status" NOT IN ('ACTIVE', 'CONSUMED') OR NEW."status" <> 'REVOKED'
       OR NEW."consumeRequestId" IS DISTINCT FROM OLD."consumeRequestId"
       OR NEW."consumeRequestDigest" IS DISTINCT FROM OLD."consumeRequestDigest"
       OR NEW."consumedAt" IS DISTINCT FROM OLD."consumedAt"
       OR NEW."expiredAt" IS DISTINCT FROM OLD."expiredAt"
    THEN
      RAISE EXCEPTION 'Invalid CURRENT194 revoke transition'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE FUNCTION public.langame_runtime_attestation_event_guard_current194_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $event_guard$
BEGIN
  RAISE EXCEPTION 'CURRENT194 runtime attestation events are append-only'
    USING ERRCODE = '42501';
END;
$event_guard$;

CREATE TRIGGER langame_runtime_attestation_guard_current194_v1
BEFORE UPDATE OR DELETE ON public."LangameRuntimeAttestationV1"
FOR EACH ROW EXECUTE FUNCTION
public.langame_runtime_attestation_guard_current194_v1();

CREATE TRIGGER langame_runtime_attestation_event_guard_current194_v1
BEFORE UPDATE OR DELETE ON public."LangameRuntimeAttestationEventV1"
FOR EACH ROW EXECUTE FUNCTION
public.langame_runtime_attestation_event_guard_current194_v1();

CREATE FUNCTION public.langame_runtime_attestation_register_current194_v1(
  target_attestation_id TEXT,
  register_request_id TEXT,
  register_request_digest TEXT,
  payload_digest TEXT,
  catalog_receipt_digest TEXT,
  plan_digest TEXT,
  release_sha TEXT,
  current192_migration_sha256 TEXT,
  target_database_name TEXT,
  target_database_oid BIGINT,
  executor_role_name TEXT,
  executor_role_oid BIGINT,
  schema_owner_role_name TEXT,
  schema_owner_role_oid BIGINT,
  signing_key_id TEXT,
  public_key_fingerprint TEXT,
  issued_at TIMESTAMP(3) WITH TIME ZONE,
  valid_until TIMESTAMP(3) WITH TIME ZONE
)
RETURNS TABLE (
  "attestationId" TEXT,
  "status" TEXT,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE,
  "payloadDigest" TEXT,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $register$
DECLARE
  existing public."LangameRuntimeAttestationV1"%ROWTYPE;
  executor_role pg_catalog.pg_roles%ROWTYPE;
  owner_role pg_catalog.pg_roles%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE;
  actual_database_oid BIGINT;
  executable_count INTEGER;
  owned_count INTEGER;
BEGIN
  IF target_attestation_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR register_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR register_request_digest !~ '^[a-f0-9]{64}$'
     OR payload_digest !~ '^[a-f0-9]{64}$'
     OR catalog_receipt_digest !~ '^[a-f0-9]{64}$'
     OR plan_digest !~ '^[a-f0-9]{64}$'
     OR release_sha !~ '^[a-f0-9]{40}$'
     OR current192_migration_sha256 <>
       'cc40b3fadd5f0e8f3e131838a52d68d972f45c0ee4755784be3c86a3127361f3'
     OR executor_role_name <> 'leetplus_langame_initial_sync_current192'
     OR schema_owner_role_name !~ '^[a-z_][a-z0-9_]{2,62}$'
     OR signing_key_id !~ '^[a-z0-9][a-z0-9._-]{2,63}$'
     OR public_key_fingerprint !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT194 runtime attestation registration'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('leetplus:langame:runtime:current194', 0)
  );
  server_now := pg_catalog.clock_timestamp();
  SELECT candidate.* INTO existing
  FROM public."LangameRuntimeAttestationV1" AS candidate
  WHERE candidate."id" = target_attestation_id
     OR candidate."payloadDigest" = payload_digest
     OR candidate."registerRequestId" = register_request_id
  ORDER BY candidate."id"
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF existing."id" = target_attestation_id
       AND existing."payloadDigest" = payload_digest
       AND existing."catalogReceiptDigest" = catalog_receipt_digest
       AND existing."planDigest" = plan_digest
       AND existing."releaseSha" = release_sha
       AND existing."current192MigrationSha256" = current192_migration_sha256
       AND existing."databaseName" = target_database_name
       AND existing."databaseOid" = target_database_oid
       AND existing."executorRoleName" = executor_role_name
       AND existing."executorRoleOid" = executor_role_oid
       AND existing."schemaOwnerRoleName" = schema_owner_role_name
       AND existing."schemaOwnerRoleOid" = schema_owner_role_oid
       AND existing."signingKeyId" = signing_key_id
       AND existing."publicKeyFingerprint" = public_key_fingerprint
       AND existing."issuedAt" = issued_at
       AND existing."validUntil" = valid_until
       AND existing."registerRequestId" = register_request_id
       AND existing."registerRequestDigest" = register_request_digest
    THEN
      RETURN QUERY SELECT existing."id", existing."status",
        existing."validUntil", existing."payloadDigest", TRUE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'CURRENT194 runtime attestation registration conflict'
      USING ERRCODE = '55000';
  END IF;

  IF issued_at > server_now + INTERVAL '30 seconds'
     OR valid_until <= server_now
     OR valid_until <= issued_at
     OR valid_until > issued_at + INTERVAL '5 minutes'
  THEN
    RAISE EXCEPTION 'CURRENT194 runtime attestation is stale'
      USING ERRCODE = '55000';
  END IF;

  IF target_database_name <> pg_catalog.current_database() THEN
    RAISE EXCEPTION 'CURRENT194 database name mismatch'
      USING ERRCODE = '42501';
  END IF;
  SELECT database_object.oid::BIGINT INTO actual_database_oid
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database();
  IF actual_database_oid IS DISTINCT FROM target_database_oid THEN
    RAISE EXCEPTION 'CURRENT194 database identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  SELECT role.* INTO executor_role FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = executor_role_name AND role.oid = executor_role_oid;
  SELECT role.* INTO owner_role FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = schema_owner_role_name AND role.oid = schema_owner_role_oid;
  IF executor_role.oid IS NULL OR owner_role.oid IS NULL
     OR NOT executor_role.rolcanlogin OR executor_role.rolinherit
     OR executor_role.rolsuper OR executor_role.rolcreatedb
     OR executor_role.rolcreaterole OR executor_role.rolreplication
     OR executor_role.rolbypassrls OR executor_role.oid = owner_role.oid
  THEN
    RAISE EXCEPTION 'CURRENT194 runtime role identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = executor_role.oid
       OR membership.member = executor_role.oid
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_default_acl AS defaults
    CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
    WHERE acl.grantee = executor_role.oid
  ) THEN
    RAISE EXCEPTION 'CURRENT194 runtime role authority widened'
      USING ERRCODE = '42501';
  END IF;

  SELECT (
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_database
     WHERE datdba = executor_role.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_namespace
     WHERE nspowner = executor_role.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class
     WHERE relowner = executor_role.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc
     WHERE proowner = executor_role.oid) +
    (SELECT pg_catalog.count(*) FROM pg_catalog.pg_type
     WHERE typowner = executor_role.oid)
  )::INTEGER INTO owned_count;
  IF owned_count <> 0
     OR NOT pg_catalog.has_database_privilege(
       executor_role_name, target_database_name, 'CONNECT'
     ) OR pg_catalog.has_database_privilege(
       executor_role_name, target_database_name, 'CREATE'
     ) OR pg_catalog.has_database_privilege(
       executor_role_name, target_database_name, 'TEMPORARY'
     ) OR NOT pg_catalog.has_schema_privilege(
       executor_role_name, 'public', 'USAGE'
     ) OR pg_catalog.has_schema_privilege(
       executor_role_name, 'public', 'CREATE'
     )
  THEN
    RAISE EXCEPTION 'CURRENT194 runtime role ACL mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS relation
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'SELECT'
        ) OR pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'INSERT'
        ) OR pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'UPDATE'
        ) OR pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'DELETE'
        ) OR pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'TRUNCATE'
        ) OR pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'REFERENCES'
        ) OR pg_catalog.has_table_privilege(
          executor_role_name, relation.oid, 'TRIGGER'
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS sequence_object
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = sequence_object.relnamespace
    WHERE namespace.nspname = 'public'
      AND sequence_object.relkind = 'S'
      AND (
        pg_catalog.has_sequence_privilege(
          executor_role_name, sequence_object.oid, 'USAGE'
        ) OR pg_catalog.has_sequence_privilege(
          executor_role_name, sequence_object.oid, 'SELECT'
        ) OR pg_catalog.has_sequence_privilege(
          executor_role_name, sequence_object.oid, 'UPDATE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'CURRENT194 direct relation privilege widened'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER INTO executable_count
  FROM pg_catalog.pg_proc AS routine
  INNER JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname = 'public'
    AND pg_catalog.has_function_privilege(
      executor_role_name, routine.oid, 'EXECUTE'
    );
  IF executable_count <> 4 OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS routine
    INNER JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname IN (
        'langame_initial_sync_claim_current192_v1',
        'langame_initial_sync_execute_current192_v1',
        'langame_initial_sync_reconcile_current192_v1',
        'langame_runtime_attestation_consume_current194_v1'
      )
      AND routine.proowner = owner_role.oid
      AND routine.prosecdef = TRUE
      AND routine.proconfig = ARRAY['search_path=pg_catalog, public']::TEXT[]
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            routine.proacl,
            pg_catalog.acldefault('f', routine.proowner)
          )
        ) AS acl
        WHERE acl.grantee = 0::OID AND acl.privilege_type = 'EXECUTE'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'CURRENT194 runtime routine boundary mismatch'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public."LangameRuntimeAttestationV1" (
    "id", "payloadDigest", "catalogReceiptDigest", "planDigest",
    "releaseSha", "current192MigrationSha256", "databaseName", "databaseOid",
    "executorRoleName", "executorRoleOid", "schemaOwnerRoleName",
    "schemaOwnerRoleOid", "signingKeyId", "publicKeyFingerprint", "issuedAt",
    "validUntil", "registerRequestId", "registerRequestDigest",
    "registeredByRole", "createdAt", "updatedAt"
  ) VALUES (
    target_attestation_id, payload_digest, catalog_receipt_digest, plan_digest,
    release_sha, current192_migration_sha256, target_database_name,
    target_database_oid, executor_role_name, executor_role_oid,
    schema_owner_role_name, schema_owner_role_oid, signing_key_id,
    public_key_fingerprint, issued_at, valid_until, register_request_id,
    register_request_digest, SESSION_USER, server_now, server_now
  );
  INSERT INTO public."LangameRuntimeAttestationEventV1" (
    "id", "attestationId", "eventType", "requestDigest", "eventAt",
    "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, target_attestation_id, 'REGISTERED',
    register_request_digest, server_now, pg_catalog.txid_current()::TEXT
  );
  RETURN QUERY SELECT target_attestation_id, 'ACTIVE'::TEXT, valid_until,
    payload_digest, FALSE;
END;
$register$;

CREATE FUNCTION public.langame_runtime_attestation_consume_current194_v1(
  target_attestation_id TEXT,
  expected_payload_digest TEXT,
  expected_catalog_receipt_digest TEXT,
  expected_release_sha TEXT,
  consume_request_id TEXT,
  consume_request_digest TEXT
)
RETURNS TABLE (
  "attestationId" TEXT,
  "status" TEXT,
  "consumedAt" TIMESTAMP(3) WITH TIME ZONE,
  "validUntil" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $consume$
DECLARE
  attestation public."LangameRuntimeAttestationV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE;
  actual_database_oid BIGINT;
BEGIN
  IF target_attestation_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR expected_payload_digest !~ '^[a-f0-9]{64}$'
     OR expected_catalog_receipt_digest !~ '^[a-f0-9]{64}$'
     OR expected_release_sha !~ '^[a-f0-9]{40}$'
     OR consume_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR consume_request_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT194 runtime consumption request'
      USING ERRCODE = '22023';
  END IF;

  SELECT candidate.* INTO attestation
  FROM public."LangameRuntimeAttestationV1" AS candidate
  WHERE candidate."id" = target_attestation_id
  FOR UPDATE;
  IF NOT FOUND
     OR attestation."payloadDigest" <> expected_payload_digest
     OR attestation."catalogReceiptDigest" <> expected_catalog_receipt_digest
     OR attestation."releaseSha" <> expected_release_sha
     OR SESSION_USER <> attestation."executorRoleName"
  THEN
    RAISE EXCEPTION 'CURRENT194 runtime attestation is unavailable'
      USING ERRCODE = '42501';
  END IF;
  SELECT database_object.oid::BIGINT INTO actual_database_oid
  FROM pg_catalog.pg_database AS database_object
  WHERE database_object.datname = pg_catalog.current_database();
  IF attestation."databaseName" <> pg_catalog.current_database()
     OR attestation."databaseOid" <> actual_database_oid
     OR attestation."executorRoleOid" <> (
       SELECT role.oid::BIGINT FROM pg_catalog.pg_roles AS role
       WHERE role.rolname = SESSION_USER
     )
  THEN
    RAISE EXCEPTION 'CURRENT194 runtime session identity changed'
      USING ERRCODE = '42501';
  END IF;

  IF attestation."status" = 'CONSUMED' THEN
    IF attestation."consumeRequestId" = consume_request_id
       AND attestation."consumeRequestDigest" = consume_request_digest
    THEN
      RETURN QUERY SELECT attestation."id", attestation."status",
        attestation."consumedAt", attestation."validUntil", TRUE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'CURRENT194 runtime attestation already consumed'
      USING ERRCODE = '55000';
  END IF;
  IF attestation."status" = 'EXPIRED' THEN
    IF attestation."consumeRequestId" = consume_request_id
       AND attestation."consumeRequestDigest" = consume_request_digest
    THEN
      RETURN QUERY SELECT attestation."id", attestation."status",
        attestation."consumedAt", attestation."validUntil", TRUE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'CURRENT194 runtime expiry replay mismatch'
      USING ERRCODE = '55000';
  END IF;
  IF attestation."status" = 'REVOKED' THEN
    RETURN QUERY SELECT attestation."id", attestation."status",
      attestation."consumedAt", attestation."validUntil", TRUE;
    RETURN;
  END IF;

  server_now := pg_catalog.clock_timestamp();
  PERFORM pg_catalog.set_config(
    'leetplus.langame_runtime_current194_writer', 'consume', TRUE
  );
  IF attestation."validUntil" <= server_now THEN
    UPDATE public."LangameRuntimeAttestationV1"
    SET "status" = 'EXPIRED', "consumeRequestId" = consume_request_id,
        "consumeRequestDigest" = consume_request_digest,
        "expiredAt" = server_now, "updatedAt" = server_now
    WHERE "id" = attestation."id"
    RETURNING * INTO attestation;
    INSERT INTO public."LangameRuntimeAttestationEventV1" (
      "id", "attestationId", "eventType", "requestDigest", "eventAt",
      "transactionId"
    ) VALUES (
      pg_catalog.gen_random_uuid()::TEXT, attestation."id", 'EXPIRED',
      consume_request_digest, server_now, pg_catalog.txid_current()::TEXT
    );
  ELSE
    UPDATE public."LangameRuntimeAttestationV1"
    SET "status" = 'CONSUMED', "consumeRequestId" = consume_request_id,
        "consumeRequestDigest" = consume_request_digest,
        "consumedAt" = server_now, "updatedAt" = server_now
    WHERE "id" = attestation."id"
    RETURNING * INTO attestation;
    INSERT INTO public."LangameRuntimeAttestationEventV1" (
      "id", "attestationId", "eventType", "requestDigest", "eventAt",
      "transactionId"
    ) VALUES (
      pg_catalog.gen_random_uuid()::TEXT, attestation."id", 'CONSUMED',
      consume_request_digest, server_now, pg_catalog.txid_current()::TEXT
    );
  END IF;
  RETURN QUERY SELECT attestation."id", attestation."status",
    attestation."consumedAt", attestation."validUntil", FALSE;
END;
$consume$;

CREATE FUNCTION public.langame_runtime_attestation_revoke_current194_v1(
  target_attestation_id TEXT,
  expected_payload_digest TEXT,
  revoke_request_id TEXT,
  revoke_request_digest TEXT,
  revocation_reason_digest TEXT
)
RETURNS TABLE (
  "attestationId" TEXT,
  "status" TEXT,
  "revokedAt" TIMESTAMP(3) WITH TIME ZONE,
  "replayed" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $revoke$
DECLARE
  attestation public."LangameRuntimeAttestationV1"%ROWTYPE;
  server_now TIMESTAMP(3) WITH TIME ZONE;
BEGIN
  IF target_attestation_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR expected_payload_digest !~ '^[a-f0-9]{64}$'
     OR revoke_request_id !~ '^[A-Za-z0-9_-]{16,128}$'
     OR revoke_request_digest !~ '^[a-f0-9]{64}$'
     OR revocation_reason_digest !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid CURRENT194 runtime revocation request'
      USING ERRCODE = '22023';
  END IF;
  SELECT candidate.* INTO attestation
  FROM public."LangameRuntimeAttestationV1" AS candidate
  WHERE candidate."id" = target_attestation_id
  FOR UPDATE;
  IF NOT FOUND OR attestation."payloadDigest" <> expected_payload_digest THEN
    RAISE EXCEPTION 'CURRENT194 runtime attestation is unavailable'
      USING ERRCODE = '42501';
  END IF;
  server_now := pg_catalog.clock_timestamp();
  IF attestation."status" = 'REVOKED' THEN
    IF attestation."revokeRequestId" = revoke_request_id
       AND attestation."revokeRequestDigest" = revoke_request_digest
       AND attestation."revocationReasonDigest" = revocation_reason_digest
    THEN
      RETURN QUERY SELECT attestation."id", attestation."status",
        attestation."revokedAt", TRUE;
      RETURN;
    END IF;
    RAISE EXCEPTION 'CURRENT194 runtime revocation replay mismatch'
      USING ERRCODE = '55000';
  END IF;
  IF attestation."status" = 'EXPIRED' THEN
    RAISE EXCEPTION 'CURRENT194 expired attestation cannot be revoked'
      USING ERRCODE = '55000';
  END IF;
  PERFORM pg_catalog.set_config(
    'leetplus.langame_runtime_current194_writer', 'revoke', TRUE
  );
  UPDATE public."LangameRuntimeAttestationV1"
  SET "status" = 'REVOKED', "revokeRequestId" = revoke_request_id,
      "revokeRequestDigest" = revoke_request_digest,
      "revocationReasonDigest" = revocation_reason_digest,
      "revokedAt" = server_now, "updatedAt" = server_now
  WHERE "id" = attestation."id"
  RETURNING * INTO attestation;
  INSERT INTO public."LangameRuntimeAttestationEventV1" (
    "id", "attestationId", "eventType", "requestDigest", "eventAt",
    "transactionId"
  ) VALUES (
    pg_catalog.gen_random_uuid()::TEXT, attestation."id", 'REVOKED',
    revoke_request_digest, server_now, pg_catalog.txid_current()::TEXT
  );
  RETURN QUERY SELECT attestation."id", attestation."status",
    attestation."revokedAt", FALSE;
END;
$revoke$;

REVOKE ALL ON TABLE public."LangameRuntimeAttestationV1" FROM PUBLIC;
REVOKE ALL ON TABLE public."LangameRuntimeAttestationEventV1" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_attestation_guard_current194_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_attestation_event_guard_current194_v1()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_attestation_register_current194_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, BIGINT,
  TEXT, BIGINT, TEXT, TEXT, TIMESTAMP(3) WITH TIME ZONE,
  TIMESTAMP(3) WITH TIME ZONE
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_attestation_consume_current194_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.langame_runtime_attestation_revoke_current194_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;

DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN (
        'LangameRuntimeAttestationV1',
        'LangameRuntimeAttestationEventV1'
      )
      AND grantee <> CURRENT_USER
  ) OR EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name LIKE 'langame_runtime_attestation%current194_v1'
      AND grantee <> CURRENT_USER
  ) THEN
    RAISE EXCEPTION 'CURRENT194 owner-only ACL verification failed';
  END IF;
END;
$acl$;

COMMIT;
